import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { emailVerificationTokens, refreshTokens, users } from "@/db/schema";
import { signAccessToken, signPendingToken, verifyPendingToken } from "@/lib/auth/jwt";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { decrypt, encrypt } from "@/lib/auth/crypto";
import { buildOtpauthUrl, generateSecret, toQrDataUrl, verifyCode } from "@/lib/auth/totp";
import { AppError, badRequest, conflict, unauthorized } from "@/lib/errors";
import { env } from "@/lib/env";
import { sendVerificationEmail } from "@/lib/integrations/mailer";
import {
  changePasswordSchema,
  disableTwoFactorSchema,
  loginSchema,
  registerSchema,
  verifyEmailSchema,
} from "@/lib/validators/auth";

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DUMMY_PASSWORD_HASH = "$2b$12$p4yLe0YYaoTVQFveqIhnJ.4PjBs.BqcsEH74NO/KrxsFTHl4GgRQa";

export async function register(input: unknown) {
  const data = registerSchema.parse(input);
  const passwordHash = await hashPassword(data.password);
  const userId = await createUnverifiedUser(data.email, passwordHash);

  try {
    const token = generateToken();
    await saveVerificationToken(userId, token);
    await sendVerificationEmail(data.email, verificationLink(token));
  } catch (error) {
    await removeUser(userId);
    throw error;
  }

  return { userId };
}

export async function verifyEmail(input: unknown) {
  const { token } = verifyEmailSchema.parse(input);
  const [row] = await db
    .select()
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.tokenHash, hashToken(token)))
    .limit(1);

  if (!row) {
    throw badRequest("Invalid verification link");
  }
  if (row.usedAt) {
    throw badRequest("Verification link has already been used");
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    throw badRequest("Verification link has expired");
  }

  const verifiedAt = new Date();
  await db.update(users).set({ emailVerifiedAt: verifiedAt }).where(eq(users.id, row.userId));
  await db
    .update(emailVerificationTokens)
    .set({ usedAt: verifiedAt })
    .where(eq(emailVerificationTokens.id, row.id));

  return { verified: true as const };
}

async function createUnverifiedUser(email: string, passwordHash: string) {
  try {
    const [user] = await db
      .insert(users)
      .values({ email, passwordHash })
      .returning({ id: users.id });

    if (!user) {
      throw new Error("User insert did not return an id");
    }

    return user.id;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict("Email already registered");
    }
    throw error;
  }
}

async function saveVerificationToken(userId: string, token: string) {
  await db.insert(emailVerificationTokens).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
  });
}

async function removeUser(userId: string) {
  // Surface the original registration failure even if this cleanup fails.
  try {
    await db.delete(users).where(eq(users.id, userId));
  } catch (error) {
    console.error(error);
  }
}

function verificationLink(token: string) {
  const base = env.APP_URL.replace(/\/$/, "");
  return `${base}/verify?token=${encodeURIComponent(token)}`;
}

export async function login(input: unknown) {
  const data = loginSchema.parse(input);
  const user = await findUserByEmail(data.email);
  const passwordMatches = await verifyPassword(
    data.password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!user || !passwordMatches) {
    throw unauthorized("Invalid credentials");
  }
  if (!user.emailVerifiedAt) {
    throw new AppError("EMAIL_NOT_VERIFIED", 403, "Email is not verified");
  }
  if (user.totpEnabled) {
    return startTwoFactor(user.id);
  }
  const session = await issueSession(user.id);
  return { twoFactorRequired: false as const, ...session };
}

export async function refresh(token: string) {
  const current = await findRefreshToken(token);
  if (!current) {
    throw unauthorized("Unauthorized");
  }
  if (current.revokedAt) {
    await rejectReusedRefreshToken(current.userId);
  }
  if (current.expiresAt.getTime() <= Date.now()) {
    throw unauthorized("Unauthorized");
  }

  const refreshToken = generateToken();
  const nextId = await storeRefreshToken(current.userId, refreshToken);
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date(), replacedBy: nextId })
    .where(eq(refreshTokens.id, current.id));

  return {
    userId: current.userId,
    accessToken: await signAccessToken(current.userId),
    refreshToken,
  };
}

export async function logout(token: string | null) {
  if (!token) {
    return;
  }

  const current = await findRefreshToken(token);
  if (!current || current.revokedAt) {
    return;
  }

  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, current.id));
}

export async function currentUser(userId: string) {
  const user = await findUserById(userId);
  if (!user) {
    throw unauthorized("Unauthorized");
  }
  return {
    userId: user.id,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    totpEnabled: user.totpEnabled,
  };
}

export async function issueSession(userId: string) {
  const refreshToken = generateToken();
  await storeRefreshToken(userId, refreshToken);
  return {
    userId,
    accessToken: await signAccessToken(userId),
    refreshToken,
  };
}

