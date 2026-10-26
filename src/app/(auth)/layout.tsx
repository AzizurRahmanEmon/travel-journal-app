import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12">
      <p className="text-sm font-medium text-zinc-500">Travel Photo Journal</p>
      {children}
    </main>
  );
}
