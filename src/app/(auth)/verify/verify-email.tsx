"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FormError } from "@/components/form-error";
import { api, messageOf } from "@/lib/api-client";

export function VerifyEmail({ token }: { token: string }) {
  const [status, setStatus] = useState<"working" | "done" | "error">(token ? "working" : "error");
  const [message, setMessage] = useState<string | null>(token ? null : "This verification link is invalid.");

  useEffect(() => {
    if (!token) {
      return;
    }
    let active = true;
    api.post("/api/auth/verify-email", { token }).then(
      () => {
        if (active) setStatus("done");
      },
      (error: unknown) => {
        if (!active) return;
        setStatus("error");
        setMessage(messageOf(error));
      },
    );
    return () => {
      active = false;
    };
  }, [token]);

  if (status === "working") {
    return <p className="text-sm text-zinc-600">Checking your verification link...</p>;
  }
  if (status === "done") {
    return (
      <div className="grid gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900">Email verified</h1>
        <p className="text-sm text-zinc-600">Your email is verified.</p>
        <Link href="/login">Go to login</Link>
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      <h1 className="text-2xl font-semibold text-zinc-900">Verification failed</h1>
      <FormError message={message} />
      <Link href="/login">Go to login</Link>
    </div>
  );
}
