import { authCookies, readRefreshToken } from "@/lib/auth/cookies";
import { unauthorized } from "@/lib/errors";
import { withHandler } from "@/lib/handler";
import { refresh } from "@/lib/services/auth.service";

export const POST = withHandler(async (request) => {
  const token = readRefreshToken(request);
  if (!token) {
    throw unauthorized("Unauthorized");
  }

  const session = await refresh(token);
  return {
    data: { userId: session.userId },
    cookies: authCookies(session.accessToken, session.refreshToken),
  };
});
