import { SQL } from "bun";
import { and, eq } from "drizzle-orm";
import { drizzle, type BunSQLDatabase } from "drizzle-orm/bun-sql";
import type { Currency } from "@caribpay/shared";
import * as schema from "../src/db/schema";
import { runMigrations } from "../src/db/migrate";
import { postLedgerEntries } from "../src/services/ledger";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://caribpay:caribpay@localhost:5432/caribpay_test";

export interface TestDb {
  db: BunSQLDatabase<typeof schema>;
  client: SQL;
}

export async function setupTestDb(): Promise<TestDb> {
  const dbName = new URL(TEST_DATABASE_URL).pathname.slice(1);
  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = "/postgres";
  const admin = new SQL(adminUrl.toString(), { max: 1 });
  try {
    const exists = await admin`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
    if (exists.length === 0) {
      await admin.unsafe(`CREATE DATABASE "${dbName}"`);
    }
    // A crashed or killed previous run can leave sessions idle in transaction,
    // which deadlocks this run's TRUNCATEs. Clear them out before starting.
    await admin`
      SELECT pg_terminate_backend(pid) FROM pg_stat_activity
      WHERE datname = ${dbName} AND pid <> pg_backend_pid()
    `;
  } finally {
    await admin.close();
  }
  await runMigrations(TEST_DATABASE_URL);
  const client = new SQL(TEST_DATABASE_URL);
  return { db: drizzle({ client, schema }), client };
}

export async function truncateAll(client: SQL): Promise<void> {
  await client`
    TRUNCATE users, refresh_tokens, wallets, system_accounts, transactions,
             ledger_entries, wallet_balances, fx_rates, idempotency_records
    RESTART IDENTITY CASCADE
  `;
}

/** Credit a wallet via an honest deposit posting against settlement_clearing. */
export async function fundWalletForTest(
  db: BunSQLDatabase<typeof schema>,
  walletId: string,
  currency: Currency,
  amountMinor: number,
): Promise<string> {
  const [sysAccount] = await db
    .select({ id: schema.systemAccounts.id })
    .from(schema.systemAccounts)
    .where(
      and(
        eq(schema.systemAccounts.type, "settlement_clearing"),
        eq(schema.systemAccounts.currency, currency),
      ),
    );
  if (sysAccount === undefined) {
    throw new Error(`System accounts not seeded (missing settlement_clearing:${currency})`);
  }
  const [txRow] = await db
    .insert(schema.transactions)
    .values({
      type: "deposit",
      status: "settled",
      idempotencyKey: crypto.randomUUID(),
      sourceCurrency: currency,
      destCurrency: currency,
      sourceAmountMinor: amountMinor,
      destAmountMinor: amountMinor,
    })
    .returning({ id: schema.transactions.id });
  await db.transaction(async (tx) => {
    await postLedgerEntries(tx, txRow!.id, [
      {
        accountType: "system",
        systemAccountId: sysAccount.id,
        direction: "debit",
        amountMinor,
        currency,
      },
      { accountType: "user_wallet", walletId, direction: "credit", amountMinor, currency },
    ]);
  });
  return txRow!.id;
}

export function testWalletAddress(): string {
  const block = () => crypto.randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase();
  return `CW-${block()}-${block()}-${block()}-${block()}`;
}
