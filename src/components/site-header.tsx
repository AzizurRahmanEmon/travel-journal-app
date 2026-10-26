"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/button";
import { FormError } from "@/components/form-error";
import { api, ApiError, messageOf } from "@/lib/api-client";

export function SiteHeader() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.get<{ email: string }>("/api/auth/me").then(
      (user) => {
        if (active) setEmail(user.email);
      },
      (error: unknown) => {
        if (!active || (error instanceof ApiError && error.status === 401)) {
          return;
        }
        setError(messageOf(error));
      },
    );
    return () => {
      active = false;
    };
  }, []);

  async function logout() {
    setPending(true);
    setError(null);
    try {
      await api.post("/api/auth/logout");
      router.push("/login");
    } catch (caught) {
      setError(messageOf(caught));
      setPending(false);
    }
  }

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/photos" className="font-semibold text-zinc-900 no-underline">
          Travel Photo Journal
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {email ? <span className="text-zinc-600">{email}</span> : null}
          <Link href="/settings" className="text-zinc-900">
            Settings
          </Link>
          <Button variant="ghost" onClick={logout} disabled={pending}>
            {pending ? "Logging out..." : "Logout"}
          </Button>
        </div>
      </div>
      {error ? (
        <div className="mx-auto w-full max-w-5xl px-4 pb-3">
          <FormError message={error} />
        </div>
      ) : null}
    </header>
  );
}
