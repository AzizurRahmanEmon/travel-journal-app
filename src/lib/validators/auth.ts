import { z } from "zod";
import { passwordSchema } from "@/lib/validators/password";

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match",
  });

export const verifyEmailSchema = z.object({
  token: z.string().trim().min(1),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

const totpCodeSchema = z.string().regex(/^\d{6}$/, "Code must be 6 digits");

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
    code: totpCodeSchema.optional(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match",
  });

export const disableTwoFactorSchema = z.object({
  currentPassword: z.string().min(1),
  code: totpCodeSchema,
});

export const verifyTwoFactorSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("setup"),
    code: totpCodeSchema,
  }),
  z.object({
    type: z.literal("login"),
    pendingToken: z.string().min(1),
    code: totpCodeSchema,
  }),
]);
