import { and, eq, inArray, lt, or } from "drizzle-orm";
import {
  applyRate,
  bankStepKey,
  formatAmount,
  type Transaction,
  type TransferRequest,
} from "@caribpay/shared";
import type { DbHandle } from "../db/client";
import { institutions, linkedAccounts, transactions } from "../db/schema";
import { ApiError } from "../lib/errors";
import { isUniqueViolation } from "../lib/pg-errors";
import { enqueueTransfer } from "../lib/queue";
import { BankRefusedError, BankUnknownError, type BankConnector } from "../banks/connector";
import { connectorForInstitution } from "../banks/http-connector";
import { assertWithinDebitCap, postTransferClearing } from "./clearing";
import { resolveParty, type PartyView } from "./counterparties";
import { resolveKey } from "./directory";
import { getLatestRate, getQuote } from "./fx";
import { writeNotification } from "./notifications";

type TransactionRow = typeof transactions.$inferSelect;

/** How long a transfer may sit mid-saga before the sweeper takes it over. */
const SAGA_DEADLINE_MS = 60_000;

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
    recipientKeyUsed: row.recipientKeyUsed,
    recipientNameSnapshot: row.recipientNameSnapshot,
    senderUserId: row.senderUserId,
    recipientUserId: row.recipientUserId,
    failureReason: row.failureReason,
    settledAt: row.settledAt === null ? null : row.settledAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Accept a payment instruction.
 *
 * Nothing is asked of either bank here — the row is written, the job is queued,
 * and the saga runs in the worker. That keeps the request fast and, more
 * importantly, means every bank interaction happens somewhere that can be
 * retried and resumed.
 */
