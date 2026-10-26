import { authCookies } from "@/lib/auth/cookies";
import { withHandler } from "@/lib/handler";
import { rateLimit } from "@/lib/rate-limit";
import { login } from "@/lib/services/auth.service";

export const POST = withHandler(async (request) => {
  rateLimit(request, "POST /api/auth/login");
  const result = await login(await request.json());

  if (result.twoFactorRequired) {
    return {
      twoFactorRequired: true,
      pendingToken: result.pendingToken,
    };
  }

  return {
    data: { userId: result.userId },
    cookies: authCookies(result.accessToken, result.refreshToken),
  };
});