async function startTwoFactor(userId: string) {
  return {
    twoFactorRequired: true as const,
    pendingToken: await signPendingToken(userId),
  };
}

async function findUserByEmail(email: string) {
  const [user] = await db
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      emailVerifiedAt: users.emailVerifiedAt,
      totpEnabled: users.totpEnabled,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return user ?? null;
}

export async function changePassword(userId: string, input: unknown) {
  const data = changePasswordSchema.parse(input);
  const user = await requireAccount(userId);
  await assertCurrentPassword(data.currentPassword, user.passwordHash);
  await assertDifferentPassword(data.currentPassword, data.newPassword, user.passwordHash);
  await assertChangeCode(user, data.code);
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(data.newPassword) })
    .where(eq(users.id, userId));
  await revokeRefreshTokens(userId);
  return issueSession(userId);
}

export async function disableTwoFactor(userId: string, input: unknown) {
  const data = disableTwoFactorSchema.parse(input);
  const user = await requireAccount(userId);
  if (!user.totpEnabled || !user.totpSecret) {
    throw badRequest("Two-factor authentication is not enabled");
  }
  await assertCurrentPassword(data.currentPassword, user.passwordHash);
  await assertTotpCode(user.totpSecret, data.code);
  await db
    .update(users)
    .set({ totpSecret: null, totpEnabled: false })
    .where(eq(users.id, userId));
  return { enabled: false as const };
}

export async function setupTwoFactor(userId: string) {
  const user = await findUserById(userId);
  if (!user) {
    throw unauthorized("Unauthorized");
  }
  if (user.totpEnabled) {
    throw conflict("Two-factor authentication is already enabled");
  }

  const secret = generateSecret();
  await db
    .update(users)
    .set({ totpSecret: encrypt(secret), totpEnabled: false })
    .where(eq(users.id, userId));

  const otpauthUrl = buildOtpauthUrl(user.email, secret);
  return {
    qrCode: await toQrDataUrl(otpauthUrl),
    otpauthUrl,
  };
}

export async function confirmTwoFactor(userId: string, code: string) {
  const user = await findUserById(userId);
  if (!user) {
    throw unauthorized("Unauthorized");
  }
  if (user.totpEnabled) {
    throw conflict("Two-factor authentication is already enabled");
  }
  if (!user.totpSecret) {
    throw badRequest("Two-factor setup has not been started");
  }

  await assertTotpCode(user.totpSecret, code);
  await db.update(users).set({ totpEnabled: true }).where(eq(users.id, userId));
  return { enabled: true as const };
}

export async function completeTwoFactorLogin(pendingToken: string, code: string) {
  const { userId } = await verifyPendingToken(pendingToken);
  const user = await findUserById(userId);
  if (!user?.totpEnabled || !user.totpSecret) {
    throw unauthorized("Unauthorized");
  }

  await assertTotpCode(user.totpSecret, code);
  return issueSession(userId);
}

async function requireAccount(userId: string) {
  const user = await findUserById(userId);
  if (!user) {
    throw unauthorized("Unauthorized");
  }
  return user;
}

async function assertCurrentPassword(password: string, passwordHash: string) {
  if (!(await verifyPassword(password, passwordHash))) {
    throw unauthorized("Current password is incorrect");
  }
}

async function assertDifferentPassword(current: string, next: string, passwordHash: string) {
  if (next === current || (await verifyPassword(next, passwordHash))) {
    throw badRequest("New password must be different from the current password");
  }
}

async function assertChangeCode(user: { totpEnabled: boolean; totpSecret: string | null }, code?: string) {
  if (!user.totpEnabled) {
    return;
  }
  if (!code || !user.totpSecret) {
    throw badRequest("Authentication code is required");
  }
  await assertTotpCode(user.totpSecret, code);
}

async function revokeRefreshTokens(userId: string) {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.userId, userId));
}

async function findUserById(userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      emailVerifiedAt: users.emailVerifiedAt,
      totpSecret: users.totpSecret,
      totpEnabled: users.totpEnabled,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user ?? null;
}

async function assertTotpCode(encryptedSecret: string, code: string) {
  if (!(await verifyCode(code, decrypt(encryptedSecret)))) {
    throw unauthorized("Invalid authentication code");
  }
}

async function findRefreshToken(token: string) {
  const [row] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hashToken(token)))
    .limit(1);

  return row ?? null;
}

async function storeRefreshToken(userId: string, token: string) {
  const [row] = await db
    .insert(refreshTokens)
    .values({
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    })
    .returning({ id: refreshTokens.id });

  if (!row) {
    throw new Error("Refresh token insert did not return an id");
  }

  return row.id;
}

async function rejectReusedRefreshToken(userId: string): Promise<never> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  throw unauthorized("Unauthorized");
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  if ("code" in error && error.code === "23505") {
    return true;
  }
  if ("cause" in error && error.cause !== error) {
    return isUniqueViolation(error.cause);
  }
  return false;
}
