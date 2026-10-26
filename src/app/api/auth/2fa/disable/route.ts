import { requireUser } from "@/lib/auth/guard";
import { withHandler } from "@/lib/handler";
import { rateLimit } from "@/lib/rate-limit";
import { disableTwoFactor } from "@/lib/services/auth.service";

export const POST = withHandler(async (request) => {
  rateLimit(request, "POST /api/auth/2fa/disable");
  const { userId } = await requireUser(request);
  return disableTwoFactor(userId, await request.json());
});
