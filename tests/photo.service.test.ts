import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET as getRoute } from "@/app/api/photos/[id]/route";
import { POST } from "@/app/api/photos/route";
import { signAccessToken } from "@/lib/auth/jwt";
import { create, get, list, remove, update } from "@/lib/services/photo.service";
import type { ImageUpload } from "@/lib/validators/photo";

const db = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

const uploadImage = vi.hoisted(() => vi.fn());
const deleteImage = vi.hoisted(() => vi.fn());
const summarizeDescription = vi.hoisted(() => vi.fn());

vi.mock("@/db/client", () => ({ db }));
vi.mock("@/lib/integrations/storage", () => ({ uploadImage, deleteImage }));
vi.mock("@/lib/integrations/summarizer", () => ({ summarizeDescription }));

type PhotoRow = {
  id: string;
  userId: string;
  imageUrl: string;
  imagePublicId: string;
  name: string;
  location: string;
  description: string;
  summary: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const input = {
  name: "Beach",
  location: "Goa",
  description: "Warm water and long walks.",
};

describe("photos", () => {
  const rows: PhotoRow[] = [];
  let clock = Date.parse("2026-01-01T00:00:00.000Z");
  let failNextInsert = false;

  beforeEach(() => {
    rows.length = 0;
    clock = Date.parse("2026-01-01T00:00:00.000Z");
    failNextInsert = false;
    vi.clearAllMocks();
    uploadImage.mockResolvedValue({
      url: "https://cdn.example/beach.jpg",
      publicId: "travel-journal/beach",
    });
    deleteImage.mockResolvedValue(undefined);
    summarizeDescription.mockResolvedValue("A quiet week by the sea.");
    db.select.mockImplementation(() => ({
      from: () => ({
        where: (condition: unknown) => ({
          limit: (count: number) => Promise.resolve(matching(rows, condition).slice(0, count)),
          orderBy: (order: unknown) => Promise.resolve(sorted(matching(rows, condition), order)),
        }),
      }),
    }));
    db.insert.mockImplementation(() => ({
      values: (values: Record<string, unknown>) => ({
        returning: () => {
          if (failNextInsert) {
            failNextInsert = false;
            return Promise.reject(new Error("db down"));
          }
          const createdAt = nextDate();
          const row: PhotoRow = {
            id: crypto.randomUUID(),
            userId: String(values.userId),
            imageUrl: String(values.imageUrl),
            imagePublicId: String(values.imagePublicId),
            name: String(values.name),
            location: String(values.location),
            description: String(values.description),
            summary: null,
            createdAt,
            updatedAt: createdAt,
          };
          rows.push(row);
          return Promise.resolve([row]);
        },
      }),
    }));
    db.update.mockImplementation(() => ({
      set: (values: Partial<PhotoRow>) => ({
        where: (condition: unknown) => ({
          returning: () => {
            const matched = matching(rows, condition);
            for (const row of matched) {
              Object.assign(row, values);
            }
            return Promise.resolve(matched);
          },
        }),
      }),
    }));
    db.delete.mockImplementation(() => ({
      where: (condition: unknown) => {
        const remaining = rows.filter((row) => !matches(row, condition));
        rows.length = 0;
        rows.push(...remaining);
        return Promise.resolve(undefined);
      },
    }));
  });

  it("creates a photo and stores the summary", async () => {
    const photo = await create("user-1", { ...input, name: "  Beach  " }, jpeg());

    expect(photo).toMatchObject({
      userId: "user-1",
      name: "Beach",
      location: "Goa",
      description: input.description,
      summary: "A quiet week by the sea.",
      imageUrl: "https://cdn.example/beach.jpg",
      imagePublicId: "travel-journal/beach",
    });
    expect(uploadImage).toHaveBeenCalledWith(expect.any(Buffer), "image/jpeg");
    expect(summarizeDescription).toHaveBeenCalledWith(input.description);
  });

  it("lists only the caller's photos, newest first", async () => {
    seed({ name: "Older", createdAt: new Date("2026-01-01T00:00:00.000Z") });
    seed({ name: "Newer", createdAt: new Date("2026-02-01T00:00:00.000Z") });
    seed({ userId: "user-2", name: "Hidden", createdAt: new Date("2026-03-01T00:00:00.000Z") });

    const photos = await list("user-1");

    expect(photos.map((photo) => photo.name)).toEqual(["Newer", "Older"]);
  });

  it("gets a photo owned by the caller", async () => {
    const row = seed();

    await expect(get("user-1", row.id)).resolves.toMatchObject({ id: row.id, name: "Beach" });
  });

  it("deletes the row and the stored image", async () => {
    const row = seed({ imagePublicId: "travel-journal/gone" });

    await remove("user-1", row.id);

    expect(deleteImage).toHaveBeenCalledWith("travel-journal/gone");
    await expect(get("user-1", row.id)).rejects.toMatchObject({ status: 404 });
  });

  it("returns 404 for another user's photo", async () => {
    const row = seed({ userId: "user-2", name: "Private" });

    await expect(get("user-1", row.id)).rejects.toMatchObject({ status: 404 });
    await expect(update("user-1", row.id, { name: "Hijack" })).rejects.toMatchObject({ status: 404 });
    await expect(remove("user-1", row.id)).rejects.toMatchObject({ status: 404 });
    expect(deleteImage).not.toHaveBeenCalled();
    expect(row.name).toBe("Private");
  });

  it("rejects an image with the wrong type", async () => {
    const file = { buffer: Buffer.from("not-an-image"), mime: "image/jpeg", size: 13 };

    await expect(create("user-1", input, file)).rejects.toMatchObject({
      status: 400,
      message: "Image must be a JPEG, PNG, or WebP file",
    });
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("rejects an image over 5 MB", async () => {
    const file = jpeg();
    file.size = 5 * 1024 * 1024 + 1;

    await expect(create("user-1", input, file)).rejects.toMatchObject({
      status: 400,
      message: "Image must be 5 MB or smaller",
    });
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("keeps the photo when the summary fails", async () => {
    summarizeDescription.mockRejectedValueOnce(new Error("OpenRouter request failed (503)"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const photo = await create("user-1", input, jpeg());

      expect(photo.summary).toBeNull();
      expect(rows).toHaveLength(1);
      expect(deleteImage).not.toHaveBeenCalled();
      expect(errorLog).toHaveBeenCalledWith("Photo summary failed:", "OpenRouter request failed (503)");
    } finally {
      errorLog.mockRestore();
    }
  });

  it("deletes the upload when the insert fails", async () => {
    failNextInsert = true;

    await expect(create("user-1", input, jpeg())).rejects.toThrow("db down");
    expect(deleteImage).toHaveBeenCalledWith("travel-journal/beach");
    expect(rows).toHaveLength(0);
    expect(summarizeDescription).not.toHaveBeenCalled();
  });

  it("regenerates the summary only when the description changes", async () => {
    const row = seed({ description: "Old trip", summary: "Old summary" });

    const renamed = await update("user-1", row.id, { location: "Lisbon" });
    expect(renamed.summary).toBe("Old summary");
    expect(summarizeDescription).not.toHaveBeenCalled();

    await update("user-1", row.id, { description: "Old trip" });
    expect(summarizeDescription).not.toHaveBeenCalled();

    const rewritten = await update("user-1", row.id, { description: "A new trip" });
    expect(summarizeDescription).toHaveBeenCalledTimes(1);
    expect(summarizeDescription).toHaveBeenCalledWith("A new trip");
    expect(rewritten.summary).toBe("A quiet week by the sea.");
    expect(rewritten.description).toBe("A new trip");
  });

  it("creates a photo from multipart form data", async () => {
    const form = new FormData();
    form.set("name", "Beach");
    form.set("location", "Goa");
    form.set("description", input.description);
    form.set("image", new File([new Uint8Array(jpeg().buffer)], "beach.jpg", { type: "image/jpeg" }));

    const response = await POST(await authed("/api/photos", { method: "POST", body: form }));
    const body = (await response.json()) as { data: { name: string; summary: string } };

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ name: "Beach", summary: "A quiet week by the sea." });
  });

  it("returns 404 when the photo id is not a uuid", async () => {
    const response = await getRoute(await authed("/api/photos/nope"), {
      params: Promise.resolve({ id: "nope" }),
    });
    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(db.select).not.toHaveBeenCalled();
  });

  it("returns 204 when a photo is deleted", async () => {
    const row = seed({ imagePublicId: "travel-journal/route" });
    const response = await DELETE(await authed(`/api/photos/${row.id}`, { method: "DELETE" }), {
      params: Promise.resolve({ id: row.id }),
    });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(deleteImage).toHaveBeenCalledWith("travel-journal/route");
  });

  function seed(overrides: Partial<PhotoRow> = {}): PhotoRow {
    const createdAt = overrides.createdAt ?? nextDate();
    const row: PhotoRow = {
      id: overrides.id ?? crypto.randomUUID(),
      userId: overrides.userId ?? "user-1",
      imageUrl: overrides.imageUrl ?? "https://cdn.example/photo.jpg",
      imagePublicId: overrides.imagePublicId ?? "travel-journal/photo",
      name: overrides.name ?? "Beach",
      location: overrides.location ?? "Goa",
      description: overrides.description ?? "Warm water.",
      summary: overrides.summary ?? null,
      createdAt,
      updatedAt: overrides.updatedAt ?? createdAt,
    };
    rows.push(row);
    return row;
  }

  function nextDate(): Date {
    clock += 1000;
    return new Date(clock);
  }
});

function jpeg(): ImageUpload {
  const buffer = Buffer.alloc(16);
  buffer[0] = 0xff;
  buffer[1] = 0xd8;
  buffer[2] = 0xff;
  return { buffer, mime: "image/jpeg", size: buffer.length };
}

function matching(rows: PhotoRow[], condition: unknown): PhotoRow[] {
  return rows.filter((row) => matches(row, condition));
}

function matches(row: PhotoRow, condition: unknown): boolean {
  const filter = filters(condition);
  if (filter.size === 0) {
    return false;
  }
  if (filter.has("id") && filter.get("id") !== row.id) {
    return false;
  }
  if (filter.has("user_id") && filter.get("user_id") !== row.userId) {
    return false;
  }
  return true;
}

function filters(condition: unknown): Map<string, unknown> {
  const found = new Map<string, unknown>();
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object" || !("queryChunks" in node)) {
      return;
    }
    const chunks = (node as { queryChunks: unknown[] }).queryChunks;
    for (let index = 0; index < chunks.length; index += 1) {
      const name = columnName(chunks[index]);
      const param = chunks[index + 2];
      if (name && isParam(param)) {
        found.set(name, param.value);
      }
      visit(chunks[index]);
    }
  };
  visit(condition);
  return found;
}

function columnName(node: unknown): string | null {
  if (!node || typeof node !== "object" || !("name" in node)) {
    return null;
  }
  const name = (node as { name: unknown }).name;
  return typeof name === "string" ? name : null;
}

function isParam(node: unknown): node is { value: unknown } {
  return Boolean(
    node &&
      typeof node === "object" &&
      "value" in node &&
      !Array.isArray((node as { value: unknown }).value) &&
      !("queryChunks" in node),
  );
}

function sorted(rows: PhotoRow[], order: unknown): PhotoRow[] {
  const copy = [...rows];
  if (sqlText(order).includes("created_at") && sqlText(order).includes("desc")) {
    copy.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  }
  return copy;
}

function sqlText(node: unknown): string {
  if (!node || typeof node !== "object") {
    return "";
  }
  if ("value" in node && Array.isArray((node as { value: unknown }).value)) {
    return (node as { value: string[] }).value.join("");
  }
  if ("name" in node && typeof (node as { name: unknown }).name === "string") {
    return (node as { name: string }).name;
  }
  if (!("queryChunks" in node)) {
    return "";
  }
  return (node as { queryChunks: unknown[] }).queryChunks.map(sqlText).join("");
}

async function authed(path: string, init: RequestInit = {}): Promise<Request> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${await signAccessToken("user-1")}`);
  return new Request(`http://localhost${path}`, { ...init, headers });
}
