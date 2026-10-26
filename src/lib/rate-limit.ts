import { AppError } from "@/lib/errors";

const LIMIT = 5;
const WINDOW_MS = 60_000;

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function rateLimit(request: Request, route: string): void {
  const key = `${clientAddress(request)}:${route}`;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }

  if (bucket.count >= LIMIT) {
    throw new AppError("RATE_LIMITED", 429, "Too many requests");
  }

  bucket.count += 1;
}

function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) {
    return first;
  }
  return "unknown";
}
