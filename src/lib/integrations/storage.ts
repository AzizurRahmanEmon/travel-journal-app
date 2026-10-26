import { createHash } from "node:crypto";
import { env } from "@/lib/env";

const FOLDER = "travel-journal";

type CloudinaryPayload = {
  secure_url?: unknown;
  public_id?: unknown;
  error?: { message?: string };
};

export async function uploadImage(
  buffer: Buffer,
  mime: string,
): Promise<{ url: string; publicId: string }> {
  const timestamp = unixTimestamp();
  const body = new FormData();
  body.append("file", new Blob([new Uint8Array(buffer)], { type: mime }), "image");
  body.append("folder", FOLDER);
  body.append("timestamp", timestamp);
  body.append("api_key", env.CLOUDINARY_API_KEY);
  body.append("signature", sign({ folder: FOLDER, timestamp }));

  const payload = await postCloudinary("upload", body);
  if (typeof payload.secure_url !== "string" || typeof payload.public_id !== "string") {
    throw new Error("Cloudinary upload did not return an image");
  }
  return { url: payload.secure_url, publicId: payload.public_id };
}

export async function deleteImage(publicId: string): Promise<void> {
  const timestamp = unixTimestamp();
  const body = new FormData();
  body.append("public_id", publicId);
  body.append("timestamp", timestamp);
  body.append("api_key", env.CLOUDINARY_API_KEY);
  body.append("signature", sign({ public_id: publicId, timestamp }));
  await postCloudinary("destroy", body);
}

function sign(params: Record<string, string>): string {
  // Cloudinary signs every param except the file and api_key.
  const serialized = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1").update(`${serialized}${env.CLOUDINARY_API_SECRET}`).digest("hex");
}

function endpoint(action: "upload" | "destroy"): string {
  return `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/${action}`;
}

async function postCloudinary(action: "upload" | "destroy", body: FormData): Promise<CloudinaryPayload> {
  const response = await fetch(endpoint(action), { method: "POST", body });
  const payload = (await response.json()) as CloudinaryPayload;
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message ?? `Cloudinary request failed (${response.status})`);
  }
  return payload;
}

function unixTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}
