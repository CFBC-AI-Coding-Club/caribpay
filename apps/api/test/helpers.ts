import { SQL } from "bun";
import { eq } from "drizzle-orm";
import { drizzle, type BunSQLDatabase } from "drizzle-orm/bun-sql";
import { maskName, vpaSkeleton, type Currency } from "@caribpay/shared";
import * as schema from "../src/db/schema";
import { runMigrations } from "../src/db/migrate";
import {
  seedFxOpeningPosition,
  seedFxRates,
  seedInstitutions,
  seedSystemAccounts,
} from "../src/db/seed";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://caribpay:caribpay@localhost:5432/caribpay_test";

export const TEST_BANK_DATABASE_URL =
  process.env.TEST_BANK_DATABASE_URL ??
  "postgresql://caribpay:caribpay@localhost:5432/caribpay_bank_test";

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

/** Every table, so no state leaks between test files sharing one process. */
export async function truncateAll(client: SQL): Promise<void> {
  await client`
    TRUNCATE notifications, settlement_cycle_entries, settlement_cycles, contacts,
             idempotency_records, ledger_entries, transactions, directory_keys,
             linked_accounts, system_accounts, institutions, refresh_tokens,
             fx_rates, users
    RESTART IDENTITY CASCADE
  `;
}

/** Institutions, clearing accounts, rates and the FX book — the world a transfer needs. */
export async function seedWorld(db: BunSQLDatabase<typeof schema>): Promise<void> {
  const { clearReservedCache } = await import("../src/services/directory");
  await seedInstitutions(db);
  await seedSystemAccounts(db);
  await seedFxRates(db);
  await seedFxOpeningPosition(db);
  clearReservedCache();
}

export interface TestUser {
  userId: string;
  accountId: string;
  accountRef: string;
  vpa: string;
  currency: Currency;
}

/**
 * A user with a linked account at a member bank, and a VPA pointing at it.
 * `accountRef` must exist in the mock bank for anything money-moving to work.
 */
export async function createTestUser(
  db: BunSQLDatabase<typeof schema>,
  input: {
    email: string;
    fullName: string;
    countryCode: string;
    institutionHandle: string;
    accountRef: string;
    vpa: string;
  },
): Promise<TestUser> {
  const [user] = await db
    .insert(schema.users)
    .values({
      email: input.email,
      passwordHash: await Bun.password.hash("demo1234", { algorithm: "argon2id" }),
      fullName: input.fullName,
      countryCode: input.countryCode,
      kycStatus: "verified",
    })
    .returning();

  const [institution] = await db
    .select()
    .from(schema.institutions)
    .where(eq(schema.institutions.pspHandle, input.institutionHandle));
  if (institution === undefined) {
    throw new Error(`Institution ${input.institutionHandle} not seeded`);
  }

  const [account] = await db
    .insert(schema.linkedAccounts)
    .values({
      userId: user!.id,
      institutionId: institution.id,
      accountRef: input.accountRef,
      accountNumberMasked: `••••${input.accountRef.slice(-4)}`,
      currency: institution.currency,
      holderNameVerified: maskName(input.fullName),
      isDefault: true,
    })
    .returning();

  const [caribpay] = await db
    .select({ id: schema.institutions.id })
    .from(schema.institutions)
    .where(eq(schema.institutions.pspHandle, "caribpay"));

  await db.insert(schema.directoryKeys).values({
    userId: user!.id,
    type: "vpa",
    valueRaw: input.vpa,
    valueNormalized: input.vpa,
    skeleton: vpaSkeleton(input.vpa.split("@")[0]!),
    institutionId: caribpay?.id ?? null,
    linkedAccountId: account!.id,
    isPrimary: true,
    verifiedAt: new Date(),
  });

  return {
    userId: user!.id,
    accountId: account!.id,
    accountRef: input.accountRef,
    vpa: input.vpa,
    currency: institution.currency,
  };
}

export interface BankAccountSpec {
  accountRef: string;
  institutionHandle: string;
  holderName: string;
  currency: Currency;
  balanceMinor: number;
  status?: "active" | "frozen" | "closed";
}

export function openBankClient(): SQL {
  return new SQL(TEST_BANK_DATABASE_URL);
}

/**
 * Reset the mock bank's accounts to known balances.
 *
 * Takes the client rather than opening one: a connection per test exhausts
 * Postgres' backend slots long before the suite finishes.
 */
export async function resetBank(client: SQL, accounts: BankAccountSpec[]): Promise<void> {
  await client`TRUNCATE accounts, holds, debits, credits, bank_idempotency_records RESTART IDENTITY CASCADE`;
  for (const a of accounts) {
    await client.unsafe(
      `INSERT INTO accounts (account_ref, institution_handle, holder_name, currency, balance_minor, status)
       VALUES ($1, $2, $3, $4::bank_currency, $5, $6::bank_account_status)`,
      [a.accountRef, a.institutionHandle, a.holderName, a.currency, a.balanceMinor, a.status ?? "active"],
    );
  }
}

export async function bankBalance(client: SQL, accountRef: string): Promise<number> {
  const rows = await client`SELECT balance_minor FROM accounts WHERE account_ref = ${accountRef}`;
  return Number(rows[0]?.balance_minor ?? 0);
}

export async function outstandingHoldCount(client: SQL): Promise<number> {
  const rows = await client`SELECT COUNT(*)::int AS n FROM holds WHERE status = 'outstanding'`;
  return Number(rows[0]?.n ?? 0);
}
