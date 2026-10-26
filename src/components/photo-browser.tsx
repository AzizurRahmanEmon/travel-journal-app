"use client";

import { useEffect, useState } from "react";
import { FormError } from "@/components/form-error";
import { PhotoCard } from "@/components/photo-card";
import { PhotoForm, type PhotoDraft } from "@/components/photo-form";
import { api, messageOf } from "@/lib/api-client";
import type { Photo } from "@/lib/photos";

export function PhotoBrowser() {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Photo | null>(null);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    let active = true;
    api.get<Photo[]>("/api/photos").then(
      (data) => {
        if (active) setPhotos(data);
      },
      (error: unknown) => {
        if (active) setLoadError(messageOf(error));
      },
    );
    return () => {
      active = false;
    };
  }, []);

  async function createPhoto(draft: PhotoDraft) {
    const created = await api.post<Photo>("/api/photos", photoBody(draft));
    setPhotos((current) => [created, ...(current ?? [])]);
    setFormKey((value) => value + 1);
  }

  async function savePhoto(draft: PhotoDraft) {
    if (!editing) return;
    const saved = await api.put<Photo>(`/api/photos/${editing.id}`, {
      name: draft.name,
      location: draft.location,
      description: draft.description,
    });
    setPhotos((current) => current?.map((photo) => (photo.id === saved.id ? saved : photo)) ?? []);
    setEditing(null);
  }

  async function deletePhoto(photo: Photo) {
    await api.delete(`/api/photos/${photo.id}`);
    setPhotos((current) => current?.filter((item) => item.id !== photo.id) ?? []);
  }

  if (photos === null && !loadError) {
    return <p className="text-sm text-zinc-600">Loading photos...</p>;
  }

  return (
    <div className="grid gap-8">
      <h1 className="text-2xl font-semibold text-zinc-900">Photos</h1>
      <PhotoForm key={formKey} requireImage submitLabel="Add photo" onSubmit={createPhoto} />
      <FormError message={loadError} />
      {photos?.length === 0 ? <p className="text-sm text-zinc-600">No photos yet.</p> : null}
      <ul className="grid gap-4 sm:grid-cols-2">
        {photos?.map((photo) => (
          <li key={photo.id}>
            <PhotoCard photo={photo} onEdit={setEditing} onDelete={deletePhoto} />
          </li>
        ))}
      </ul>
      {editing ? (
        <EditDialog photo={editing} onClose={() => setEditing(null)} onSubmit={savePhoto} />
      ) : null}
    </div>
  );
}

function EditDialog({
  photo,
  onClose,
  onSubmit,
}: {
  photo: Photo;
  onClose: () => void;
  onSubmit: (draft: PhotoDraft) => Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-10 grid place-items-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="edit-photo-title" className="grid w-full max-w-lg gap-4 rounded-lg bg-white p-5">
        <h2 id="edit-photo-title" className="text-xl font-semibold text-zinc-900">
          Edit photo
        </h2>
        <PhotoForm
          idPrefix="edit"
          initial={photo}
          submitLabel="Save changes"
          onSubmit={onSubmit}
        />
      <button type="button" onClick={onClose} className="justify-self-start text-sm text-zinc-600">
        Cancel
      </button>
      </div>
    </div>
  );
}

function photoBody(draft: PhotoDraft): FormData {
  const body = new FormData();
  body.set("name", draft.name);
  body.set("location", draft.location);
  body.set("description", draft.description);
  if (draft.image) {
    body.set("image", draft.image);
  }
  return body;
}
