import { ZodError } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emailVerificationTokens, users } from "@/db/schema";
import { hashToken } from "@/lib/auth/tokens";
import { AppError } from "@/lib/errors";
import { register, verifyEmail } from "@/lib/services/auth.service";

const db = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

const sendVerificationEmail = vi.hoisted(() => vi.fn());

vi.mock("@/db/client", () => ({ db }));
vi.mock("@/lib/integrations/mailer", () => ({ sendVerificationEmail }));

const validInput = {
  email: "  User@Example.com ",
  password: "Password1!",
  confirmPassword: "Password1!",
};

type InsertCall = {
  table: unknown;
  values: Record<string, unknown>;
};

describe("auth.service", () => {
  const inserted: InsertCall[] = [];

  beforeEach(() => {
    inserted.length = 0;
    vi.clearAllMocks();
    sendVerificationEmail.mockResolvedValue(undefined);
    db.delete.mockReturnValue({ where: () => Promise.resolve(undefined) });
    db.update.mockReturnValue({
      set: () => ({ where: () => Promise.resolve(undefined) }),
    });
    db.insert.mockImplementation((table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        inserted.push({ table, values });
        if (table === users) {
          return { returning: () => Promise.resolve([{ id: "user-1" }]) };
        }
        return Promise.resolve(undefined);
      },
    }));
  });

  it("registers an unverified user and emails a hashed token", async () => {
    const result = await register(validInput);

    expect(result).toEqual({ userId: "user-1" });
    const userInsert = inserted.find((call) => call.table === users);
    const tokenInsert = inserted.find((call) => call.table === emailVerificationTokens);
    expect(userInsert?.values.email).toBe("user@example.com");
    expect(userInsert?.values.passwordHash).not.toBe(validInput.password);
    expect(String(userInsert?.values.passwordHash).startsWith("$2")).toBe(true);

    const link = sendVerificationEmail.mock.calls[0]?.[1] as string;
    const token = new URL(link).searchParams.get("token");
    expect(sendVerificationEmail).toHaveBeenCalledWith("user@example.com", link);
    expect(token).toBeTruthy();
    expect(tokenInsert?.values.tokenHash).toBe(hashToken(token ?? ""));
    expect(tokenInsert?.values.userId).toBe("user-1");

    const expiresAt = tokenInsert?.values.expiresAt as Date;
    const day = 24 * 60 * 60 * 1000;
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + day - 5_000);
    expect(expiresAt.getTime()).toBeLessThan(Date.now() + day + 5_000);
  });

  it("returns a conflict when the email is already registered", async () => {
    db.insert.mockImplementation(() => ({
      values: () => ({
        returning: () => Promise.reject(Object.assign(new Error("duplicate"), { code: "23505" })),
      }),
    }));

    const error = await capture(() => register(validInput));

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status: 409, code: "CONFLICT" });
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("rejects invalid input before writing", async () => {
    const error = await capture(() =>
      register({ email: "not-an-email", password: "short", confirmPassword: "short" }),
    );

    expect(error).toBeInstanceOf(ZodError);
    expect(db.insert).not.toHaveBeenCalled();
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("rejects a weak password", async () => {
    const error = await capture(() =>
      register({ email: "user@example.com", password: "password", confirmPassword: "password" }),
    );

    expect(error).toBeInstanceOf(ZodError);
    expect((error as ZodError).issues.some((issue) => issue.message === "One uppercase letter")).toBe(true);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects a password confirmation that does not match", async () => {
    const error = await capture(() =>
      register({
        email: "user@example.com",
        password: "Password1!",
        confirmPassword: "Password2!",
      }),
    );

    expect(error).toBeInstanceOf(ZodError);
    expect((error as ZodError).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["confirmPassword"],
          message: "Passwords don't match",
        }),
      ]),
    );
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects an expired verification token", async () => {
    mockToken({
      id: "token-1",
      userId: "user-1",
      usedAt: null,
      expiresAt: new Date(Date.now() - 1_000),
    });

    const error = await capture(() => verifyEmail({ token: "expired-token" }));

    expect(error).toMatchObject({
      status: 400,
      message: "Verification link has expired",
    });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects a reused verification token", async () => {
    mockToken({
      id: "token-1",
      userId: "user-1",
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const error = await capture(() => verifyEmail({ token: "used-token" }));

    expect(error).toMatchObject({
      status: 400,
      message: "Verification link has already been used",
    });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects an unknown verification token", async () => {
    db.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    });

    const error = await capture(() => verifyEmail({ token: "missing" }));

    expect(error).toMatchObject({
      status: 400,
      message: "Invalid verification link",
    });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("marks the user verified and consumes the token", async () => {
    mockToken({
      id: "token-1",
      userId: "user-1",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const updates: Array<{ table: unknown; values: Record<string, unknown> }> = [];
    db.update.mockImplementation((table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          updates.push({ table, values });
          return Promise.resolve(undefined);
        },
      }),
    }));

    await expect(verifyEmail({ token: "valid-token" })).resolves.toEqual({ verified: true });
    expect(updates.map((update) => update.table)).toEqual([users, emailVerificationTokens]);
    expect(updates[0]?.values.emailVerifiedAt).toBeInstanceOf(Date);
    expect(updates[1]?.values.usedAt).toBeInstanceOf(Date);
  });
});

function mockToken(row: {
  id: string;
  userId: string;
  usedAt: Date | null;
  expiresAt: Date;
}) {
  db.select.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve([row]),
      }),
    }),
  });
}

async function capture(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the call to throw");
}
