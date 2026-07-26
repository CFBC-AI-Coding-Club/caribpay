import { SQL } from "bun";
import { drizzle, type BunSQLDatabase } from "drizzle-orm/bun-sql";
import * as schema from "../src/db/schema";
import { runMigrations } from "../src/db/migrate";

export const TEST_BANK_DATABASE_URL =
  process.env.TEST_BANK_DATABASE_URL ??
  "postgresql://caribpay:caribpay@localhost:5432/caribpay_bank_test";

export interface TestBankDb {
  db: BunSQLDatabase<typeof schema>;
  client: SQL;
}

export async function setupTestBankDb(): Promise<TestBankDb> {
  const dbName = new URL(TEST_BANK_DATABASE_URL).pathname.slice(1);
  const adminUrl = new URL(TEST_BANK_DATABASE_URL);
  adminUrl.pathname = "/postgres";
  const admin = new SQL(adminUrl.toString(), { max: 1 });
  try {
    const exists = await admin`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
    if (exists.length === 0) {
      await admin.unsafe(`CREATE DATABASE "${dbName}"`);
    }
    await admin`
      SELECT pg_terminate_backend(pid) FROM pg_stat_activity
      WHERE datname = ${dbName} AND pid <> pg_backend_pid()
    `;
  } finally {
    await admin.close();
  }
  await runMigrations(TEST_BANK_DATABASE_URL);
  const client = new SQL(TEST_BANK_DATABASE_URL);
  return { db: drizzle({ client, schema }), client };
}

export async function truncateBank(client: SQL): Promise<void> {
  await client`
    TRUNCATE accounts, holds, debits, credits, bank_idempotency_records
    RESTART IDENTITY CASCADE
  `;
}
