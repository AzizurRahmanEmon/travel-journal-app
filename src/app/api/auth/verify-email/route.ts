import { withHandler } from "@/lib/handler";
import { verifyEmail } from "@/lib/services/auth.service";

export const POST = withHandler(async (request) => {
  return verifyEmail(await request.json());
});
