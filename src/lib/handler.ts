import { ZodError } from "zod";
import { AppError, badRequest, toResponse } from "@/lib/errors";

type RouteContext = { params: Promise<unknown> };

type Handler = (request: Request, context: RouteContext) => Promise<unknown>;

export function withHandler(handler: Handler) {
  return async (request: Request, context?: RouteContext): Promise<Response> => {
    try {
      const routeContext = context ?? { params: Promise.resolve({}) };
      return jsonResponse(await handler(request, routeContext));
    } catch (error) {
      return errorResponse(error);
    }
  };
}

function jsonResponse(result: unknown): Response {
  if (result instanceof Response) {
    return result;
  }

  if (!isCookieResult(result)) {
    return Response.json({ data: result });
  }

  const response = Response.json({ data: result.data });
  for (const cookie of result.cookies) {
    response.headers.append("Set-Cookie", cookie);
  }
  return response;
}

function isCookieResult(result: unknown): result is { data: unknown; cookies: string[] } {
  return (
    typeof result === "object" &&
    result !== null &&
    "cookies" in result &&
    Array.isArray(result.cookies)
  );
}

function errorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return toResponse(error);
  }

  if (error instanceof ZodError) {
    return toResponse(badRequest("Invalid input", fieldErrors(error)));
  }

  if (error instanceof SyntaxError) {
    return toResponse(badRequest("Invalid JSON"));
  }

  console.error(error);
  return toResponse(new AppError("INTERNAL_ERROR", 500, "Internal server error"));
}

function fieldErrors(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}
