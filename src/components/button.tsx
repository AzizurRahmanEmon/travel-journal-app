import type { ButtonHTMLAttributes } from "react";

const variants = {
  primary: "bg-zinc-900 text-white hover:bg-zinc-700",
  danger: "bg-red-700 text-white hover:bg-red-800",
  ghost: "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
};

export function Button({ variant = "primary", className = "", type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
