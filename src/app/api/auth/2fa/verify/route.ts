import { authCookies } from "@/lib/auth/cookies";
import { requireUser } from "@/lib/auth/guard";
import { withHandler } from "@/lib/handler";
import { rateLimit } from "@/lib/rate-limit";
import { completeTwoFactorLogin, confirmTwoFactor } from "@/lib/services/auth.service";
import { verifyTwoFactorSchema } from "@/lib/validators/auth";

export const POST = withHandler(async (request) => {
  rateLimit(request, "POST /api/auth/2fa/verify");
  const body = verifyTwoFactorSchema.parse(await request.json());

  if (body.type === "setup") {
    const { userId } = await requireUser(request);
    return confirmTwoFactor(userId, body.code);
  }

  const session = await completeTwoFactorLogin(body.pendingToken, body.code);
  return {
    data: { userId: session.userId },
    cookies: authCookies(session.accessToken, session.refreshToken),
  };
});
