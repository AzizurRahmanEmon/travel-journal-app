"use client";

import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type RefObject } from "react";
import { Button } from "@/components/button";
import { FormError } from "@/components/form-error";
import { ACCEPTED_IMAGE_TYPES, clientImageError } from "@/lib/validators/photo";

export function ImageDropzone({
  disabled = false,
  onFile,
}: {
  disabled?: boolean;
  onFile: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = useRef<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, []);

  function browse() {
    if (!disabled) inputRef.current?.click();
  }

  function choose(next: File | null) {
    const message = next ? clientImageError(next) : null;
    if (message) {
      setError(message);
      return;
    }
    replacePreview(next);
    setError(null);
    setFile(next);
    onFile(next);
  }

  function replacePreview(next: File | null) {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    const url = next ? URL.createObjectURL(next) : null;
    previewUrl.current = url;
    setPreview(url);
  }

  return (
    <div className="grid gap-2">
      <FileInput inputRef={inputRef} onChoose={choose} />
      {file && preview ? (
        <SelectedFile
          file={file}
          preview={preview}
          dragging={dragging}
          disabled={disabled}
          onRemove={() => choose(null)}
          onReplace={browse}
          onDragOver={(event) => markDragging(event, setDragging)}
          onDragLeave={(event) => clearDragging(event, setDragging)}
          onDrop={(event) => dropFile(event, setDragging, choose)}
        />
      ) : (
        <EmptyDrop
          dragging={dragging}
          disabled={disabled}
          onBrowse={browse}
          onDragOver={(event) => markDragging(event, setDragging)}
          onDragLeave={(event) => clearDragging(event, setDragging)}
          onDrop={(event) => dropFile(event, setDragging, choose)}
        />
      )}
      <FormError message={error} />
    </div>
  );
}

function FileInput({
  inputRef,
  onChoose,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  onChoose: (file: File | null) => void;
}) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPTED_IMAGE_TYPES.join(",")}
      className="sr-only"
      tabIndex={-1}
      onChange={(event) => {
        onChoose(event.target.files?.[0] ?? null);
        event.target.value = "";
      }}
    />
  );
}

function EmptyDrop({
  dragging,
  disabled,
  onBrowse,
  onDragOver,
  onDragLeave,
  onDrop,
}: DropHandlers & { dragging: boolean; disabled: boolean; onBrowse: () => void }) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onBrowse();
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={onBrowse}
      onKeyDown={onKeyDown}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={dropClass(dragging)}
    >
      <UploadIcon />
      <span className="text-sm font-medium text-zinc-800">Drag & drop an image or click to browse</span>
      <span className="text-xs text-zinc-500">JPEG, PNG or WebP, max 5 MB</span>
    </div>
  );
}

function SelectedFile({
  file,
  preview,
  dragging,
  disabled,
  onRemove,
  onReplace,
  onDragOver,
  onDragLeave,
  onDrop,
}: DropHandlers & {
  file: File;
  preview: string;
  dragging: boolean;
  disabled: boolean;
  onRemove: () => void;
  onReplace: () => void;
}) {
  return (
    <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} className={`${dropClass(dragging)} cursor-default`}>
      {/* The preview is a local blob URL, not a remote image. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview} alt="" className="aspect-video w-full rounded-md object-cover" />
      <p className="w-full truncate text-sm font-medium text-zinc-900">{file.name}</p>
      <p className="text-xs text-zinc-500">{formatSize(file.size)}</p>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onRemove} disabled={disabled}>
          Remove
        </Button>
        <Button variant="ghost" onClick={onReplace} disabled={disabled}>
          Replace
        </Button>
      </div>
    </div>
  );
}

type DropHandlers = {
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
};

function markDragging(event: DragEvent<HTMLDivElement>, setDragging: (value: boolean) => void) {
  event.preventDefault();
  setDragging(true);
}

function clearDragging(event: DragEvent<HTMLDivElement>, setDragging: (value: boolean) => void) {
  const next = event.relatedTarget;
  if (next instanceof Node && event.currentTarget.contains(next)) return;
  setDragging(false);
}

function dropFile(
  event: DragEvent<HTMLDivElement>,
  setDragging: (value: boolean) => void,
  choose: (file: File | null) => void,
) {
  event.preventDefault();
  setDragging(false);
  choose(event.dataTransfer.files[0] ?? null);
}

function dropClass(dragging: boolean): string {
  const tone = dragging ? "border-zinc-900 bg-zinc-100" : "border-zinc-300 bg-white";
  return `grid w-full place-items-center gap-2 rounded-lg border-2 border-dashed p-4 text-center ${tone}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8 text-zinc-500" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 16V7" strokeLinecap="round" />
      <path d="M8.5 10.5 12 7l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 16.5V18a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-1.5" strokeLinecap="round" />
    </svg>
  );
}