export async function createTransfer(
  dbh: DbHandle,
  userId: string,
  input: TransferRequest,
  idempotencyKey: string,
): Promise<{ transaction: Transaction; replayed: boolean }> {
  const payee = await resolveKey(dbh, userId, input.toKey);

  const [payerAccount] = await dbh
    .select()
    .from(linkedAccounts)
    .where(and(eq(linkedAccounts.id, input.sourceAccountId), eq(linkedAccounts.userId, userId)));
  if (payerAccount === undefined) {
    throw new ApiError(404, "ACCOUNT_NOT_FOUND", "That is not one of your accounts");
  }
  if (payerAccount.status !== "active") {
    throw new ApiError(422, "ACCOUNT_INACTIVE", "That account is not active");
  }
  if (payerAccount.currency !== input.sourceCurrency) {
    throw new ApiError(
      422,
      "SOURCE_CURRENCY_MISMATCH",
      `That account holds ${payerAccount.currency}, not ${input.sourceCurrency}`,
    );
  }
  if (payee.currency !== input.destCurrency) {
    throw new ApiError(
      422,
      "DEST_CURRENCY_MISMATCH",
      `They receive ${payee.currency}, not ${input.destCurrency}`,
    );
  }
  if (payerAccount.id === payee.accountId) {
    throw new ApiError(400, "SELF_TRANSFER", "Payer and payee accounts are the same");
  }

  // The destination amount is derived here and never taken from the client: a
  // caller that could name what the payee receives could name anything.
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

  // Checked before anything is reserved, so a capped bank's customer is declined
  // without their money being touched.
  await assertWithinDebitCap(
    dbh,
    payerAccount.institutionId,
    input.sourceCurrency,
    input.sourceAmountMinor,
  );

  let row: TransactionRow;
  try {
    const [inserted] = await dbh
      .insert(transactions)
      .values({
        type: "p2p_transfer",
        status: "initiated",
        idempotencyKey,
        senderUserId: userId,
        recipientUserId: payee.userId,
        payerAccountId: payerAccount.id,
        payeeAccountId: payee.accountId,
        sourceCurrency: input.sourceCurrency,
        destCurrency: input.destCurrency,
        sourceAmountMinor: input.sourceAmountMinor,
        destAmountMinor,
        fxRateUsed,
        note: input.note ?? null,
        recipientKeyUsed: payee.key,
        recipientNameSnapshot: payee.maskedName,
        deadlineAt: new Date(Date.now() + SAGA_DEADLINE_MS),
      })
      .returning();
    row = inserted!;
  } catch (error) {
    if (isUniqueViolation(error, "transactions_idempotency_key_unique")) {
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

  await enqueueTransfer(row.id);
  return {
    transaction: toPublicTransaction(row, await resolveParty(dbh, userId, row)),
    replayed: false,
  };
}

interface SagaContext {
  payerConnector: BankConnector;
  payeeConnector: BankConnector;
  payerAccountRef: string;
  payeeAccountRef: string;
  payerInstitutionId: string;
  payeeInstitutionId: string;
}

async function loadSagaContext(dbh: DbHandle, row: TransactionRow): Promise<SagaContext> {
  if (row.payerAccountId === null || row.payeeAccountId === null) {
    throw new Error(`Transfer ${row.id} has no payer or payee account`);
  }
  const accounts = await dbh
    .select({ account: linkedAccounts, institution: institutions })
    .from(linkedAccounts)
    .innerJoin(institutions, eq(institutions.id, linkedAccounts.institutionId))
    .where(inArray(linkedAccounts.id, [row.payerAccountId, row.payeeAccountId]));

  const payer = accounts.find((a) => a.account.id === row.payerAccountId);
  const payee = accounts.find((a) => a.account.id === row.payeeAccountId);
  if (payer === undefined || payee === undefined) {
    throw new Error(`Transfer ${row.id} references an account that no longer exists`);
  }

  return {
    payerConnector: connectorForInstitution(payer.institution.pspHandle),
    payeeConnector: connectorForInstitution(payee.institution.pspHandle),
    payerAccountRef: payer.account.accountRef,
    payeeAccountRef: payee.account.accountRef,
    payerInstitutionId: payer.institution.id,
    payeeInstitutionId: payee.institution.id,
  };
}

async function setStatus(
  dbh: DbHandle,
  id: string,
  patch: Partial<typeof transactions.$inferInsert>,
): Promise<TransactionRow> {
  const [row] = await dbh
    .update(transactions)
    .set({ ...patch, deadlineAt: new Date(Date.now() + SAGA_DEADLINE_MS) })
    .where(eq(transactions.id, id))
    .returning();
  return row!;
}

/**
 * Drive a transfer as far towards a terminal state as it can go.
 *
 * The single entry point for both the worker and the recovery sweeper, and safe
 * to call at any point in the lifecycle: each step is keyed on the transaction
 * id, so re-running one replays the bank's original answer rather than
 * repeating it.
 *
 * The rule the whole thing turns on: **a refusal is actionable, an unknown is
 * not.** `BankRefusedError` means the bank says it did not happen, so we may
 * fail or reverse. `BankUnknownError` — a timeout, a 5xx, an instruction still
 * running — means we do not know, and the only safe response is to throw and
 * come back later. Reversing on an unknown credit would leave the switch short.
 */
export async function driveTransfer(dbh: DbHandle, transactionId: string): Promise<void> {
  let row = await loadTransfer(dbh, transactionId);
  if (row === undefined || isTerminal(row.status)) return;

  const ctx = await loadSagaContext(dbh, row);

  // ── Step 1 · reserve the funds at the payer's bank ────────────────────────
  if (row.status === "initiated" || row.status === "debit_pending") {
    row = await setStatus(dbh, row.id, { status: "debit_pending" });
    try {
      const hold = await ctx.payerConnector.placeHold(
        {
          accountRef: ctx.payerAccountRef,
          amountMinor: row.sourceAmountMinor,
          currency: row.sourceCurrency,
          reference: row.id,
        },
        bankStepKey(row.id, "hold"),
      );
      row = await setStatus(dbh, row.id, { status: "debit_held", holdRef: hold.holdRef });
    } catch (error) {
      if (error instanceof BankRefusedError) {
        // Nothing was reserved, so nothing needs undoing and the ledger stays
        // untouched. This is the cheap failure.
        await finalizeFailed(dbh, row.id, error.code);
        return;
      }
      throw error;
    }
  }

  // ── Step 2 · pay the payee's bank ─────────────────────────────────────────
  if (row.status === "debit_held" || (row.status === "credit_pending" && row.creditRef === null)) {
    row = await setStatus(dbh, row.id, { status: "credit_pending" });
    try {
      const credit = await ctx.payeeConnector.postCredit(
        {
          accountRef: ctx.payeeAccountRef,
          amountMinor: row.destAmountMinor,
          currency: row.destCurrency,
          reference: row.id,
        },
        bankStepKey(row.id, "credit"),
      );
      row = await setStatus(dbh, row.id, { creditRef: credit.creditRef });
    } catch (error) {
      if (error instanceof BankRefusedError) {
        row = await setStatus(dbh, row.id, {
          status: "reversal_pending",
          failureReason: error.code,
        });
      } else {
        // Unknown. The credit may have landed; re-sending under the same key is
        // both the question and the fix, so leave it for the next attempt.
        throw error;
      }
    }
  }

  // ── Step 3 · draw the hold down and post the clearing entries ─────────────
  if (row.status === "credit_pending" && row.creditRef !== null) {
    const confirmed = await ctx.payerConnector.confirmDebit(
      row.holdRef!,
      bankStepKey(row.id, "confirm"),
    );
    await finalizeCompleted(dbh, row.id, confirmed.debitRef, ctx);
    return;
  }

  // ── Reversal · give the payer their money back ────────────────────────────
  if (row.status === "reversal_pending") {
    await ctx.payerConnector.releaseHold(row.holdRef!, bankStepKey(row.id, "release"));
    await finalizeReversed(dbh, row.id);
  }
}

async function loadTransfer(dbh: DbHandle, id: string): Promise<TransactionRow | undefined> {
  const [row] = await dbh.select().from(transactions).where(eq(transactions.id, id));
  return row;
}

function isTerminal(status: TransactionRow["status"]): boolean {
  return status === "completed" || status === "failed" || status === "reversed";
}

/**
 * The money has moved at both banks. Post the clearing entries, flip the status,
 * and tell the recipient — all in one DB transaction, so the ledger, the status
 * and the notification are a single fact.
 */
async function finalizeCompleted(
  dbh: DbHandle,
  transactionId: string,
  debitRef: string,
  ctx: SagaContext,
): Promise<void> {
  await dbh.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(transactions)
      .where(eq(transactions.id, transactionId))
      .for("update");
    if (row === undefined || row.status === "completed") return;

    await postTransferClearing(tx, row.id, {
      payerInstitutionId: ctx.payerInstitutionId,
      payeeInstitutionId: ctx.payeeInstitutionId,
      sourceCurrency: row.sourceCurrency,
      destCurrency: row.destCurrency,
      sourceAmountMinor: row.sourceAmountMinor,
      destAmountMinor: row.destAmountMinor,
    });

    await tx
      .update(transactions)
      .set({
        status: "completed",
        debitRef,
        settledAt: new Date(),
        deadlineAt: null,
        failureReason: null,
      })
      .where(eq(transactions.id, row.id));

    if (row.recipientUserId !== null) {
      await writeNotification(tx, {
        userId: row.recipientUserId,
        type: "transfer_received",
        title: "Money arrived",
        body: `${formatAmount(row.destAmountMinor, row.destCurrency)} from ${
          row.recipientNameSnapshot === null ? "someone" : "a CaribPay member"
        }`,
        data: { transactionId: row.id },
      });
    }
  });
}

