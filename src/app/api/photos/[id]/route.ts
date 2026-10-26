import { requireUser } from "@/lib/auth/guard";
import { withHandler } from "@/lib/handler";
import { get, remove, update } from "@/lib/services/photo.service";
import { parsePhotoId } from "@/lib/validators/photo";

export const GET = withHandler(async (request, context) => {
  const { userId } = await requireUser(request);
  return get(userId, await parsePhotoId(context.params));
});

export const PUT = withHandler(async (request, context) => {
  const { userId } = await requireUser(request);
  return update(userId, await parsePhotoId(context.params), await request.json());
});

export const DELETE = withHandler(async (request, context) => {
  const { userId } = await requireUser(request);
  await remove(userId, await parsePhotoId(context.params));
  return new Response(null, { status: 204 });
});
