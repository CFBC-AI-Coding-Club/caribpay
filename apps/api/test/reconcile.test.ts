import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { reconcile, isClean } from "../src/db/reconcile";
import { TEST_DATABASE_URL, setupTestDb, seedWorld, truncateAll, type TestDb } from "./helpers";
import { HttpBankConnector } from "../src/banks/http-connector";

let t: TestDb;

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  t = await setupTestDb();
});

afterAll(async () => {
  await t.client.close();
});

beforeEach(async () => {
  await truncateAll(t.client);
  await seedWorld(t.db);
});

describe("reconcile bank hold checks", () => {
  test("exposes an unavailable bank hold check and is not clean", async () => {
    const original = HttpBankConnector.prototype.listOutstandingHolds;
    HttpBankConnector.prototype.listOutstandingHolds = async () => {
      throw new Error("bank unavailable");
    };
    try {
      const result = await reconcile(t.db);
      expect(result.bankCheck).toBe("unavailable");
      expect(result.strandedHolds).toEqual([]);
      expect(isClean(result)).toBe(false);
    } finally {
      HttpBankConnector.prototype.listOutstandingHolds = original;
    }
  });

  test("is not clean when bank hold checks are skipped", async () => {
    const result = await reconcile(t.db, { checkBanks: false });
    expect(result.bankCheck).toBe("skipped");
    expect(isClean(result)).toBe(false);
  });
});
