import { and, eq } from "drizzle-orm";
import { applyRate, type Currency, type Transaction, type TransferRequest } from "@caribpay/shared";
import type { DbHandle } from "../db/client";
import { systemAccounts, transactions, users, wallets } from "../db/schema";
import { ApiError } from "../lib/errors";
import { isUniqueViolation } from "../lib/pg-errors";
import { enqueueSettlement } from "../lib/queue";
import { resolveParty, type PartyView } from "./counterparties";
import { getLatestRate, getQuote } from "./fx";
import {
  InsufficientBalanceError,
  assertSufficientBalance,
  postLedgerEntries,
} from "./ledger";

type TransactionRow = typeof transactions.$inferSelect;

/**
 * Shape a transaction row for the API. `party` is viewer-relative (who the other
 * side is, and whether the money came in or went out), so it is a required
 * argument — there is no correct viewer-agnostic answer.
 */
export function toPublicTransaction(row: TransactionRow, party: PartyView): Transaction {
  return {
    id: row.id,
    direction: party.direction,
    counterparty: party.counterparty,
    type: row.type,
    status: row.status,
    sourceCurrency: row.sourceCurrency,
    destCurrency: row.destCurrency,
    sourceAmountMinor: row.sourceAmountMinor,
    destAmountMinor: row.destAmountMinor,
    fxRateUsed: row.fxRateUsed,
    note: row.note,
    senderUserId: row.senderUserId,
    recipientUserId: row.recipientUserId,
    failureReason: row.failureReason,
    settledAt: row.settledAt === null ? null : row.settledAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The hold account is the internal counterparty for the sender leg: the fx
 * liquidity pool for cross-currency transfers, the clearing account for
 * same-currency ones. Settlement uses the matching account on the dest side.
 */
async function systemAccountId(
  dbh: DbHandle,
  type: "fx_liquidity" | "settlement_clearing",
  currency: Currency,
): Promise<string> {
  const [row] = await dbh
    .select({ id: systemAccounts.id })
    .from(systemAccounts)
    .where(and(eq(systemAccounts.type, type), eq(systemAccounts.currency, currency)));
  if (row === undefined) {
    throw new Error(`System account ${type}:${currency} is not seeded`);
  }
  return row.id;
}

function holdAccountType(sourceCurrency: Currency, destCurrency: Currency) {
  return sourceCurrency === destCurrency ? ("settlement_clearing" as const) : ("fx_liquidity" as const);
}

async function walletOf(
  dbh: DbHandle,
  userId: string,
  currency: Currency,
): Promise<{ id: string } | undefined> {
  const [row] = await dbh
    .select({ id: wallets.id })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.currency, currency)));
  return row;
}

export async function createTransfer(
  dbh: DbHandle,
  userId: string,
  input: TransferRequest,
  idempotencyKey: string,
): Promise<{ transaction: Transaction; replayed: boolean }> {
  const [recipient] = await dbh
    .select({ walletId: wallets.id, walletCurrency: wallets.currency, userId: wallets.userId })
    .from(wallets)
    .innerJoin(users, eq(users.id, wallets.userId))
    .where(eq(wallets.address, input.recipientAddress));
  if (recipient === undefined) {
    throw new ApiError(404, "RECIPIENT_NOT_FOUND", "No wallet found for that address");
  }
  if (recipient.walletCurrency !== input.destCurrency) {
    throw new ApiError(
      422,
      "RECIPIENT_CURRENCY_MISMATCH",
      `Recipient wallet holds ${recipient.walletCurrency}, not ${input.destCurrency}`,
    );
  }

  const senderWallet = await walletOf(dbh, userId, input.sourceCurrency);
  if (senderWallet === undefined) {
    throw new ApiError(422, "NO_SOURCE_WALLET", `You have no ${input.sourceCurrency} wallet`);
  }
  if (senderWallet.id === recipient.walletId) {
    throw new ApiError(400, "SELF_TRANSFER", "Sender and recipient wallets are the same");
  }

  let destAmountMinor: number;
  let fxRateUsed: string | null;
  if (input.sourceCurrency === input.destCurrency) {
    destAmountMinor = input.sourceAmountMinor;
    fxRateUsed = null;
  } else if (input.quoteId !== undefined) {
    const quote = await getQuote(input.quoteId);
    if (quote === null) {
      throw new ApiError(410, "QUOTE_EXPIRED", "The quote has expired; request a new one");
    }
    if (
      quote.from !== input.sourceCurrency ||
      quote.to !== input.destCurrency ||
      quote.sourceAmountMinor !== input.sourceAmountMinor
    ) {
      throw new ApiError(422, "QUOTE_MISMATCH", "The quote does not match this transfer");
    }
    destAmountMinor = quote.destAmountMinor;
    fxRateUsed = quote.rate;
  } else {
    fxRateUsed = await getLatestRate(dbh, input.sourceCurrency, input.destCurrency);
    destAmountMinor = applyRate(input.sourceAmountMinor, fxRateUsed);
  }

  const holdAccount = await systemAccountId(
    dbh,
    holdAccountType(input.sourceCurrency, input.destCurrency),
    input.sourceCurrency,
  );

  let row: TransactionRow;
  try {
    row = await dbh.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(transactions)
        .values({
          type: "p2p_transfer",
          status: "initiated",
          idempotencyKey,
          senderUserId: userId,
          recipientUserId: recipient.userId,
          sourceCurrency: input.sourceCurrency,
          destCurrency: input.destCurrency,
          sourceAmountMinor: input.sourceAmountMinor,
          destAmountMinor,
          fxRateUsed,
          note: input.note ?? null,
        })
        .returning();
      await assertSufficientBalance(tx, senderWallet.id, input.sourceAmountMinor);
      await postLedgerEntries(tx, inserted!.id, [
        {
          accountType: "user_wallet",
          walletId: senderWallet.id,
          direction: "debit",
          amountMinor: input.sourceAmountMinor,
          currency: input.sourceCurrency,
        },
        {
          accountType: "system",
          systemAccountId: holdAccount,
          direction: "credit",
          amountMinor: input.sourceAmountMinor,
          currency: input.sourceCurrency,
        },
      ]);
      const [updated] = await tx
        .update(transactions)
        .set({ status: "pending_settlement" })
        .where(eq(transactions.id, inserted!.id))
        .returning();
      return updated!;
    });
  } catch (error) {
    if (error instanceof InsufficientBalanceError) {
      throw new ApiError(422, "INSUFFICIENT_BALANCE", "Balance does not cover this transfer");
    }
    if (isUniqueViolation(error, "transactions_idempotency_key_unique")) {
      // Lost a same-key race: the transfer already exists, return it.
      const [existing] = await dbh
        .select()
        .from(transactions)
        .where(eq(transactions.idempotencyKey, idempotencyKey));
      if (existing !== undefined && existing.senderUserId === userId) {
        const party = await resolveParty(dbh, userId, existing);
        return { transaction: toPublicTransaction(existing, party), replayed: true };
      }
      throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "Idempotency key belongs to another request");
    }
    throw error;
  }

  await enqueueSettlement(row.id);
  return {
    transaction: toPublicTransaction(row, await resolveParty(dbh, userId, row)),
    replayed: false,
  };
}

