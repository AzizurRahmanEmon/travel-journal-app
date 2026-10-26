import { withHandler } from "@/lib/handler";
import { register } from "@/lib/services/auth.service";

export const POST = withHandler(async (request) => {
  return register(await request.json());
});
