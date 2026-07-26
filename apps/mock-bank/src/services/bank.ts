import { and, eq, lt, sql } from "drizzle-orm";
import type {
  BankBalanceResponse,
  ConfirmDebitResponse,
  CreditResponse,
  Currency,
  HoldResponse,
  OutstandingHold,
  VerifyAccountResponse,
} from "@caribpay/shared";
import type { DbHandle } from "../db/client";
import { accounts, credits, debits, holds } from "../db/schema";
import { BankError } from "../lib/errors";
import { env } from "../env";

/** Last four digits, the way a bank shows an account back to its holder. */
function maskAccountRef(accountRef: string): string {
  return `••••${accountRef.slice(-4)}`;
}

/**
 * Move any hold past its deadline to `expired`.
 *
 * Run before every balance read and every new hold, so an abandoned instruction
 * cannot keep someone's money reserved indefinitely. This is the bank's own
 * safety net: it holds even if the switch never comes back.
 */
export async function expireStaleHolds(dbh: DbHandle): Promise<number> {
  const expired = await dbh
    .update(holds)
    .set({ status: "expired" })
    .where(and(eq(holds.status, "outstanding"), lt(holds.expiresAt, new Date())))
    .returning({ holdRef: holds.holdRef });
  return expired.length;
}

async function outstandingTotal(dbh: DbHandle, accountRef: string): Promise<number> {
  const [row] = await dbh
    .select({
      total: sql<string>`COALESCE(SUM(${holds.amountMinor}), 0)::text`,
    })
    .from(holds)
    .where(and(eq(holds.accountRef, accountRef), eq(holds.status, "outstanding")));
  return Number(row?.total ?? 0);
}

async function requireAccount(dbh: DbHandle, accountRef: string, forUpdate = false) {
  const query = dbh.select().from(accounts).where(eq(accounts.accountRef, accountRef));
  const [row] = forUpdate ? await query.for("update") : await query;
  if (row === undefined) {
    throw new BankError(404, "ACCOUNT_NOT_FOUND", "No account with that reference");
  }
  return row;
}

export async function verifyAccount(
  dbh: DbHandle,
  accountRef: string,
): Promise<VerifyAccountResponse> {
  const [row] = await dbh.select().from(accounts).where(eq(accounts.accountRef, accountRef));
  if (row === undefined) {
    // Not an error: "does this exist" is a question with a legitimate no.
    return { exists: false, holderName: null, currency: null, status: null, accountNumberMasked: null };
  }
  return {
    exists: true,
    holderName: row.holderName,
    currency: row.currency,
    status: row.status,
    accountNumberMasked: maskAccountRef(row.accountRef),
  };
}

export async function getBalance(dbh: DbHandle, accountRef: string): Promise<BankBalanceResponse> {
  await expireStaleHolds(dbh);
  const account = await requireAccount(dbh, accountRef);
  const held = await outstandingTotal(dbh, accountRef);
  return {
    accountRef: account.accountRef,
    currency: account.currency,
    balanceMinor: account.balanceMinor,
    availableMinor: account.balanceMinor - held,
    asOf: new Date().toISOString(),
  };
}

export async function placeHold(
  dbh: DbHandle,
  input: { accountRef: string; amountMinor: number; currency: Currency; reference: string },
): Promise<HoldResponse> {
  return await dbh.transaction(async (tx) => {
    await expireStaleHolds(tx);
    const account = await requireAccount(tx, input.accountRef, true);

    if (account.status === "closed") {
      throw new BankError(409, "ACCOUNT_CLOSED", "That account is closed");
    }
    if (account.status === "frozen") {
      throw new BankError(409, "ACCOUNT_FROZEN", "That account is frozen");
    }
    if (account.currency !== input.currency) {
      throw new BankError(
        422,
        "CURRENCY_MISMATCH",
        `Account holds ${account.currency}, not ${input.currency}`,
      );
    }

    const held = await outstandingTotal(tx, input.accountRef);
    const available = account.balanceMinor - held;
    if (available < input.amountMinor) {
      throw new BankError(422, "INSUFFICIENT_FUNDS", "Available balance does not cover this debit");
    }

    const expiresAt = new Date(Date.now() + env.holdTtlSeconds * 1000);
    const [row] = await tx
      .insert(holds)
      .values({
        holdRef: `HOLD-${crypto.randomUUID()}`,
        accountRef: input.accountRef,
        amountMinor: input.amountMinor,
        currency: input.currency,
        reference: input.reference,
        expiresAt,
      })
      .returning();

    return {
      holdRef: row!.holdRef,
      amountMinor: row!.amountMinor,
      currency: row!.currency,
      expiresAt: row!.expiresAt.toISOString(),
    };
  });
}