/** The hold was refused. Nothing was posted, so nothing is undone. */
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
    if (row === undefined || isTerminal(row.status)) return;

    await tx
      .update(transactions)
      .set({ status: "failed", failureReason: reason, deadlineAt: null })
      .where(eq(transactions.id, row.id));

    if (row.senderUserId !== null) {
      await writeNotification(tx, {
        userId: row.senderUserId,
        type: "transfer_failed",
        title: "Transfer could not start",
        body: "No money left your account.",
        data: { transactionId: row.id, reason },
      });
    }
  });
}

/** The credit was refused and the hold has been released. */
async function finalizeReversed(dbh: DbHandle, transactionId: string): Promise<void> {
  await dbh.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(transactions)
      .where(eq(transactions.id, transactionId))
      .for("update");
    if (row === undefined || isTerminal(row.status)) return;

    await tx
      .update(transactions)
      .set({ status: "reversed", deadlineAt: null })
      .where(eq(transactions.id, row.id));

    if (row.senderUserId !== null) {
      await writeNotification(tx, {
        userId: row.senderUserId,
        type: "transfer_reversed",
        title: "Transfer reversed",
        body: "Your bank released the hold in full. No money left your account.",
        data: { transactionId: row.id },
      });
    }
  });
}

/**
 * Transfers that stopped mid-saga.
 *
 * Recovery always drives **forward**, never back: past the credit the money has
 * irrevocably reached the payee, so the only correct resolution is to finish. A
 * transfer whose credit outcome is unknown is resolved by re-sending it, which
 * `driveTransfer` does by construction.
 */
export async function findStalledTransfers(dbh: DbHandle, limit = 50): Promise<string[]> {
  const rows = await dbh
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        or(
          eq(transactions.status, "initiated"),
          eq(transactions.status, "debit_pending"),
          eq(transactions.status, "debit_held"),
          eq(transactions.status, "credit_pending"),
          eq(transactions.status, "reversal_pending"),
        ),
        lt(transactions.deadlineAt, new Date()),
      ),
    )
    .limit(limit);
  return rows.map((r) => r.id);
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

export { BankRefusedError, BankUnknownError };
