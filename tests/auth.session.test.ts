import { SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { refreshTokens } from "@/db/schema";
import { signAccessToken, signPendingToken, verifyAccessToken } from "@/lib/auth/jwt";
import { requireUser } from "@/lib/auth/guard";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { hashToken } from "@/lib/auth/tokens";
import { login, logout, refresh } from "@/lib/services/auth.service";

const PASSWORD_HASH = "$2b$12$L0u5SkZzy9CP9N0keW9OOuLvyRSvKWAVXRxRvIpy8M4Cy9wAuX6ri";

const db = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

const verifyPassword = vi.hoisted(() => vi.fn());

vi.mock("@/db/client", () => ({ db }));
vi.mock("@/lib/integrations/mailer", () => ({
  sendVerificationEmail: vi.fn(),
}));
vi.mock("@/lib/auth/password", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/password")>(
    "@/lib/auth/password",
  );
  verifyPassword.mockImplementation(actual.verifyPassword);
  return {
    hashPassword: actual.hashPassword,
    verifyPassword,
  };
});

type InsertCall = { table: unknown; values: Record<string, unknown> };
type UpdateCall = { values: Record<string, unknown> };

describe("session auth", () => {
  const inserted: InsertCall[] = [];
  const updates: UpdateCall[] = [];
  const queuedRows: unknown[][] = [];

  beforeEach(() => {
    inserted.length = 0;
    updates.length = 0;
    queuedRows.length = 0;
    vi.clearAllMocks();
    db.insert.mockImplementation((table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        inserted.push({ table, values });
        return { returning: () => Promise.resolve([{ id: "refresh-2" }]) };
      },
    }));
    db.select.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(queuedRows.shift() ?? []),
        }),
      }),
    }));
    db.update.mockImplementation(() => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          updates.push({ values });
          return Promise.resolve(undefined);
        },
      }),
    }));
  });

  it("logs in a verified user and sets auth cookies", async () => {
    queueUser();

    const response = await loginRoute(loginRequest("user@example.com", "Password1"));
    const body = (await response.json()) as { data: { userId: string; accessToken?: string } };
    const cookies = setCookies(response);
    const accessCookie = cookies.find((cookie) => cookie.startsWith("access_token="));
    const refreshCookie = cookies.find((cookie) => cookie.startsWith("refresh_token="));
    const refreshValue = cookieValue(refreshCookie, "refresh_token");
    const stored = inserted.find((call) => call.table === refreshTokens);

    expect(response.status).toBe(200);
    expect(body).toEqual({ data: { userId: "user-1" } });
    expect(accessCookie).toContain("HttpOnly");
    expect(accessCookie).toContain("SameSite=Lax");
    expect(accessCookie).toContain("Path=/");
    expect(accessCookie).toContain("Max-Age=900");
    expect(refreshCookie).toContain("Path=/api/auth");
    expect(refreshCookie).toContain("HttpOnly");
    expect(refreshCookie).toContain("SameSite=Lax");
    expect(refreshCookie).toContain("Max-Age=604800");
    expectSecure(cookieAttributes(accessCookie));
    expectSecure(cookieAttributes(refreshCookie));
    expect(stored?.values.tokenHash).toBe(hashToken(refreshValue));
    expect(stored?.values.userId).toBe("user-1");

    const expiresAt = stored?.values.expiresAt as Date;
    const week = 7 * 24 * 60 * 60 * 1000;
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + week - 5_000);
    expect(expiresAt.getTime()).toBeLessThan(Date.now() + week + 5_000);
    await expect(verifyAccessToken(cookieValue(accessCookie, "access_token"))).resolves.toEqual({
      userId: "user-1",
    });
  });

  it("rejects a wrong password without revealing the account", async () => {
    queueUser();

    const error = await capture(() => login({ email: "user@example.com", password: "Password2" }));

    expect(error).toMatchObject({ status: 401, message: "Invalid credentials" });
    expect(verifyPassword).toHaveBeenCalledWith("Password2", PASSWORD_HASH);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects an unknown email after comparing a password", async () => {
    queuedRows.push([]);

    const error = await capture(() =>
      login({ email: "missing@example.com", password: "Password1" }),
    );

    expect(error).toMatchObject({ status: 401, message: "Invalid credentials" });
    expect(verifyPassword).toHaveBeenCalledTimes(1);
    const hash = verifyPassword.mock.calls[0]?.[1];
    expect(hash).not.toBe(PASSWORD_HASH);
    expect(typeof hash).toBe("string");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects an unverified user after the password matches", async () => {
    queueUser({ emailVerifiedAt: null });

    const error = await capture(() => login({ email: "user@example.com", password: "Password1" }));

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status: 403, code: "EMAIL_NOT_VERIFIED" });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rotates a refresh token and links the replacement", async () => {
    queuedRows.push([refreshRow({ revokedAt: null })]);

    const session = await refresh("current-token");
    const stored = inserted.find((call) => call.table === refreshTokens);

    expect(session.userId).toBe("user-1");
    expect(stored?.values.tokenHash).toBe(hashToken(session.refreshToken));
    expect(updates[0]?.values.replacedBy).toBe("refresh-2");
    expect(updates[0]?.values.revokedAt).toBeInstanceOf(Date);
    await expect(verifyAccessToken(session.accessToken)).resolves.toEqual({ userId: "user-1" });
  });

  it("revokes every refresh token when a revoked token is reused", async () => {
    queuedRows.push([refreshRow({ revokedAt: null })]);
    await refresh("current-token");
    queuedRows.push([refreshRow({ revokedAt: new Date() })]);

    const error = await capture(() => refresh("current-token"));

    expect(error).toMatchObject({ status: 401 });
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(updates[1]?.values.revokedAt).toBeInstanceOf(Date);
    expect(updates[1]?.values.replacedBy).toBeUndefined();
  });

  it("revokes the current refresh token on logout", async () => {
    queuedRows.push([refreshRow({ revokedAt: null })]);

    await logout("current-token");

    expect(updates).toEqual([{ values: { revokedAt: expect.any(Date) } }]);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects a missing access token", async () => {
    const error = await capture(() => requireUser(new Request("http://localhost/api/auth/me")));

    expect(error).toMatchObject({ status: 401, code: "UNAUTHORIZED" });
  });

  it("rejects an expired access token", async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-1")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(env.JWT_ACCESS_SECRET));
    const request = new Request("http://localhost/api/auth/me", {
      headers: { cookie: `access_token=${token}` },
    });

    const error = await capture(() => requireUser(request));

    expect(error).toMatchObject({ status: 401, code: "UNAUTHORIZED" });
  });

  it("rejects a 2FA pending token used as an access token", async () => {
    const token = await signPendingToken("user-1");
    const request = new Request("http://localhost/api/auth/me", {
      headers: { authorization: `Bearer ${token}` },
    });

    const error = await capture(() => requireUser(request));

    expect(error).toMatchObject({ status: 401, code: "UNAUTHORIZED" });
  });

  it("accepts a valid access cookie or bearer token", async () => {
    const token = await signAccessToken("user-1");
    const cookieRequest = new Request("http://localhost/api/photos", {
      headers: { cookie: `access_token=${token}` },
    });
    const bearerRequest = new Request("http://localhost/api/photos", {
      headers: { authorization: `Bearer ${token}` },
    });

    await expect(requireUser(cookieRequest)).resolves.toEqual({ userId: "user-1" });
    await expect(requireUser(bearerRequest)).resolves.toEqual({ userId: "user-1" });
  });

  function queueUser(overrides: { emailVerifiedAt?: Date | null; totpEnabled?: boolean } = {}) {
    queuedRows.push([
      {
        id: "user-1",
        passwordHash: PASSWORD_HASH,
        emailVerifiedAt: new Date("2026-01-01T00:00:00Z"),
        totpEnabled: false,
        ...overrides,
      },
    ]);
  }
});

function refreshRow(overrides: { revokedAt: Date | null }) {
  return {
    id: "refresh-1",
    userId: "user-1",
    tokenHash: "stored-hash",
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: overrides.revokedAt,
    replacedBy: null,
  };
}

function loginRequest(email: string, password: string): Request {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
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

function expectSecure(attributes: string) {
  if (process.env.NODE_ENV === "production") {
    expect(attributes).toContain("Secure");
    return;
  }
  expect(attributes).not.toContain("Secure");
}

function cookieAttributes(cookie: string | undefined): string {
  return cookie?.split(";").slice(1).join(";") ?? "";
}

function cookieValue(cookie: string | undefined, name: string): string {
  const pair = cookie?.split(";")[0] ?? "";
  return decodeURIComponent(pair.slice(name.length + 1));
}

async function capture(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the call to throw");
}
