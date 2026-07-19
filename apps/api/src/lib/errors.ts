import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Operational error carrying the HTTP status and stable error code for the envelope. */
export class ApiError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
