import { and, desc, eq } from "drizzle-orm";
import {
  FX_QUOTE_TTL_SECONDS,
  applyRate,
  fxQuoteSchema,
  type Currency,
  type FxQuote,
} from "@caribpay/shared";
import type { DbHandle } from "../db/client";
import { fxRates } from "../db/schema";
import { ApiError } from "../lib/errors";
import { redis } from "../lib/redis";

const quoteKey = (id: string) => `caribpay:fxquote:${id}`;

/** Latest seeded rate for a pair, as the exact numeric(18,8) decimal string. */
export async function getLatestRate(dbh: DbHandle, from: Currency, to: Currency): Promise<string> {
  const [row] = await dbh
    .select({ rate: fxRates.rate })
    .from(fxRates)
    .where(and(eq(fxRates.baseCurrency, from), eq(fxRates.quoteCurrency, to)))
    .orderBy(desc(fxRates.validFrom))
    .limit(1);
  if (row === undefined) {
    throw new ApiError(404, "RATE_UNAVAILABLE", `No rate available for ${from}/${to}`);
  }
  return row.rate;
}

export async function createQuote(
  dbh: DbHandle,
  from: Currency,
  to: Currency,
  sourceAmountMinor: number,
): Promise<FxQuote> {
  if (from === to) {
    throw new ApiError(400, "SAME_CURRENCY", "Quote requires two different currencies");
  }
  const rate = await getLatestRate(dbh, from, to);
  const quote: FxQuote = {
    id: crypto.randomUUID(),
    from,
    to,
    rate,
    sourceAmountMinor,
    destAmountMinor: applyRate(sourceAmountMinor, rate),
    expiresAt: new Date(Date.now() + FX_QUOTE_TTL_SECONDS * 1000).toISOString(),
  };
  await redis.set(quoteKey(quote.id), JSON.stringify(quote), "EX", FX_QUOTE_TTL_SECONDS);
  return quote;
}

/** null when the quote never existed or its 60 s window elapsed (redis TTL). */
export async function getQuote(quoteId: string): Promise<FxQuote | null> {
  const raw = await redis.get(quoteKey(quoteId));
  if (raw === null) return null;
  return fxQuoteSchema.parse(JSON.parse(raw));
}
