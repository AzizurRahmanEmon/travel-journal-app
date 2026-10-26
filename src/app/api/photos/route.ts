import { requireUser } from "@/lib/auth/guard";
import { withHandler } from "@/lib/handler";
import { create, list } from "@/lib/services/photo.service";
import type { ImageUpload } from "@/lib/validators/photo";

export const GET = withHandler(async (request) => {
  const { userId } = await requireUser(request);
  return list(userId);
});

export const POST = withHandler(async (request) => {
  const { userId } = await requireUser(request);
  const form = await request.formData();
  return create(userId, textFields(form), await imageUpload(form.get("image")));
});

function textFields(form: FormData) {
  return {
    name: form.get("name"),
    location: form.get("location"),
    description: form.get("description"),
  };
}

async function imageUpload(value: FormDataEntryValue | null): Promise<ImageUpload | null> {
  if (!(value instanceof File)) {
    return null;
  }
  return {
    buffer: Buffer.from(await value.arrayBuffer()),
    mime: value.type,
    size: value.size,
  };
}
