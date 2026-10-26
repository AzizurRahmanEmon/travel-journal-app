import { authCookies } from "@/lib/auth/cookies";
import { requireUser } from "@/lib/auth/guard";
import { withHandler } from "@/lib/handler";
import { rateLimit } from "@/lib/rate-limit";
import { changePassword } from "@/lib/services/auth.service";

export const POST = withHandler(async (request) => {
  rateLimit(request, "POST /api/auth/change-password");
  const { userId } = await requireUser(request);
  const session = await changePassword(userId, await request.json());
  return {
    data: { userId: session.userId },
    cookies: authCookies(session.accessToken, session.refreshToken),
  };
});
