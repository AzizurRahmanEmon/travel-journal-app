import { useState } from "react";
import { Button } from "@/components/button";
import { FormError } from "@/components/form-error";
import { messageOf } from "@/lib/api-client";
import type { Photo } from "@/lib/photos";

export function PhotoCard({
  photo,
  onEdit,
  onDelete,
}: {
  photo: Photo;
  onEdit: (photo: Photo) => void;
  onDelete: (photo: Photo) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    setDeleting(true);
    setError(null);
    try {
      await onDelete(photo);
    } catch (caught) {
      setError(messageOf(caught));
      setDeleting(false);
    }
  }

  return (
    <article className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
      {/* User uploads come from Cloudinary and are displayed at their stored URL. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.imageUrl} alt={photo.name} className="aspect-video w-full object-cover" />
      <div className="grid gap-2 p-4">
        <h2 className="text-lg font-bold text-zinc-900">{photo.name}</h2>
        <p className="flex items-center gap-1 text-sm text-zinc-500">
          <PinIcon />
          {photo.location}
        </p>
        <p className="text-sm text-zinc-700">{photo.description}</p>
        <div className="rounded-md bg-teal-50 px-3 py-2">
          <p className="text-xs font-medium text-teal-800">AI summary</p>
          <p className="text-sm text-teal-950">{photo.summary || "Summary unavailable"}</p>
        </div>
        <FormError message={error} />
        {confirming ? (
          <div className="flex gap-2">
            <Button variant="danger" onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={deleting}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onEdit(photo)}>
              Edit
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              Delete
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z" strokeLinejoin="round" />
      <circle cx="12" cy="11" r="1.5" />
    </svg>
  );
}
