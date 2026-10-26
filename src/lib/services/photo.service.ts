import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { photos } from "@/db/schema";
import { notFound } from "@/lib/errors";
import { deleteImage, uploadImage } from "@/lib/integrations/storage";
import { summarizeDescription } from "@/lib/integrations/summarizer";
import {
  createPhotoSchema,
  parseImage,
  updatePhotoSchema,
  type ImageUpload,
} from "@/lib/validators/photo";

type Photo = typeof photos.$inferSelect;

type PhotoText = {
  name: string;
  location: string;
  description: string;
};

export async function list(userId: string) {
  return db
    .select()
    .from(photos)
    .where(eq(photos.userId, userId))
    .orderBy(desc(photos.createdAt));
}

export async function get(userId: string, id: string) {
  return findOwned(userId, id);
}

export async function create(userId: string, input: unknown, file: ImageUpload | null) {
  const data = createPhotoSchema.parse(input);
  const image = parseImage(file);
  const uploaded = await uploadImage(image.buffer, image.mime);
  const photo = await insertPhoto(userId, data, uploaded);
  return withSummary(userId, photo);
}

export async function update(userId: string, id: string, input: unknown) {
  const data = updatePhotoSchema.parse(input);
  const previous = (await findOwned(userId, id)).description;
  const photo = await updateOwned(userId, id, changedFields(data));
  if (data.description === undefined || data.description === previous) {
    return photo;
  }
  return updateOwned(userId, id, { summary: await trySummarize(data.description) });
}

export async function remove(userId: string, id: string) {
  const photo = await findOwned(userId, id);
  await db.delete(photos).where(ownedBy(userId, id));
  await deleteImage(photo.imagePublicId);
}

async function insertPhoto(
  userId: string,
  data: PhotoText,
  uploaded: { url: string; publicId: string },
) {
  try {
    const [photo] = await db
      .insert(photos)
      .values({
        userId,
        imageUrl: uploaded.url,
        imagePublicId: uploaded.publicId,
        name: data.name,
        location: data.location,
        description: data.description,
      })
      .returning();

    if (!photo) {
      throw new Error("Photo insert did not return a row");
    }
    return photo;
  } catch (error) {
    // The row was not saved, so the upload would otherwise be left behind.
    await deleteImage(uploaded.publicId);
    throw error;
  }
}

async function withSummary(userId: string, photo: Photo) {
  const summary = await trySummarize(photo.description);
  if (summary === null) {
    return photo;
  }
  return updateOwned(userId, photo.id, { summary });
}

async function trySummarize(description: string): Promise<string | null> {
  try {
    return await summarizeDescription(description);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("Photo summary failed:", message);
    return null;
  }
}

function changedFields(data: { name?: string; location?: string; description?: string }) {
  return {
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.location !== undefined ? { location: data.location } : {}),
    ...(data.description !== undefined ? { description: data.description } : {}),
  };
}

async function findOwned(userId: string, id: string) {
  const [photo] = await db.select().from(photos).where(ownedBy(userId, id)).limit(1);
  if (!photo) {
    throw notFound("Photo not found");
  }
  return photo;
}

async function updateOwned(
  userId: string,
  id: string,
  values: Partial<Pick<Photo, "name" | "location" | "description" | "summary">>,
) {
  const [photo] = await db.update(photos).set(values).where(ownedBy(userId, id)).returning();
  if (!photo) {
    throw notFound("Photo not found");
  }
  return photo;
}

function ownedBy(userId: string, id: string) {
  return and(eq(photos.id, id), eq(photos.userId, userId));
}
