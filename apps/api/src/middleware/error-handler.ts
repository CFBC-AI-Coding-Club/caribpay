import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { ApiError } from "../lib/errors";
import type { AppEnv } from "../app-env";

export function errorHandler(err: Error, c: Context<AppEnv>): Response {
  if (err instanceof ApiError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.status);
  }
  if (err instanceof ZodError) {
    const message = err.issues
      .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
      .join("; ")
      .slice(0, 300);
    return c.json({ error: { code: "VALIDATION_ERROR", message } }, 400);
  }
  if (err instanceof SyntaxError) {
    return c.json({ error: { code: "INVALID_JSON", message: "Request body is not valid JSON" } }, 400);
  }
  if (err instanceof HTTPException) {
    return c.json({ error: { code: "HTTP_ERROR", message: err.message } }, err.status as 400);
  }
  console.error(`[${c.get("requestId") ?? "no-request-id"}] unhandled error:`, err);
  return c.json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } }, 500);
}

export function notFoundHandler(c: Context<AppEnv>): Response {
  return c.json({ error: { code: "NOT_FOUND", message: "Route not found" } }, 404);
}
