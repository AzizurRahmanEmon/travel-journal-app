"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/button";
import { FormError } from "@/components/form-error";
import { Input } from "@/components/input";
import { api, fieldError, formMessage } from "@/lib/api-client";

export function TwoFactorSection({
  enabled,
  onChanged,
}: {
  enabled: boolean;
  onChanged: (enabled: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="text-lg font-semibold text-zinc-900">Two-factor authentication</h2>
      <p className="text-sm text-zinc-600">Adds a 6-digit code from your phone at every login</p>
      {enabled ? (
        <Button variant="ghost" onClick={() => setOpen(true)}>
          Disable
        </Button>
      ) : (
        <Link href="/settings/2fa" className="text-sm font-medium text-zinc-900">
          Set up two-factor authentication
        </Link>
      )}
      {open ? (
        <DisableDialog
          onClose={() => setOpen(false)}
          onDisabled={() => {
            onChanged(false);
            setOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}

function DisableDialog({ onClose, onDisabled }: { onClose: () => void; onDisabled: () => void }) {
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api.post("/api/auth/2fa/disable", { currentPassword: password, code });
      onDisabled();
    } catch (caught) {
      setError(caught);
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-10 grid place-items-center bg-black/40 p-4">
      <form onSubmit={onSubmit} noValidate role="dialog" aria-modal="true" aria-labelledby="disable-2fa-title" className="grid w-full max-w-md gap-4 rounded-lg bg-white p-5">
        <h3 id="disable-2fa-title" className="text-lg font-semibold text-zinc-900">
          Disable two-factor authentication
        </h3>
        <p className="text-sm text-zinc-600">Enter your current password and a code from your authenticator app.</p>
        <FormError message={formMessage(error)} />
        <Input
          label="Current password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldError(error, "currentPassword")}
        />
        <Input
          label="Authentication code"
          name="code"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          error={fieldError(error, "code")}
        />
        <div className="flex gap-2">
          <Button type="submit" variant="danger" disabled={pending || password.length === 0 || code.length !== 6}>
            {pending ? "Disabling..." : "Disable 2FA"}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
