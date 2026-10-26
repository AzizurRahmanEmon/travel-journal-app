export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, status: number, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function badRequest(message: string, details?: unknown): AppError {
  return new AppError("BAD_REQUEST", 400, message, details);
}

export function unauthorized(message: string): AppError {
  return new AppError("UNAUTHORIZED", 401, message);
}

export function forbidden(message: string): AppError {
  return new AppError("FORBIDDEN", 403, message);
}

export function notFound(message: string): AppError {
  return new AppError("NOT_FOUND", 404, message);
}

export function conflict(message: string): AppError {
  return new AppError("CONFLICT", 409, message);
}

export function toResponse(error: AppError): Response {
  const body = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
    },
  };

  return Response.json(body, { status: error.status });
}
