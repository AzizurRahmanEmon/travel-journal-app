import { generate } from "otplib";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as changeRoute } from "@/app/api/auth/change-password/route";
import { POST as disableRoute } from "@/app/api/auth/2fa/disable/route";
import { encrypt } from "@/lib/auth/crypto";
import { signAccessToken } from "@/lib/auth/jwt";
import { hashPassword } from "@/lib/auth/password";
import { generateSecret, verifyCode } from "@/lib/auth/totp";
import { AppError } from "@/lib/errors";
import { changePassword, disableTwoFactor } from "@/lib/services/auth.service";
import { ZodError } from "zod";

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

type AccountUser = {
  id: string;
  email: string;
  passwordHash: string;
  emailVerifiedAt: Date | null;
  totpEnabled: boolean;
  totpSecret: string | null;
};

describe("account security", () => {
  let passwordHash = "";
  let accessToken = "";
  let user: AccountUser;
  let events: string[];

  beforeAll(async () => {
    passwordHash = await hashPassword("Password1!");
    accessToken = await signAccessToken("user-1");
  });

  beforeEach(() => {
    events = [];
    user = {
      id: "user-1",
      email: "user@example.com",
      passwordHash,
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
      set: (values: Partial<AccountUser> & { revokedAt?: Date }) => ({
        where: () => {
          if ("passwordHash" in values) events.push("password");
          if ("revokedAt" in values) events.push("revoke");
          Object.assign(user, values);
          return Promise.resolve(undefined);
        },
      }),
    }));
    db.insert.mockImplementation(() => ({
      values: () => ({
        returning: () => {
          events.push("session");
          return Promise.resolve([{ id: "refresh-2" }]);
        },
      }),
    }));
  });

  it("changes the password, revokes other sessions, and issues a new one", async () => {
    const response = await changeRoute(authedRequest({
      currentPassword: "Password1!",
      newPassword: "Password2!",
      confirmPassword: "Password2!",
    }));
    const cookies = setCookies(response);

    expect(response.status).toBe(200);
    expect(events).toEqual(["password", "revoke", "session"]);
    expect(user.passwordHash).not.toBe(passwordHash);
    expect(String(user.passwordHash).startsWith("$2")).toBe(true);
    expect(cookies.some((cookie) => cookie.startsWith("access_token="))).toBe(true);
    expect(cookies.some((cookie) => cookie.startsWith("refresh_token="))).toBe(true);
  });

  it("rejects a wrong current password", async () => {
    const error = await capture(() =>
      changePassword("user-1", {
        currentPassword: "Password2!",
        newPassword: "Password3!",
        confirmPassword: "Password3!",
      }),
    );

    expect(error).toMatchObject({ status: 401, message: "Current password is incorrect" });
    expect(events).toEqual([]);
  });

  it("rejects a weak new password", async () => {
    const error = await capture(() =>
      changePassword("user-1", {
        currentPassword: "Password1!",
        newPassword: "password",
        confirmPassword: "password",
      }),
    );

    expect(error).toBeInstanceOf(ZodError);
    expect((error as ZodError).issues.some((issue) => issue.message === "One uppercase letter")).toBe(true);
    expect(events).toEqual([]);
  });

  it("rejects a new password that matches the current one", async () => {
    const error = await capture(() =>
      changePassword("user-1", {
        currentPassword: "Password1!",
        newPassword: "Password1!",
        confirmPassword: "Password1!",
      }),
    );

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      status: 400,
      message: "New password must be different from the current password",
    });
    expect(events).toEqual([]);
  });

  it("requires a valid authenticator code when 2FA is enabled", async () => {
    const secret = generateSecret();
    user.totpEnabled = true;
    user.totpSecret = encrypt(secret);
    const next = {
      currentPassword: "Password1!",
      newPassword: "Password2!",
      confirmPassword: "Password2!",
    };

    const missing = await capture(() => changePassword("user-1", next));
    expect(missing).toMatchObject({ status: 400, message: "Authentication code is required" });

    const bad = await capture(async () => changePassword("user-1", { ...next, code: await wrongCode(secret) }));
    expect(bad).toMatchObject({ status: 401, message: "Invalid authentication code" });
    expect(events).toEqual([]);

    await changePassword("user-1", { ...next, code: await generate({ secret }) });
    expect(events).toEqual(["password", "revoke", "session"]);
  });

  it("rejects a bad code when disabling 2FA and accepts a good one", async () => {
    const secret = generateSecret();
    user.totpEnabled = true;
    user.totpSecret = encrypt(secret);

    const bad = await capture(async () =>
      disableTwoFactor("user-1", { currentPassword: "Password1!", code: await wrongCode(secret) }),
    );
    expect(bad).toMatchObject({ status: 401, message: "Invalid authentication code" });
    expect(user.totpEnabled).toBe(true);
    expect(user.totpSecret).toBeTruthy();

    const result = await disableTwoFactor("user-1", {
      currentPassword: "Password1!",
      code: await generate({ secret }),
    });
    expect(result).toEqual({ enabled: false });
    expect(user.totpEnabled).toBe(false);
    expect(user.totpSecret).toBeNull();
  });

  it("rate-limits password changes and 2FA disable", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await changeRoute(authedRequest({}, "203.0.113.80"));
      expect(response.status).toBe(400);
    }
    const blocked = await changeRoute(authedRequest({}, "203.0.113.80"));
    expect(blocked.status).toBe(429);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await disableRoute(authedRequest({}, "203.0.113.81", "/api/auth/2fa/disable"));
      expect(response.status).toBe(400);
    }
    const disableBlocked = await disableRoute(authedRequest({}, "203.0.113.81", "/api/auth/2fa/disable"));
    expect(disableBlocked.status).toBe(429);
  });

  function authedRequest(body: unknown, ip = "203.0.113.70", path = "/api/auth/change-password"): Request {
    return new Request(`http://localhost${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify(body),
    });
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

async function capture(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the call to throw");
}

function setCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const header = response.headers.get("set-cookie");
  return header ? [header] : [];
}
