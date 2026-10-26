import { isProduction } from "@/lib/env";

const ACCESS_COOKIE = "access_token";
const REFRESH_COOKIE = "refresh_token";
const ACCESS_MAX_AGE = 15 * 60;
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60;
const ACCESS_PATH = "/";
const REFRESH_PATH = "/api/auth";

export function authCookies(accessToken: string, refreshToken: string): string[] {
  return [
    serialize(ACCESS_COOKIE, accessToken, ACCESS_MAX_AGE, ACCESS_PATH),
    serialize(REFRESH_COOKIE, refreshToken, REFRESH_MAX_AGE, REFRESH_PATH),
  ];
}

export function clearAuthCookies(): string[] {
  return [
    serialize(ACCESS_COOKIE, "", 0, ACCESS_PATH),
    serialize(REFRESH_COOKIE, "", 0, REFRESH_PATH),
  ];
}

export function readAccessToken(request: Request): string | null {
  return readCookie(request, ACCESS_COOKIE);
}

export function readRefreshToken(request: Request): string | null {
  return readCookie(request, REFRESH_COOKIE);
}

function serialize(name: string, value: string, maxAge: number, path: string): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "SameSite=Lax",
    `Path=${path}`,
    `Max-Age=${maxAge}`,
  ];
  if (isProduction()) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) {
    return null;
  }

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) {
      continue;
    }
    if (part.slice(0, separator).trim() !== name) {
      continue;
    }

    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }

  return null;
}