/** Post the credit leg and flip to settled. No-op unless still pending_settlement. */
export async function finalizeSettled(dbh: DbHandle, transactionId: string): Promise<void> {
  await dbh.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(transactions)
      .where(eq(transactions.id, transactionId))
      .for("update");
    if (row === undefined || row.status !== "pending_settlement") return;
    if (row.recipientUserId === null) throw new Error(`Transfer ${transactionId} has no recipient`);
    const recipientWallet = await walletOf(tx, row.recipientUserId, row.destCurrency);
    if (recipientWallet === undefined) {
      throw new Error(`Recipient wallet for ${transactionId} disappeared`);
    }
    const destAccount = await systemAccountId(
      tx,
      holdAccountType(row.sourceCurrency, row.destCurrency),
      row.destCurrency,
    );
    await postLedgerEntries(tx, row.id, [
      {
        accountType: "system",
        systemAccountId: destAccount,
        direction: "debit",
        amountMinor: row.destAmountMinor,
        currency: row.destCurrency,
      },
      {
        accountType: "user_wallet",
        walletId: recipientWallet.id,
        direction: "credit",
        amountMinor: row.destAmountMinor,
        currency: row.destCurrency,
      },
    ]);
    await tx
      .update(transactions)
      .set({ status: "settled", settledAt: new Date() })
      .where(eq(transactions.id, row.id));
  });
}

/** Reverse the hold and flip to failed. No-op unless still pending_settlement. */
export async function finalizeFailed(
  dbh: DbHandle,
  transactionId: string,
  reason: string,
): Promise<void> {
  await dbh.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(transactions)
      .where(eq(transactions.id, transactionId))
      .for("update");
    if (row === undefined || row.status !== "pending_settlement") return;
    if (row.senderUserId === null) throw new Error(`Transfer ${transactionId} has no sender`);
    const senderWallet = await walletOf(tx, row.senderUserId, row.sourceCurrency);
    if (senderWallet === undefined) {
      throw new Error(`Sender wallet for ${transactionId} disappeared`);
    }
    const holdAccount = await systemAccountId(
      tx,
      holdAccountType(row.sourceCurrency, row.destCurrency),
      row.sourceCurrency,
    );
    await postLedgerEntries(tx, row.id, [
      {
        accountType: "system",
        systemAccountId: holdAccount,
        direction: "debit",
        amountMinor: row.sourceAmountMinor,
        currency: row.sourceCurrency,
      },
      {
        accountType: "user_wallet",
        walletId: senderWallet.id,
        direction: "credit",
        amountMinor: row.sourceAmountMinor,
        currency: row.sourceCurrency,
      },
    ]);
    await tx
      .update(transactions)
      .set({ status: "failed", failureReason: reason })
      .where(eq(transactions.id, row.id));
  });
}

/** A transfer is visible to its sender and its recipient only. */
export async function getTransferForUser(
  dbh: DbHandle,
  userId: string,
  transactionId: string,
): Promise<Transaction> {
  const [row] = await dbh.select().from(transactions).where(eq(transactions.id, transactionId));
  if (row === undefined || (row.senderUserId !== userId && row.recipientUserId !== userId)) {
    throw new ApiError(404, "TRANSFER_NOT_FOUND", "Transfer not found");
  }
  return toPublicTransaction(row, await resolveParty(dbh, userId, row));
}
