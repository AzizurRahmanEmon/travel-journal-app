import { z } from "zod";
import { badRequest, notFound } from "@/lib/errors";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const textField = (max: number) => z.string().trim().min(1).max(max);

export const createPhotoSchema = z.object({
  name: textField(100),
  location: textField(100),
  description: textField(2000),
});

export const updatePhotoSchema = z
  .object({
    name: textField(100).optional(),
    location: textField(100).optional(),
    description: textField(2000).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "At least one field is required",
  });

export type ImageUpload = {
  buffer: Buffer;
  mime: string;
  size: number;
};

export function parseImage(file: ImageUpload | null): { buffer: Buffer; mime: string } {
  if (!file || file.size === 0 || file.buffer.length === 0) {
    throw badRequest("Image is required");
  }
  if (file.size > MAX_IMAGE_BYTES || file.buffer.length > MAX_IMAGE_BYTES) {
    throw badRequest("Image must be 5 MB or smaller");
  }
  // Clients can claim any Content-Type, so the bytes have to match the MIME type.
  if (!hasSignature(file.buffer, file.mime)) {
    throw badRequest("Image must be a JPEG, PNG, or WebP file");
  }
  return { buffer: file.buffer, mime: file.mime };
}

export function clientImageError(file: { type: string; size: number }): string | null {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return "Image must be a JPEG, PNG, or WebP file";
  }
  if (file.size === 0) {
    return "Image is required";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "Image must be 5 MB or smaller";
  }
  return null;
}

export async function parsePhotoId(params: Promise<unknown>): Promise<string> {
  const resolved = await params;
  const id = isRecord(resolved) ? resolved.id : undefined;
  if (typeof id !== "string" || !z.uuid().safeParse(id).success) {
    throw notFound("Photo not found");
  }
  return id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const signatures: Record<string, (buffer: Buffer) => boolean> = {
  "image/jpeg": (buffer) => startsWith(buffer, [0xff, 0xd8, 0xff]),
  "image/png": (buffer) => startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/webp": (buffer) =>
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP",
};

function hasSignature(buffer: Buffer, mime: string): boolean {
  return signatures[mime]?.(buffer) ?? false;
}

function startsWith(buffer: Buffer, bytes: number[]): boolean {
  return bytes.every((byte, index) => buffer[index] === byte);
}
