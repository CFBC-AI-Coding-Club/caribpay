import { z } from "zod";
import { errorResponseSchema, refreshResponseSchema } from "@caribpay/shared";
import { API_BASE_URL, API_PREFIX } from "@/config";
import { useAuthStore } from "@/stores/auth";

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/**
 * The request never produced a response — offline, DNS failure, or our own
 * timeout. Distinct from ApiRequestError because the outcome is *unknown*: for a
 * write, the server may well have processed it. Callers must not tell the user
 * nothing happened.
 */
export class ApiUnreachableError extends Error {
  constructor(
    message: string,
    /** True when our own deadline fired rather than the connection failing. */
    public readonly timedOut: boolean,
  ) {
    super(message);
    this.name = "ApiUnreachableError";
  }
}

/**
 * How long to wait before giving up on a request. Long enough for a slow mobile
 * connection to finish a transfer, short enough that a spinner is never forever.
 */
const REQUEST_TIMEOUT_MS = 20_000;

export interface RequestOptions<T> {
  method?: "GET" | "POST";
  body?: unknown;
  /** Zod schema the successful response body is parsed with. Omit for 204. */
  schema?: z.ZodType<T>;
  /** Attach the bearer token and refresh-on-401. Default true. */
  auth?: boolean;
  idempotencyKey?: string;
}

// Single-flight refresh: concurrent 401s share one refresh round-trip.
let refreshInFlight: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    const { tokens, setTokens, signOut } = useAuthStore.getState();
    if (tokens === null) return false;
    try {
      const res = await fetch(`${API_BASE_URL}${API_PREFIX}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });
      if (!res.ok) {
        await signOut();
        return false;
      }
      const { tokens: rotated } = refreshResponseSchema.parse(await res.json());
      await setTokens({
        accessToken: rotated.accessToken,
        refreshToken: rotated.refreshToken,
      });
      return true;
    } catch {
      await signOut();
      return false;
    }
  })();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

async function rawRequest(path: string, options: RequestOptions<unknown>): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.auth !== false) {
    const { tokens } = useAuthStore.getState();
    if (tokens !== null) headers.Authorization = `Bearer ${tokens.accessToken}`;
  }
  if (options.idempotencyKey !== undefined) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  // Every request carries a deadline. Without one a stalled connection leaves the
  // caller's spinner running with no way out — worst of all on Confirm & send.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${API_BASE_URL}${API_PREFIX}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut = controller.signal.aborted;
    throw new ApiUnreachableError(
      timedOut ? "The request timed out" : "Could not reach CaribPay",
      timedOut,
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions<T> = {}): Promise<T> {
  let res = await rawRequest(path, options);

  if (res.status === 401 && options.auth !== false) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      res = await rawRequest(path, options);
    }
  }

  if (!res.ok) {
    let code = "HTTP_ERROR";
    let message = `Request failed (${res.status})`;
    try {
      const parsed = errorResponseSchema.parse(await res.json());
      code = parsed.error.code;
      message = parsed.error.message;
    } catch {
      // Non-envelope error body; keep the generic message.
    }
    throw new ApiRequestError(res.status, code, message);
  }

  if (options.schema === undefined) {
    return undefined as T;
  }
  return options.schema.parse(await res.json());
}
