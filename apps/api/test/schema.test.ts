import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ledgerEntries } from "../src/db/schema";
import { TEST_DATABASE_URL, seedWorld, setupTestDb, truncateAll, type TestDb } from "./helpers";

setDefaultTimeout(30000);

let t: TestDb;

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  t = await setupTestDb();
});

afterAll(async () => {
  await t.client.close();
});

describe("the switch holds no customer money", () => {
  /**
   * The architectural claim, asserted against the live schema rather than
   * against our intentions. CaribPay is a payment initiation and clearing
   * operator, not an e-money issuer: customer balances live at the member banks,
   * behind a network boundary this database has no credentials for.
   *
   * If this test fails, someone has reintroduced a balance we would be liable
   * for, and the regulatory story changes with it.
   */
  test("no table has a column that looks like a customer balance", async () => {
    const rows = await t.db.execute<{ table_name: string; column_name: string }>(sql`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (column_name ILIKE '%balance%' OR column_name ILIKE '%wallet%')
    `);
    expect([...rows].map((r) => `${r.table_name}.${r.column_name}`)).toEqual([]);
  });

  test("there is no wallets table", async () => {
    const rows = await t.db.execute<{ table_name: string }>(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('wallets', 'wallet_balances')
    `);
    expect([...rows]).toEqual([]);
  });

  test("linked_accounts stores a reference and a mask, and nothing spendable", async () => {
    const rows = await t.db.execute<{ column_name: string }>(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'linked_accounts'
      ORDER BY column_name
    `);
    const columns = [...rows].map((r) => r.column_name);
    expect(columns).toContain("account_ref");
    expect(columns).toContain("account_number_masked");
    expect(columns.filter((c) => c.includes("balance"))).toEqual([]);
  });
});

/**
 * The database's refusal message, or "" if it allowed the statement.
 *
 * Walks the cause chain: drizzle wraps driver errors in a "Failed query:"
 * envelope, so the trigger's own message is one level down.
 */
async function refusalFor(statement: Parameters<typeof t.db.execute>[0]): Promise<string> {
  try {
    await t.db.execute(statement);
    return "";
  } catch (error) {
    const messages: string[] = [];
    for (let e: unknown = error; e instanceof Error; e = e.cause) {
      messages.push(e.message);
    }
    return messages.join(" | ");
  }
}

describe("the ledger is append-only", () => {
  test("UPDATE and DELETE on ledger_entries are rejected by the database", async () => {
    // The trigger is FOR EACH ROW, so it needs a row to fire on. Seeding the
    // world posts the FX book's opening entries, which is enough.
    await truncateAll(t.client);
    await seedWorld(t.db);
    const [entry] = await t.db.select().from(ledgerEntries).limit(1);
    expect(entry).toBeDefined();

    // The trigger survives the destructive migration; losing it would make the
    // ledger's central promise unenforceable.
    //
    // try/catch rather than `.rejects`: drizzle's execute() returns a lazy
    // thenable, so the assertion helper never triggers the query.
    expect(await refusalFor(sql`UPDATE ledger_entries SET amount_minor = 1 WHERE id = ${entry!.id}::uuid`))
      .toMatch(/append-only/i);
    expect(await refusalFor(sql`DELETE FROM ledger_entries WHERE id = ${entry!.id}::uuid`))
      .toMatch(/append-only/i);
  });
});
