"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/button";
import { FormError } from "@/components/form-error";
import { ImageDropzone } from "@/components/image-dropzone";
import { Input, TextArea } from "@/components/input";
import { fieldError, formMessage } from "@/lib/api-client";

export type PhotoDraft = {
  name: string;
  location: string;
  description: string;
  image: File | null;
};

type PhotoFormProps = {
  initial?: { name: string; location: string; description: string };
  idPrefix?: string;
  requireImage?: boolean;
  submitLabel: string;
  onSubmit: (draft: PhotoDraft) => Promise<void>;
};

export function PhotoForm({ initial, idPrefix = "", requireImage = false, submitLabel, onSubmit }: PhotoFormProps) {
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fieldId = (name: string) => (idPrefix ? `${idPrefix}-${name}` : name);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await onSubmit({
        name: String(form.get("name") ?? ""),
        location: String(form.get("location") ?? ""),
        description: String(form.get("description") ?? ""),
        image: file,
      });
    } catch (caught) {
      setError(caught);
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={requireImage ? "grid gap-4 rounded-lg border border-zinc-200 bg-white p-4" : "grid gap-4"}>
      {requireImage ? <h2 className="text-xl font-semibold text-zinc-900">Add a travel photo</h2> : null}
      <FormError message={formMessage(error)} />
      <div className={requireImage ? "grid gap-4 md:grid-cols-2" : "grid gap-4"}>
        {requireImage ? <ImageDropzone disabled={pending} onFile={setFile} /> : null}
        <div className="grid content-start gap-4">
          <Input label="Name" name="name" id={fieldId("name")} defaultValue={initial?.name} error={fieldError(error, "name")} />
          <Input label="Location" name="location" id={fieldId("location")} defaultValue={initial?.location} error={fieldError(error, "location")} />
          <TextArea label="Description" name="description" id={fieldId("description")} defaultValue={initial?.description} error={fieldError(error, "description")} />
          <Button type="submit" disabled={pending || (requireImage && !file)}>
            <SubmitLabel pending={pending} uploading={requireImage} label={submitLabel} />
          </Button>
        </div>
      </div>
    </form>
  );
}

function SubmitLabel({ pending, uploading, label }: { pending: boolean; uploading: boolean; label: string }) {
  if (!pending) return label;
  if (!uploading) return "Saving...";
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      Uploading and summarizing...
    </span>
  );
}
