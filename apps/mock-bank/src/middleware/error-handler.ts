import type { Context } from "hono";
import { ZodError } from "zod";
import { BankError } from "../lib/errors";
import type { BankAppEnv } from "../app-env";

export function errorHandler(err: Error, c: Context<BankAppEnv>): Response {
  if (err instanceof BankError) {
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
    return c.json({ error: { code: "INVALID_JSON", message: "Body is not valid JSON" } }, 400);
  }
  console.error(`[${c.get("requestId") ?? "no-request-id"}] mock-bank error:`, err);
  // Deliberately NOT a refusal code: the switch must treat this as an unknown
  // outcome and re-send, never as permission to reverse.
  return c.json({ error: { code: "BANK_UNAVAILABLE", message: "The bank did not respond" } }, 503);
}

export function notFoundHandler(c: Context<BankAppEnv>): Response {
  return c.json({ error: { code: "NOT_FOUND", message: "Route not found" } }, 404);
}
