import { readAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { unauthorized } from "@/lib/errors";

export async function requireUser(request: Request): Promise<{ userId: string }> {
  const token = bearerToken(request) ?? readAccessToken(request);
  if (!token) {
    throw unauthorized("Unauthorized");
  }
  return verifyAccessToken(token);
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(\S+)/i.exec(header);
  return match?.[1] ?? null;
}
