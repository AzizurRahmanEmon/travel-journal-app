export type FieldError = {
  path: string;
  message: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: FieldError[];

  constructor(status: number, code: string, message: string, fieldErrors: FieldError[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
};

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  delete: (path: string) => request<void>(path, { method: "DELETE" }),
};

export function fieldError(error: unknown, path: string): string | undefined {
  if (!(error instanceof ApiError)) {
    return undefined;
  }
  return error.fieldErrors.find((field) => field.path === path)?.message;
}

export function formMessage(error: unknown): string | null {
  if (error === null) {
    return null;
  }
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error.message : "Something went wrong. Please try again.";
  }
  if (error.fieldErrors.length > 0) {
    return null;
  }
  return error.message;
}

export function messageOf(error: unknown): string {
  return formMessage(error) ?? "Something went wrong. Please try again.";
}

async function request<T>(path: string, options: RequestOptions = {}, allowRefresh = true): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: headersFor(options.body),
    body: encodeBody(options.body),
  });

  if (response.status === 401 && refreshesSession(path)) {
    if (allowRefresh && (await refreshSession())) {
      return request<T>(path, options, false);
    }
    redirectToLogin();
  }

  return readBody<T>(response);
}

function refreshesSession(path: string): boolean {
  // Login and authenticator checks use 401 for a bad credential, not an expired session.
  return path.startsWith("/api/photos") || path === "/api/auth/me" || path === "/api/auth/2fa/setup";
}

async function refreshSession(): Promise<boolean> {
  const response = await fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
  });
  return response.ok;
}

function redirectToLogin(): never {
  if (typeof window !== "undefined") {
    // A full load drops in-memory page state and lets the proxy see the missing cookie.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }
  throw new ApiError(401, "UNAUTHORIZED", "Unauthorized");
}

function headersFor(body: unknown): HeadersInit | undefined {
  if (body === undefined || body instanceof FormData) {
    return undefined;
  }
  return { "content-type": "application/json" };
}

function encodeBody(body: unknown): BodyInit | undefined {
  if (body === undefined) {
    return undefined;
  }
  if (body instanceof FormData) {
    return body;
  }
  return JSON.stringify(body);
}

async function readBody<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await response.json().catch(() => null);
  if (isErrorPayload(payload)) {
    throw new ApiError(
      response.status,
      stringField(payload.error.code, "INTERNAL_ERROR"),
      stringField(payload.error.message, "Something went wrong. Please try again."),
      fieldErrors(payload.error.details),
    );
  }
  if (!response.ok || !isDataPayload(payload)) {
    throw new ApiError(response.status, "INTERNAL_ERROR", "Something went wrong. Please try again.");
  }
  return payload.data as T;
}

function isErrorPayload(
  payload: unknown,
): payload is { error: { code?: unknown; message?: unknown; details?: unknown } } {
  return Boolean(payload && typeof payload === "object" && "error" in payload && payload.error);
}

function isDataPayload(payload: unknown): payload is { data: unknown } {
  return Boolean(payload && typeof payload === "object" && "data" in payload);
}

function fieldErrors(details: unknown): FieldError[] {
  if (!Array.isArray(details)) {
    return [];
  }
  return details.flatMap((item) => {
    if (!item || typeof item !== "object" || !("path" in item) || !("message" in item)) {
      return [];
    }
    if (typeof item.path !== "string" || typeof item.message !== "string") {
      return [];
    }
    return [{ path: item.path, message: item.message }];
  });
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}
