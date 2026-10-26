import { SignJWT, jwtVerify } from "jose";
import { AppError, unauthorized } from "@/lib/errors";
import { env } from "@/lib/env";

const ACCESS_TTL = "15m";
const PENDING_TTL = "5m";

type TokenPurpose = "access" | "2fa";

function accessSecret(): Uint8Array {
  return new TextEncoder().encode(env.JWT_ACCESS_SECRET);
}

export function signAccessToken(userId: string): Promise<string> {
  return signToken(userId, "access", ACCESS_TTL);
}

export function signPendingToken(userId: string): Promise<string> {
  return signToken(userId, "2fa", PENDING_TTL);
}

export function verifyAccessToken(token: string): Promise<{ userId: string }> {
  return readToken(token, "access");
}

export function verifyPendingToken(token: string): Promise<{ userId: string }> {
  return readToken(token, "2fa");
}

function signToken(userId: string, purpose: TokenPurpose, ttl: string): Promise<string> {
  return new SignJWT({ purpose })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(accessSecret());
}

async function readToken(token: string, purpose: TokenPurpose): Promise<{ userId: string }> {
  try {
    const { payload } = await jwtVerify(token, accessSecret(), { algorithms: ["HS256"] });
    if (payload.purpose !== purpose || typeof payload.sub !== "string" || payload.sub.length === 0) {
      throw unauthorized("Unauthorized");
    }
    return { userId: payload.sub };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw unauthorized("Unauthorized");
  }
}
