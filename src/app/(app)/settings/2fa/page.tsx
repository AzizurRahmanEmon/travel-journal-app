"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/button";
import { FormError } from "@/components/form-error";
import { Input } from "@/components/input";
import { secretFromOtpauthUrl } from "@/lib/auth/otpauth";
import { ApiError, api, formMessage } from "@/lib/api-client";

const WRONG_CODE = "That code didn't match. Check your phone's time is set automatically and try the newest code.";

type Setup = {
  qrCode: string;
  otpauthUrl: string;
};

export default function TwoFactorPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const sending = useRef(false);

  useEffect(() => {
    let active = true;
    api.get<{ totpEnabled: boolean }>("/api/auth/me").then(
      (user) => {
        if (active) setEnabled(user.totpEnabled);
      },
      (caught: unknown) => {
        if (active) setError(caught);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  async function startSetup() {
    setPending(true);
    setError(null);
    try {
      setSetup(await api.post<Setup>("/api/auth/2fa/setup"));
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  async function confirm(code: string) {
    if (sending.current || code.length !== 6) return;
    sending.current = true;
    setPending(true);
    setError(null);
    try {
      await api.post("/api/auth/2fa/verify", { type: "setup", code });
      setEnabled(true);
      setConfirmed(true);
      setSetup(null);
    } catch (caught) {
      setError(caught);
      setPending(false);
      sending.current = false;
    }
  }

  return (
    <section className="grid max-w-lg gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Two-factor authentication</h1>
      {enabled === null ? <p className="text-sm text-zinc-600">Loading...</p> : <StatusCard enabled={enabled} />}
      {confirmed ? <EnabledNote /> : null}
      {setup ? null : <FormError message={setupMessage(error)} />}
      {enabled === false && !setup ? (
        <Button onClick={startSetup} disabled={pending}>
          Enable 2FA
        </Button>
      ) : null}
      {enabled === false && setup ? <SetupStepper setup={setup} pending={pending} error={error} onSubmit={confirm} /> : null}
    </section>
  );
}

function StatusCard({ enabled }: { enabled: boolean }) {
  const badge = enabled ? "bg-green-100 text-green-800" : "bg-zinc-100 text-zinc-700";
  return (
    <div className="grid gap-2 rounded-lg border border-zinc-200 bg-white p-4">
      <span className={`w-fit rounded-full px-2 py-1 text-xs font-medium ${badge}`}>{enabled ? "2FA is on" : "2FA is off"}</span>
      <p className="text-sm text-zinc-600">Adds a 6-digit code from your phone at every login</p>
    </div>
  );
}

function EnabledNote() {
  return (
    <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
      {"2FA enabled. You'll be asked for a code next time you log in."}
    </p>
  );
}

function SetupStepper({
  setup,
  pending,
  error,
  onSubmit,
}: {
  setup: Setup;
  pending: boolean;
  error: unknown;
  onSubmit: (code: string) => Promise<void>;
}) {
  const secret = secretFromOtpauthUrl(setup.otpauthUrl);
  return (
    <ol className="grid gap-6">
      <Step number="1" title="Install an authenticator app">
        <p className="text-sm text-zinc-600">Google Authenticator, Microsoft Authenticator, Authy, or 1Password</p>
      </Step>
      <Step number="2" title="Scan the QR code in the app">
        <p className="text-sm text-zinc-600">Add account / + then Scan QR code</p>
        <QrCode src={setup.qrCode} />
        {secret ? <ManualKey secret={secret} /> : null}
      </Step>
      <Step number="3" title="Enter the 6-digit code shown in the app">
        <CodeForm pending={pending} error={error} onSubmit={onSubmit} />
      </Step>
    </ol>
  );
}

function Step({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-sm font-medium text-white">{number}</span>
      <p className="self-center text-sm font-medium text-zinc-900">{title}</p>
      <div className="col-start-2 grid gap-2">{children}</div>
    </li>
  );
}

function QrCode({ src }: { src: string }) {
  return (
    // The QR code is a data URL returned by setup, not a remote image.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="Authenticator QR code" className="h-48 w-48 rounded-md border border-zinc-200 bg-white" />
  );
}

function ManualKey({ secret }: { secret: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setError(null);
    } catch (caught) {
      setCopied(false);
      setError(caught instanceof Error ? caught.message : "Couldn't copy the key");
    }
  }

  return (
    <div className="grid gap-2">
      <p className="text-sm text-zinc-700">{"Can't scan? Enter this key manually"}</p>
      <div className="flex items-start gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-sm text-zinc-900">{secret}</code>
        <Button variant="ghost" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <FormError message={error} />
    </div>
  );
}

function CodeForm({
  pending,
  error,
  onSubmit,
}: {
  pending: boolean;
  error: unknown;
  onSubmit: (code: string) => Promise<void>;
}) {
  const [code, setCode] = useState("");

  function change(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length === 6) void onSubmit(digits);
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(code);
      }}
      noValidate
      className="grid gap-2"
    >
      <FormError message={setupMessage(error)} />
      <Input
        label="Code"
        name="code"
        value={code}
        onChange={(event) => change(event.target.value)}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
      />
      <p className="text-sm text-zinc-600">Codes refresh every 30 seconds.</p>
      <Button type="submit" disabled={pending || code.length !== 6}>
        {pending ? "Checking..." : "Confirm"}
      </Button>
    </form>
  );
}

function setupMessage(error: unknown): string | null {
  if (error instanceof ApiError && error.message === "Invalid authentication code") {
    return WRONG_CODE;
  }
  return formMessage(error);
}
