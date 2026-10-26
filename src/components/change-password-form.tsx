"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/button";
import { FormError } from "@/components/form-error";
import { Input } from "@/components/input";
import { PasswordStrength } from "@/components/password-strength";
import { api, fieldError, formMessage } from "@/lib/api-client";
import { passwordIsValid } from "@/lib/validators/password";

export function ChangePasswordForm({ totpEnabled }: { totpEnabled: boolean }) {
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [shown, setShown] = useState({ current: false, next: false, confirm: false });
  const codeReady = !totpEnabled || code.length === 6;
  const ready =
    currentPassword.length > 0 && passwordIsValid(newPassword) && confirmPassword === newPassword && codeReady;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      await api.post("/api/auth/change-password", {
        currentPassword,
        newPassword,
        confirmPassword,
        ...(totpEnabled ? { code } : {}),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setCode("");
      setSaved(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormError message={formMessage(error)} />
      {saved ? <p className="text-sm text-green-800">Password updated. Other devices have been logged out.</p> : null}
      <PasswordField
        label="Current password"
        name="currentPassword"
        autoComplete="current-password"
        value={currentPassword}
        shown={shown.current}
        onChange={setCurrentPassword}
        onToggle={() => setShown((value) => ({ ...value, current: !value.current }))}
        error={fieldError(error, "currentPassword")}
      />
      <PasswordField
        label="New password"
        name="newPassword"
        autoComplete="new-password"
        value={newPassword}
        shown={shown.next}
        onChange={setNewPassword}
        onToggle={() => setShown((value) => ({ ...value, next: !value.next }))}
        error={fieldError(error, "newPassword")}
      />
      <PasswordStrength password={newPassword} />
      <PasswordField
        label="Confirm new password"
        name="confirmPassword"
        autoComplete="new-password"
        value={confirmPassword}
        shown={shown.confirm}
        onChange={setConfirmPassword}
        onToggle={() => setShown((value) => ({ ...value, confirm: !value.confirm }))}
        error={fieldError(error, "confirmPassword")}
      />
      <MatchNote password={newPassword} confirmPassword={confirmPassword} />
      {totpEnabled ? (
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
      ) : null}
      <Button type="submit" disabled={pending || !ready}>
        {pending ? "Updating password..." : "Change password"}
      </Button>
    </form>
  );
}

function PasswordField({
  label,
  name,
  autoComplete,
  value,
  shown,
  onChange,
  onToggle,
  error,
}: {
  label: string;
  name: string;
  autoComplete: string;
  value: string;
  shown: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
  error?: string;
}) {
  return (
    <Input
      label={label}
      name={name}
      type={shown ? "text" : "password"}
      autoComplete={autoComplete}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={error}
      suffix={
        <button type="button" onClick={onToggle} className="text-xs font-medium text-zinc-600" aria-label={shown ? `Hide ${label}` : `Show ${label}`}>
          {shown ? "Hide" : "Show"}
        </button>
      }
    />
  );
}

function MatchNote({ password, confirmPassword }: { password: string; confirmPassword: string }): ReactNode {
  if (confirmPassword.length === 0) {
    return null;
  }
  const matches = password === confirmPassword;
  const message = matches ? "Passwords match" : "Passwords don't match";
  return <p className={matches ? "text-sm text-green-700" : "text-sm text-red-700"}>{message}</p>;
}
