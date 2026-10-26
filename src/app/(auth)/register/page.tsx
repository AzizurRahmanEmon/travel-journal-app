"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/button";
import { FormError } from "@/components/form-error";
import { Input } from "@/components/input";
import { PasswordStrength } from "@/components/password-strength";
import { api, fieldError, formMessage } from "@/lib/api-client";
import { passwordIsValid } from "@/lib/validators/password";

export default function RegisterPage() {
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const ready = passwordIsValid(password) && confirmPassword.length > 0 && password === confirmPassword;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await api.post("/api/auth/register", {
        email: form.get("email"),
        password,
        confirmPassword,
      });
      setDone(true);
    } catch (caught) {
      setError(caught);
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="grid gap-3 rounded-xl border border-teal-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-zinc-900">Check your email</h1>
        <Link href="/login">Go to login</Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 rounded-xl border border-teal-200 bg-white p-6 shadow-sm">
      <div className="grid gap-1 border-b border-teal-100 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Create your account</h1>
        <p className="text-sm text-zinc-600">Start your travel photo journal</p>
      </div>
      <FormError message={formMessage(error)} />
      <Input label="Email" name="email" type="email" autoComplete="email" error={fieldError(error, "email")} />
      <Input
        label="Password"
        name="password"
        type={showPassword ? "text" : "password"}
        autoComplete="new-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={fieldError(error, "password")}
        suffix={<VisibilityToggle shown={showPassword} label="password" onToggle={() => setShowPassword((value) => !value)} />}
      />
      <PasswordStrength password={password} />
      <Input
        label="Confirm password"
        name="confirmPassword"
        type={showConfirm ? "text" : "password"}
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        error={fieldError(error, "confirmPassword")}
        suffix={<VisibilityToggle shown={showConfirm} label="confirm password" onToggle={() => setShowConfirm((value) => !value)} />}
      />
      <MatchNote password={password} confirmPassword={confirmPassword} />
      <Button type="submit" disabled={pending || !ready}>
        {pending ? "Creating account..." : "Create account"}
      </Button>
      <p className="text-sm text-zinc-600">
        Already registered? <Link href="/login">Log in</Link>
      </p>
    </form>
  );
}

function VisibilityToggle({ shown, label, onToggle }: { shown: boolean; label: string; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="text-xs font-medium text-zinc-600" aria-label={shown ? `Hide ${label}` : `Show ${label}`}>
      {shown ? "Hide" : "Show"}
    </button>
  );
}

function MatchNote({ password, confirmPassword }: { password: string; confirmPassword: string }): ReactNode {
  if (confirmPassword.length === 0) {
    return null;
  }
  const matches = password === confirmPassword;
  return <p className={matches ? "text-sm text-green-700" : "text-sm text-red-700"}>{matches ? "Passwords match" : "Passwords don't match"}</p>;
}
