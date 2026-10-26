import { clearAuthCookies, readRefreshToken } from "@/lib/auth/cookies";
import { withHandler } from "@/lib/handler";
import { logout } from "@/lib/services/auth.service";

export const POST = withHandler(async (request) => {
  await logout(readRefreshToken(request));
  return { data: { ok: true }, cookies: clearAuthCookies() };
});
