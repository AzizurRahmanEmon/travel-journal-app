"use client";

import { useEffect, useState } from "react";
import { ChangePasswordForm } from "@/components/change-password-form";
import { FormError } from "@/components/form-error";
import { Input } from "@/components/input";
import { TwoFactorSection } from "@/components/two-factor-section";
import { api, messageOf } from "@/lib/api-client";

type Account = {
  email: string;
  emailVerified: boolean;
  totpEnabled: boolean;
};

export default function SettingsPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.get<Account>("/api/auth/me").then(
      (user) => {
        if (active) setAccount(user);
      },
      (caught: unknown) => {
        if (active) setError(messageOf(caught));
      },
    );
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="grid max-w-lg gap-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Settings</h1>
      <FormError message={error} />
      {account ? (
        <>
          <AccountSection email={account.email} verified={account.emailVerified} />
          <section className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4">
            <h2 className="text-lg font-semibold text-zinc-900">Change password</h2>
            <ChangePasswordForm totpEnabled={account.totpEnabled} />
          </section>
          <TwoFactorSection
            enabled={account.totpEnabled}
            onChanged={(enabled) => setAccount({ ...account, totpEnabled: enabled })}
          />
        </>
      ) : error ? null : (
        <p className="text-sm text-zinc-600">Loading...</p>
      )}
    </div>
  );
}

function AccountSection({ email, verified }: { email: string; verified: boolean }) {
  return (
    <section className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-zinc-900">Account</h2>
        {verified ? <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">Verified</span> : null}
      </div>
      <Input label="Email" name="email" value={email} readOnly />
    </section>
  );
}
