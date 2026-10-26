import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { FormError } from "@/components/form-error";

const controlClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900";

type FieldProps = {
  label: string;
  name: string;
  error?: string;
  id?: string;
};

export function Input({
  label,
  name,
  error,
  id,
  suffix,
  ...props
}: FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "id"> & { suffix?: ReactNode }) {
  const fieldId = id ?? name;
  return (
    <Field id={fieldId} label={label} error={error}>
      <span className="relative block">
        <input
          {...props}
          id={fieldId}
          name={name}
          className={`${controlClass}${suffix ? " pr-16" : ""}`}
          aria-invalid={Boolean(error)}
        />
        {suffix ? <span className="absolute inset-y-0 right-2 flex items-center">{suffix}</span> : null}
      </span>
    </Field>
  );
}

export function TextArea({
  label,
  name,
  error,
  id,
  ...props
}: FieldProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "name" | "id">) {
  const fieldId = id ?? name;
  return (
    <Field id={fieldId} label={label} error={error}>
      <textarea id={fieldId} name={name} rows={4} className={controlClass} aria-invalid={Boolean(error)} {...props} />
    </Field>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <label htmlFor={id} className="grid gap-1 text-sm text-zinc-800">
      <span className="font-medium">{label}</span>
      {children}
      <FormError message={error} />
    </label>
  );
}