/**
 * Draw a hold down into a settled debit. This is the point money actually
 * leaves the account.
 *
 * Idempotent at the domain level as well as over the wire: confirming an
 * already-confirmed hold returns the original debit rather than moving money
 * twice, so even an instruction replayed under a *different* key is safe.
 */
export async function confirmDebit(dbh: DbHandle, holdRef: string): Promise<ConfirmDebitResponse> {
  return await dbh.transaction(async (tx) => {
    const [hold] = await tx.select().from(holds).where(eq(holds.holdRef, holdRef)).for("update");
    if (hold === undefined) {
      throw new BankError(404, "HOLD_NOT_FOUND", "No hold with that reference");
    }

    if (hold.status === "confirmed") {
      const [existing] = await tx.select().from(debits).where(eq(debits.holdRef, holdRef));
      if (existing === undefined) {
        throw new Error(`Hold ${holdRef} is confirmed but has no debit`);
      }
      return {
        debitRef: existing.debitRef,
        holdRef,
        amountMinor: existing.amountMinor,
        settledAt: existing.settledAt.toISOString(),
      };
    }
    if (hold.status === "released") {
      throw new BankError(409, "HOLD_NOT_FOUND", "That hold was already released");
    }
    if (hold.status === "expired" || hold.expiresAt.getTime() <= Date.now()) {
      throw new BankError(409, "HOLD_EXPIRED", "That hold expired before it was confirmed");
    }

    await tx
      .update(accounts)
      .set({ balanceMinor: sql`${accounts.balanceMinor} - ${hold.amountMinor}` })
      .where(eq(accounts.accountRef, hold.accountRef));
    await tx.update(holds).set({ status: "confirmed" }).where(eq(holds.holdRef, holdRef));

    const [debit] = await tx
      .insert(debits)
      .values({
        debitRef: `DR-${crypto.randomUUID()}`,
        holdRef,
        accountRef: hold.accountRef,
        amountMinor: hold.amountMinor,
        currency: hold.currency,
      })
      .returning();

    return {
      debitRef: debit!.debitRef,
      holdRef,
      amountMinor: debit!.amountMinor,
      settledAt: debit!.settledAt.toISOString(),
    };
  });
}

/**
 * Give the money back. Releasing an already-released or expired hold succeeds:
 * the switch retries releases to exhaustion, and a release that reports failure
 * because it already worked would strand the transfer in `reversal_pending`.
 */
export async function releaseHold(dbh: DbHandle, holdRef: string): Promise<{ released: true }> {
  return await dbh.transaction(async (tx) => {
    const [hold] = await tx.select().from(holds).where(eq(holds.holdRef, holdRef)).for("update");
    if (hold === undefined) {
      throw new BankError(404, "HOLD_NOT_FOUND", "No hold with that reference");
    }
    if (hold.status === "confirmed") {
      throw new BankError(409, "HOLD_ALREADY_SETTLED", "That hold was already drawn down");
    }
    if (hold.status === "outstanding") {
      await tx.update(holds).set({ status: "released" }).where(eq(holds.holdRef, holdRef));
    }
    return { released: true as const };
  });
}

export async function postCredit(
  dbh: DbHandle,
  input: { accountRef: string; amountMinor: number; currency: Currency; reference: string },
): Promise<CreditResponse> {
  return await dbh.transaction(async (tx) => {
    const account = await requireAccount(tx, input.accountRef, true);
    if (account.status === "closed") {
      throw new BankError(409, "ACCOUNT_CLOSED", "That account is closed");
    }
    if (account.currency !== input.currency) {
      throw new BankError(
        422,
        "CURRENCY_MISMATCH",
        `Account holds ${account.currency}, not ${input.currency}`,
      );
    }

    await tx
      .update(accounts)
      .set({ balanceMinor: sql`${accounts.balanceMinor} + ${input.amountMinor}` })
      .where(eq(accounts.accountRef, input.accountRef));

    const [credit] = await tx
      .insert(credits)
      .values({
        creditRef: `CR-${crypto.randomUUID()}`,
        accountRef: input.accountRef,
        amountMinor: input.amountMinor,
        currency: input.currency,
        reference: input.reference,
      })
      .returning();

    return {
      creditRef: credit!.creditRef,
      amountMinor: credit!.amountMinor,
      postedAt: credit!.postedAt.toISOString(),
    };
  });
}

/** Every hold still reserving funds. `reconcile` asserts this is empty at rest. */
export async function listOutstandingHolds(dbh: DbHandle): Promise<OutstandingHold[]> {
  await expireStaleHolds(dbh);
  const rows = await dbh.select().from(holds).where(eq(holds.status, "outstanding"));
  return rows.map((row) => ({
    holdRef: row.holdRef,
    accountRef: row.accountRef,
    amountMinor: row.amountMinor,
    currency: row.currency,
    reference: row.reference,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  }));
}
