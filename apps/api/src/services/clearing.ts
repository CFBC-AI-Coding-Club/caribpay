import { and, eq, isNull, sql } from "drizzle-orm";
import type { Currency } from "@caribpay/shared";
import type { DbHandle } from "../db/client";
import { institutions, ledgerEntries, systemAccounts } from "../db/schema";
import { ApiError } from "../lib/errors";
import { postLedgerEntries, type LedgerEntryInput } from "./ledger";

/**
 * The clearing ledger accounts for **inter-bank positions**, not customer money.
 *
 * Sign convention, used everywhere: `position = credits − debits`.
 *   negative → that bank owes the network
 *   positive → the network owes that bank
 *
 * A payer's bank collected money from its customer, so it is debited and goes
 * negative. A payee's bank fronted money to its customer, so it is credited and
 * goes positive. Between settlement cycles those positions are exactly the
 * intraday exposure the prefunded caps bound.
 */
export async function bankPositionAccountId(
  dbh: DbHandle,
  institutionId: string,
  currency: Currency,
): Promise<string> {
  const [row] = await dbh
    .select({ id: systemAccounts.id })
    .from(systemAccounts)
    .where(
      and(
        eq(systemAccounts.type, "bank_position"),
        eq(systemAccounts.currency, currency),
        eq(systemAccounts.institutionId, institutionId),
      ),
    );
  if (row === undefined) {
    throw new Error(`No bank_position account for institution ${institutionId} in ${currency}`);
  }
  return row.id;
}

/** fx_liquidity, settlement_clearing, fee_revenue — the accounts with no institution. */
export async function globalAccountId(
  dbh: DbHandle,
  type: "fx_liquidity" | "settlement_clearing" | "fee_revenue",
  currency: Currency,
): Promise<string> {
  const [row] = await dbh
    .select({ id: systemAccounts.id })
    .from(systemAccounts)
    .where(
      and(
        eq(systemAccounts.type, type),
        eq(systemAccounts.currency, currency),
        isNull(systemAccounts.institutionId),
      ),
    );
  if (row === undefined) {
    throw new Error(`System account ${type}:${currency} is not seeded`);
  }
  return row.id;
}

export async function positionOf(dbh: DbHandle, systemAccountId: string): Promise<number> {
  const [row] = await dbh
    .select({
      net: sql<string>`COALESCE(SUM(CASE WHEN ${ledgerEntries.direction} = 'credit' THEN ${ledgerEntries.amountMinor} ELSE -${ledgerEntries.amountMinor} END), 0)::text`,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.systemAccountId, systemAccountId));
  return Number(row?.net ?? 0);
}

/**
 * Would this transfer push the payer's bank past what it has prefunded?
 *
 * Checked **before the hold is placed**, so a capped bank's customer is declined
 * without their money ever being reserved. This is the honest answer to who
 * carries the risk between an instant credit and a netted settlement: the payee's
 * bank does, bounded by this number.
 */
export async function assertWithinDebitCap(
  dbh: DbHandle,
  institutionId: string,
  currency: Currency,
  amountMinor: number,
): Promise<void> {
  const [account] = await dbh
    .select({ id: systemAccounts.id, cap: systemAccounts.debitCapMinor })
    .from(systemAccounts)
    .where(
      and(
        eq(systemAccounts.type, "bank_position"),
        eq(systemAccounts.currency, currency),
        eq(systemAccounts.institutionId, institutionId),
      ),
    );
  if (account === undefined) {
    throw new ApiError(422, "BANK_NOT_IN_SCHEME", "That bank is not settled in this currency");
  }
  if (account.cap === null) return;

  const position = await positionOf(dbh, account.id);
  if (position - amountMinor < -account.cap) {
    throw new ApiError(
      422,
      "BANK_CAP_EXCEEDED",
      "That bank has reached its settlement limit for now",
    );
  }
}

export interface ClearingPosting {
  payerInstitutionId: string;
  payeeInstitutionId: string;
  sourceCurrency: Currency;
  destCurrency: Currency;
  sourceAmountMinor: number;
  destAmountMinor: number;
}

