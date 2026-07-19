import { SQL } from "bun";
import { drizzle, type BunSQLDatabase } from "drizzle-orm/bun-sql";
import * as schema from "../src/db/schema";
import { runMigrations } from "../src/db/migrate";

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

export function testWalletAddress(): string {
  const block = () => crypto.randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase();
  return `CW-${block()}-${block()}-${block()}-${block()}`;
}
