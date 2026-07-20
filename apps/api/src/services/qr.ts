import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  SUPPORTED_CURRENCIES,
  WALLET_ADDRESS_PATTERN,
  homeCurrencyFor,
  type Currency,
  type QrReceiveResponse,
  type QrResolveResponse,
} from "@caribpay/shared";
import type { DbHandle } from "../db/client";
import { users, wallets } from "../db/schema";
import { ApiError } from "../lib/errors";
import { env } from "../env";

// The signature covers address + currency + name so none can be swapped without
// invalidating it. HMAC-SHA256, hex, truncated to 160 bits (plenty, keeps the
// QR small).
function sign(address: string, currency: string, name: string): string {
  return createHmac("sha256", env.qrHmacSecret)
    .update(`${address}\n${currency}\n${name}`)
    .digest("hex")
    .slice(0, 40);
}

function buildPayload(address: string, currency: Currency, name: string): string {
  const params = new URLSearchParams({
    address,
    currency,
    name,
    sig: sign(address, currency, name),
  });
  return `caribpay://pay?${params.toString()}`;
}

/**
 * The signed QR payload for the caller's wallet. Defaults to the user's home
 * currency wallet, which always exists (created at registration).
 */
export async function buildReceivePayload(
  dbh: DbHandle,
  userId: string,
  currency?: Currency,
): Promise<QrReceiveResponse> {
  const [user] = await dbh
    .select({ fullName: users.fullName, countryCode: users.countryCode })
    .from(users)
    .where(eq(users.id, userId));
  if (user === undefined) {
    throw new ApiError(401, "UNAUTHORIZED", "Account no longer exists");
  }
  const resolvedCurrency = currency ?? homeCurrencyFor(user.countryCode);

  const [row] = await dbh
    .select({ address: wallets.address })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.currency, resolvedCurrency)));
  if (row === undefined) {
    throw new ApiError(404, "WALLET_NOT_FOUND", `You have no ${resolvedCurrency} wallet`);
  }
  return {
    walletAddress: row.address,
    currency: resolvedCurrency,
    displayName: user.fullName,
    payload: buildPayload(row.address, resolvedCurrency, user.fullName),
  };
}

function verifySignature(address: string, currency: string, name: string, sig: string): boolean {
  const expected = sign(address, currency, name);
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
  const address = url.searchParams.get("address") ?? "";
  const currency = url.searchParams.get("currency") ?? "";
  const name = url.searchParams.get("name") ?? "";
  const sig = url.searchParams.get("sig") ?? "";

  if (!WALLET_ADDRESS_PATTERN.test(address) || !isSupportedCurrency(currency)) {
    throw new ApiError(400, "QR_INVALID", "QR payload is missing required fields");
  }
  if (!verifySignature(address, currency, name, sig)) {
    throw new ApiError(400, "QR_SIGNATURE_INVALID", "QR signature does not verify");
  }
  return { walletAddress: address, currency, displayName: name };
}

function isSupportedCurrency(value: string): value is Currency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}