/**
 * Post a completed transfer to the clearing ledger.
 *
 * Same currency is one balanced leg between the two banks. Cross-currency is two
 * legs that balance *independently within their own currency*, with the switch's
 * FX book standing between them — which is what makes an XCD → JMD transfer a
 * single regional movement rather than two hops through the US dollar.
 */
export async function postTransferClearing(
  dbh: DbHandle,
  transactionId: string,
  input: ClearingPosting,
): Promise<void> {
  const payer = await bankPositionAccountId(dbh, input.payerInstitutionId, input.sourceCurrency);

  if (input.sourceCurrency === input.destCurrency) {
    const payee = await bankPositionAccountId(dbh, input.payeeInstitutionId, input.destCurrency);
    await postLedgerEntries(dbh, transactionId, [
      {
        systemAccountId: payer,
        direction: "debit",
        amountMinor: input.sourceAmountMinor,
        currency: input.sourceCurrency,
      },
      {
        systemAccountId: payee,
        direction: "credit",
        amountMinor: input.destAmountMinor,
        currency: input.destCurrency,
      },
    ]);
    return;
  }

  const fxSource = await globalAccountId(dbh, "fx_liquidity", input.sourceCurrency);
  const fxDest = await globalAccountId(dbh, "fx_liquidity", input.destCurrency);
  const payee = await bankPositionAccountId(dbh, input.payeeInstitutionId, input.destCurrency);

  const entries: LedgerEntryInput[] = [
    {
      systemAccountId: payer,
      direction: "debit",
      amountMinor: input.sourceAmountMinor,
      currency: input.sourceCurrency,
    },
    {
      systemAccountId: fxSource,
      direction: "credit",
      amountMinor: input.sourceAmountMinor,
      currency: input.sourceCurrency,
    },
    {
      systemAccountId: fxDest,
      direction: "debit",
      amountMinor: input.destAmountMinor,
      currency: input.destCurrency,
    },
    {
      systemAccountId: payee,
      direction: "credit",
      amountMinor: input.destAmountMinor,
      currency: input.destCurrency,
    },
  ];
  await postLedgerEntries(dbh, transactionId, entries);
}

export interface BankPosition {
  institutionId: string;
  institutionDisplayName: string;
  pspHandle: string | null;
  currency: Currency;
  positionMinor: number;
  debitCapMinor: number | null;
}

/** Every bank's position, for `GET /settlement/positions` and `reconcile`. */
export async function listBankPositions(dbh: DbHandle): Promise<BankPosition[]> {
  const rows = await dbh
    .select({
      accountId: systemAccounts.id,
      institutionId: systemAccounts.institutionId,
      currency: systemAccounts.currency,
      debitCapMinor: systemAccounts.debitCapMinor,
      displayName: institutions.displayName,
      pspHandle: institutions.pspHandle,
    })
    .from(systemAccounts)
    .innerJoin(institutions, eq(institutions.id, systemAccounts.institutionId))
    .where(eq(systemAccounts.type, "bank_position"))
    .orderBy(institutions.sortOrder, systemAccounts.currency);

  const positions: BankPosition[] = [];
  for (const row of rows) {
    positions.push({
      institutionId: row.institutionId!,
      institutionDisplayName: row.displayName,
      pspHandle: row.pspHandle,
      currency: row.currency,
      positionMinor: await positionOf(dbh, row.accountId),
      debitCapMinor: row.debitCapMinor,
    });
  }
  return positions;
}

/** The switch's own FX exposure — long in one currency, short in another. */
export async function fxBookPositions(
  dbh: DbHandle,
): Promise<Array<{ currency: Currency; positionMinor: number }>> {
  const rows = await dbh
    .select({ id: systemAccounts.id, currency: systemAccounts.currency })
    .from(systemAccounts)
    .where(and(eq(systemAccounts.type, "fx_liquidity"), isNull(systemAccounts.institutionId)))
    .orderBy(systemAccounts.currency);

  const out: Array<{ currency: Currency; positionMinor: number }> = [];
  for (const row of rows) {
    out.push({ currency: row.currency, positionMinor: await positionOf(dbh, row.id) });
  }
  return out;
}
