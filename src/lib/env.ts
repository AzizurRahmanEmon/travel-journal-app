import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_MODEL: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().min(1),
  TOTP_ENCRYPTION_KEY: z.string().min(1),
  APP_URL: z.url(),
});

type Env = z.infer<typeof schema>;

function readEnv<K extends keyof Env>(key: K): Env[K] {
  const parsed = schema.shape[key].safeParse(process.env[key]);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => issue.message).join(", ");
    throw new Error(`Invalid environment variable ${key}: ${detail}`);
  }

  return parsed.data;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export const env = {
  DATABASE_URL: readEnv("DATABASE_URL"),
  // Getters stay unread during `next build` until a feature accesses them.
  get JWT_ACCESS_SECRET() {
    return readEnv("JWT_ACCESS_SECRET");
  },
  get JWT_REFRESH_SECRET() {
    return readEnv("JWT_REFRESH_SECRET");
  },
  get CLOUDINARY_CLOUD_NAME() {
    return readEnv("CLOUDINARY_CLOUD_NAME");
  },
  get CLOUDINARY_API_KEY() {
    return readEnv("CLOUDINARY_API_KEY");
  },
  get CLOUDINARY_API_SECRET() {
    return readEnv("CLOUDINARY_API_SECRET");
  },
  get OPENROUTER_API_KEY() {
    return readEnv("OPENROUTER_API_KEY");
  },
  get OPENROUTER_MODEL() {
    if (!process.env.OPENROUTER_MODEL) {
      return "openrouter/free";
    }
    return readEnv("OPENROUTER_MODEL");
  },
  get RESEND_API_KEY() {
    return readEnv("RESEND_API_KEY");
  },
  get RESEND_FROM_EMAIL() {
    return readEnv("RESEND_FROM_EMAIL");
  },
  get TOTP_ENCRYPTION_KEY() {
    return readEnv("TOTP_ENCRYPTION_KEY");
  },
  get APP_URL() {
    return readEnv("APP_URL");
  },
};
