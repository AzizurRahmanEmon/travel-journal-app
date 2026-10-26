import { withHandler } from "@/lib/handler";
import { register } from "@/lib/services/auth.service";

export const POST = withHandler(async (request) => {
  return Response.json({ data: await register(await request.json()) }, { status: 201 });
});
