import { requireUser } from "@/lib/auth/guard";
import { withHandler } from "@/lib/handler";
import { currentUser } from "@/lib/services/auth.service";

export const GET = withHandler(async (request) => {
  const { userId } = await requireUser(request);
  return currentUser(userId);
});
