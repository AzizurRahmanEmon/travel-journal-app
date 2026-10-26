"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/button";
import { FormError } from "@/components/form-error";
import { Input } from "@/components/input";
import { api, fieldError, formMessage } from "@/lib/api-client";

type LoginResult =
  | { twoFactorRequired: true; pendingToken: string }
  | { userId: string; twoFactorRequired?: false };

export default function LoginPage() {
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  if (pendingToken) {
    return <CodeStep pendingToken={pendingToken} />;
  }
  return <PasswordStep onPending={setPendingToken} />;
}

function PasswordStep({ onPending }: { onPending: (token: string) => void }) {
  const router = useRouter();
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const result = await api.post<LoginResult>("/api/auth/login", {
        email: form.get("email"),
        password: form.get("password"),
      });
      if (result.twoFactorRequired) {
        onPending(result.pendingToken);
        return;
      }
      router.push("/photos");
    } catch (caught) {
      setError(caught);
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Log in</h1>
      <FormError message={formMessage(error)} />
      <Input label="Email" name="email" type="email" autoComplete="email" error={fieldError(error, "email")} />
      <Input label="Password" name="password" type="password" autoComplete="current-password" error={fieldError(error, "password")} />
      <Button type="submit" disabled={pending}>
        {pending ? "Logging in..." : "Log in"}
      </Button>
      <p className="text-sm text-zinc-600">
        No account? <Link href="/register">Register</Link>
      </p>
    </form>
  );
}

function CodeStep({ pendingToken }: { pendingToken: string }) {
  const router = useRouter();
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await api.post("/api/auth/2fa/verify", {
        type: "login",
        pendingToken,
        code: form.get("code"),
      });
      router.push("/photos");
    } catch (caught) {
      setError(caught);
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Authentication code</h1>
      <p className="text-sm text-zinc-600">Open your authenticator app and enter the 6-digit code for Travel Photo Journal.</p>
      <FormError message={formMessage(error)} />
      <Input
        label="Code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        error={fieldError(error, "code")}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Checking..." : "Continue"}
      </Button>
    </form>
  );
}
