import { generate } from "otplib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as meRoute } from "@/app/api/auth/me/route";
import { POST as setupRoute } from "@/app/api/auth/2fa/setup/route";
import { POST as verifyRoute } from "@/app/api/auth/2fa/verify/route";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { decrypt, encrypt } from "@/lib/auth/crypto";
import { requireUser } from "@/lib/auth/guard";
import { signAccessToken } from "@/lib/auth/jwt";
import { secretFromOtpauthUrl } from "@/lib/auth/otpauth";
import { generateSecret, verifyCode } from "@/lib/auth/totp";
import { AppError } from "@/lib/errors";
import { login, setupTwoFactor } from "@/lib/services/auth.service";

const db = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/db/client", () => ({ db }));
vi.mock("@/lib/integrations/mailer", () => ({
  sendVerificationEmail: vi.fn(),
}));
vi.mock("@/lib/auth/password", () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(async () => true),
}));

type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  emailVerifiedAt: Date | null;
  totpEnabled: boolean;
  totpSecret: string | null;
};

describe("totp", () => {
  let user: UserRecord;

  beforeEach(() => {
    user = {
      id: "user-1",
      email: "user@example.com",
      passwordHash: "hash",
      emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
      totpEnabled: false,
      totpSecret: null,
    };
    vi.clearAllMocks();
    db.select.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([user]),
        }),
      }),
    }));
    db.update.mockImplementation(() => ({
      set: (values: Partial<UserRecord>) => ({
        where: () => {
          Object.assign(user, values);
          return Promise.resolve(undefined);
        },
      }),
    }));
    db.insert.mockImplementation(() => ({
      values: () => ({
        returning: () => Promise.resolve([{ id: "refresh-1" }]),
      }),
    }));
  });

  it("starts setup with an encrypted secret and a QR code", async () => {
    const response = await setupRoute(await authedRequest());
    const body = (await response.json()) as {
      data: { qrCode: string; otpauthUrl: string };
    };
    const secret = decrypt(storedSecret());

    expect(response.status).toBe(200);
    expect(body.data.qrCode).toMatch(/^data:image\/png;base64,/);
    expect(body.data.otpauthUrl).toContain("otpauth://totp/Travel%20Photo%20Journal");
    expect(body.data.otpauthUrl).toContain(encodeURIComponent(user.email));
    expect(body.data.otpauthUrl).toContain(`secret=${secret}`);
    expect(secretFromOtpauthUrl(body.data.otpauthUrl)).toBe(secret);
    expect(user.totpEnabled).toBe(false);
    expect(user.totpSecret).not.toBe(secret);
  });

  it("rejects setup when 2FA is already enabled", async () => {
    user.totpEnabled = true;
    user.totpSecret = "already-stored";

    const response = await setupRoute(await authedRequest());
    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("CONFLICT");
    expect(user.totpSecret).toBe("already-stored");
  });

  it("enables 2FA after a valid code and rejects an invalid one", async () => {
    await setupTwoFactor("user-1");
    const secret = decrypt(storedSecret());
    const code = await generate({ secret });

    const invalid = await verifyRoute(
      await authedRequest({ type: "setup", code: await wrongCode(secret) }),
    );
    expect(invalid.status).toBe(401);
    expect(user.totpEnabled).toBe(false);

    const valid = await verifyRoute(await authedRequest({ type: "setup", code }));
    const body = (await valid.json()) as { data: { enabled: boolean } };
    expect(valid.status).toBe(200);
    expect(body.data.enabled).toBe(true);
    expect(user.totpEnabled).toBe(true);
  });

  it("returns a pending token instead of a session when 2FA is on", async () => {
    user.totpEnabled = true;
    user.totpSecret = encrypt(generateSecret());

    const response = await loginRoute(
      jsonRequest("203.0.113.20", {
        email: "user@example.com",
        password: "Password1",
      }),
    );
    const body = (await response.json()) as { data: { twoFactorRequired: boolean; pendingToken: string } };

    expect(response.status).toBe(200);
    expect(body.data.twoFactorRequired).toBe(true);
    expect(body.data.pendingToken).toEqual(expect.any(String));
    expect(setCookies(response)).toHaveLength(0);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects the pending token as an access token", async () => {
    user.totpEnabled = true;
    const result = await login({ email: "user@example.com", password: "Password1" });
    if (!result.twoFactorRequired) {
      throw new Error("Expected a pending login");
    }

    const request = new Request("http://localhost/api/photos", {
      headers: { authorization: `Bearer ${result.pendingToken}` },
    });
    const error = await capture(() => requireUser(request));

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status: 401 });
  });

  it("completes login with a pending token and a valid code", async () => {
    const secret = generateSecret();
    user.totpEnabled = true;
    user.totpSecret = encrypt(secret);
    const pending = await login({ email: "user@example.com", password: "Password1" });
    if (!pending.twoFactorRequired) {
      throw new Error("Expected a pending login");
    }

    const response = await verifyRoute(
      jsonRequest(
        "203.0.113.30",
        { type: "login", pendingToken: pending.pendingToken, code: await generate({ secret }) },
        "/api/auth/2fa/verify",
      ),
    );
    const body = (await response.json()) as { data: { userId: string } };
    const cookies = setCookies(response);

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ userId: "user-1" });
    expect(cookies.some((cookie) => cookie.startsWith("access_token="))).toBe(true);
    expect(cookies.some((cookie) => cookie.includes("Path=/api/auth"))).toBe(true);
  });

  it("rejects a wrong code while completing login", async () => {
    const secret = generateSecret();
    user.totpEnabled = true;
    user.totpSecret = encrypt(secret);
    const pending = await login({ email: "user@example.com", password: "Password1" });
    if (!pending.twoFactorRequired) {
      throw new Error("Expected a pending login");
    }

    const response = await verifyRoute(
      jsonRequest(
        "203.0.113.31",
        { type: "login", pendingToken: pending.pendingToken, code: await wrongCode(secret) },
        "/api/auth/2fa/verify",
      ),
    );

    expect(response.status).toBe(401);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("returns 429 after 5 login attempts from the same IP", async () => {
    const body = { email: "user@example.com", password: "Password1" };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await loginRoute(jsonRequest("203.0.113.40", body));
      expect(response.status).toBe(200);
    }

    const blocked = await loginRoute(jsonRequest("203.0.113.40", body));
    const payload = (await blocked.json()) as { error: { code: string } };

    expect(blocked.status).toBe(429);
    expect(payload.error.code).toBe("RATE_LIMITED");
  });

  it("tells the client whether 2FA is enabled", async () => {
    user.totpEnabled = true;
    const response = await meRoute(await authedRequest());
    const body = (await response.json()) as { data: { userId: string; email: string; totpEnabled: boolean } };

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      userId: "user-1",
      email: user.email,
      emailVerified: true,
      totpEnabled: true,
    });
  });

  function storedSecret(): string {
    if (!user.totpSecret) {
      throw new Error("Expected a stored secret");
    }
    return user.totpSecret;
  }
});

async function wrongCode(secret: string): Promise<string> {
  for (const candidate of ["000000", "111111", "222222", "999999"]) {
    if (!(await verifyCode(candidate, secret))) {
      return candidate;
    }
  }
  throw new Error("Could not find an invalid code");
}

async function authedRequest(body?: unknown): Promise<Request> {
  const token = await signAccessToken("user-1");
  return new Request("http://localhost/api/auth/2fa/verify", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.10",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function jsonRequest(ip: string, body: unknown, path = "/api/auth/login"): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

function setCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const header = response.headers.get("set-cookie");
  return header ? [header] : [];
}

async function capture(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the call to throw");
}
