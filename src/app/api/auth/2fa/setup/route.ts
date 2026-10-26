import { requireUser } from "@/lib/auth/guard";
import { withHandler } from "@/lib/handler";
import { setupTwoFactor } from "@/lib/services/auth.service";

export const POST = withHandler(async (request) => {
  const { userId } = await requireUser(request);
  return setupTwoFactor(userId);
});
