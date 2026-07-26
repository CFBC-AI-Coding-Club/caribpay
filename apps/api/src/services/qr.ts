import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  SUPPORTED_CURRENCIES,
  maskName,
  type Currency,
  type QrReceiveResponse,
  type QrResolveResponse,
} from "@caribpay/shared";
import type { DbHandle } from "../db/client";
import { linkedAccounts, users } from "../db/schema";
import { ApiError } from "../lib/errors";
import { env } from "../env";
import { primaryVpaFor, resolveKey } from "./directory";

// The signature covers every field so none can be swapped without invalidating
// it. HMAC-SHA256, hex, truncated to 160 bits (plenty, keeps the QR small).
function sign(vpa: string, currency: string, name: string, country: string): string {
  return createHmac("sha256", env.qrHmacSecret)
    .update(`${vpa}\n${currency}\n${name}\n${country}`)
    .digest("hex")
    .slice(0, 40);
}

function buildPayload(vpa: string, currency: Currency, name: string, country: string): string {
  const params = new URLSearchParams({
    vpa,
    currency,
    name,
    country,
    sig: sign(vpa, currency, name, country),
  });
  return `caribpay://pay?${params.toString()}`;
}

/**
 * The signed payload a receiver's screen encodes.
 *
 * It carries a VPA, never an account reference: a QR is shown in public and
 * photographed, and the directory should be the only thing that can turn an
 * address into an account. The name is the *masked* one, so scanning and
 * resolving agree about who you are paying.
 */
export async function buildReceivePayload(
  dbh: DbHandle,
  userId: string,
): Promise<QrReceiveResponse> {
  const [user] = await dbh
    .select({ fullName: users.fullName, countryCode: users.countryCode })
    .from(users)
    .where(eq(users.id, userId));
  if (user === undefined) {
    throw new ApiError(401, "UNAUTHORIZED", "Account no longer exists");
  }

  const vpa = await primaryVpaFor(dbh, userId);
  if (vpa === null) {
    throw new ApiError(422, "NO_ADDRESS", "You have no payment address yet");
  }

  // Resolving our own key would be refused, so read the routed currency directly.
  const currency = await routedCurrency(dbh, userId);
  if (currency === null) {
    throw new ApiError(
      422,
      "NO_LINKED_ACCOUNT",
      "Connect a bank account before sharing your code",
    );
  }

  const displayName = maskName(user.fullName);
  return {
    vpa,
    currency,
    displayName,
    countryCode: user.countryCode,
    payload: buildPayload(vpa, currency, displayName, user.countryCode),
  };
}

async function routedCurrency(dbh: DbHandle, userId: string): Promise<Currency | null> {
  const [row] = await dbh
    .select({ currency: linkedAccounts.currency })
    .from(linkedAccounts)
    .where(
      and(
        eq(linkedAccounts.userId, userId),
        eq(linkedAccounts.isDefault, true),
        eq(linkedAccounts.status, "active"),
      ),
    );
  return row?.currency ?? null;
}

function verifySignature(
  vpa: string,
  currency: string,
  name: string,
  country: string,
  sig: string,
): boolean {
  const expected = sign(vpa, currency, name, country);
  if (sig.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

/**
 * Parse and verify a `caribpay://pay?...` payload. Rejects anything whose
 * signature does not match — a tampered address, currency, or name.
 */
export function resolvePayload(payload: string): QrResolveResponse {
  let url: URL;
  try {
    url = new URL(payload);
  } catch {
    throw new ApiError(400, "QR_INVALID", "Malformed QR payload");
  }
  if (url.protocol !== "caribpay:" || url.hostname !== "pay") {
    throw new ApiError(400, "QR_INVALID", "Not a CaribPay payment QR");
  }
  const vpa = url.searchParams.get("vpa") ?? "";
  const currency = url.searchParams.get("currency") ?? "";
  const name = url.searchParams.get("name") ?? "";
  const country = url.searchParams.get("country") ?? "";
  const sig = url.searchParams.get("sig") ?? "";

  if (vpa === "" || !isSupportedCurrency(currency) || country.length !== 2) {
    throw new ApiError(400, "QR_INVALID", "QR payload is missing required fields");
  }
  if (!verifySignature(vpa, currency, name, country, sig)) {
    throw new ApiError(400, "QR_SIGNATURE_INVALID", "QR signature does not verify");
  }
  return { vpa, currency, displayName: name, countryCode: country };
}

function isSupportedCurrency(value: string): value is Currency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

/** Re-exported so the scan route can confirm the code still resolves to someone. */
export { resolveKey };
