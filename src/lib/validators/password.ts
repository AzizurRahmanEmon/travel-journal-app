import { z } from "zod";

export type PasswordRule = {
  id: string;
  label: string;
  test: (password: string) => boolean;
};

// bcrypt only stores the first 72 bytes, so a longer password is not the one that gets checked later.
export const passwordRules: PasswordRule[] = [
  { id: "min", label: "At least 8 characters", test: (password) => password.length >= 8 },
  { id: "max", label: "At most 72 characters", test: (password) => password.length <= 72 },
  { id: "lower", label: "One lowercase letter", test: (password) => /[a-z]/.test(password) },
  { id: "upper", label: "One uppercase letter", test: (password) => /[A-Z]/.test(password) },
  { id: "number", label: "One number", test: (password) => /[0-9]/.test(password) },
  { id: "symbol", label: "One symbol", test: (password) => /[^A-Za-z0-9]/.test(password) },
];

export const passwordSchema = z.string().superRefine((password, context) => {
  for (const rule of passwordRules) {
    if (!rule.test(password)) {
      context.addIssue({ code: "custom", message: rule.label });
    }
  }
});

export function passwordIsValid(password: string): boolean {
  return passwordRules.every((rule) => rule.test(password));
}

export function passwordStrength(password: string): {
  passed: number;
  total: number;
  label: "Weak" | "Fair" | "Good" | "Strong";
} {
  const passed = passwordRules.filter((rule) => rule.test(password)).length;
  const total = passwordRules.length;
  return { passed, total, label: strengthLabel(passed, total) };
}

function strengthLabel(passed: number, total: number): "Weak" | "Fair" | "Good" | "Strong" {
  if (passed === total) return "Strong";
  if (passed >= total - 1) return "Good";
  if (passed >= Math.ceil(total / 2)) return "Fair";
  return "Weak";
}
