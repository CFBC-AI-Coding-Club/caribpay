/**
 * End-to-end across the network boundary: the switch talking to member banks.
 *
 * This is the suite that matters. It runs the real Hono API against a real mock
 * bank over HTTP, with two Postgres databases, and asserts on the banks'
 * balances rather than on our own bookkeeping — because "the money moved" is a
 * claim only the far side of the boundary can settle.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test";
import { eq } from "drizzle-orm";
import type { Server } from "bun";
import type { Hono } from "hono";
import type { SQL } from "bun";
import { bankStepKey } from "@caribpay/shared";
import type { AppEnv } from "../apps/api/src/app-env";
import { ledgerEntries, notifications, transactions } from "../apps/api/src/db/schema";
import {
  TEST_BANK_DATABASE_URL,
  TEST_DATABASE_URL,
  bankBalance,
  createTestUser,
  openBankClient,
  outstandingHoldCount,
  resetBank,
  seedWorld,
  setupTestDb,
  truncateAll,
  type TestDb,
  type TestUser,
} from "../apps/api/test/helpers";

setDefaultTimeout(45000);

let t: TestDb;
let app: Hono<AppEnv>;
let bankServer: Server;
let bank: SQL;
let amara: TestUser;
let devon: TestUser;
let driveTransfer: typeof import("../apps/api/src/services/transfers").driveTransfer;
let sweepStalled: typeof import("../apps/api/src/workers/recovery").sweepStalledTransfers;
let runSettlementCycle: typeof import("../apps/api/src/settlement/netting").runSettlementCycle;
let reconcile: typeof import("../apps/api/src/db/reconcile").reconcile;
let isClean: typeof import("../apps/api/src/db/reconcile").isClean;

const AMARA_ACCT = "SKNANB-ACCT-4001";
const DEVON_ACCT = "NCB-ACCT-4001";
const CLOSED_ACCT = "NCB-ACCT-4009";

const BANK_ACCOUNTS = [
  {
    accountRef: AMARA_ACCT,
    institutionHandle: "sknanb",
    holderName: "Amara Liburd",
    currency: "XCD" as const,
    balanceMinor: 500000,
  },
  {
    accountRef: DEVON_ACCT,
    institutionHandle: "ncb",
    holderName: "Devon Campbell",
    currency: "JMD" as const,
    balanceMinor: 80000000,
  },
  {
    accountRef: CLOSED_ACCT,
    institutionHandle: "ncb",
    holderName: "Closed Account",
    currency: "JMD" as const,
    balanceMinor: 0,
    status: "closed" as const,
  },
];

beforeAll(async () => {
  process.env.BANK_DATABASE_URL = TEST_BANK_DATABASE_URL;
  process.env.MOCK_BANK_LATENCY_MIN_MS = "0";
  process.env.MOCK_BANK_LATENCY_MAX_MS = "0";
  process.env.MOCK_BANK_FAILURE_RATE = "0";

  const { buildBankApp } = await import("../apps/mock-bank/src/app");
  bankServer = Bun.serve({ port: 0, fetch: buildBankApp().fetch });

  // Set before anything imports the API's env module.
  process.env.BANK_BASE_URL = `http://localhost:${bankServer.port}`;
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.WORKER_IN_PROCESS = "false";

  t = await setupTestDb();
  const { buildApp } = await import("../apps/api/src/app");
  app = buildApp();
  ({ driveTransfer } = await import("../apps/api/src/services/transfers"));
  ({ sweepStalledTransfers: sweepStalled } = await import("../apps/api/src/workers/recovery"));
  ({ runSettlementCycle } = await import("../apps/api/src/settlement/netting"));
  ({ reconcile, isClean } = await import("../apps/api/src/db/reconcile"));
  bank = openBankClient();
});

afterAll(async () => {
  bankServer.stop(true);
  await bank.close();
  await t.client.close();
});

beforeEach(async () => {
  await truncateAll(t.client);
  await seedWorld(t.db);
  await resetBank(bank, BANK_ACCOUNTS);
  amara = await createTestUser(t.db, {
    email: "amara@test.local",
    fullName: "Amara Liburd",
    countryCode: "KN",
    institutionHandle: "sknanb",
    accountRef: AMARA_ACCT,
    vpa: "amara@caribpay",
  });
  devon = await createTestUser(t.db, {
    email: "devon@test.local",
    fullName: "Devon Campbell",
    countryCode: "JM",
    institutionHandle: "ncb",
    accountRef: DEVON_ACCT,
    vpa: "devon@caribpay",
  });
});

async function token(email: string): Promise<string> {
  const res = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "demo1234" }),
  });
  const body = (await res.json()) as { tokens: { accessToken: string } };
  return body.tokens.accessToken;
}

async function api(
  path: string,
  init: RequestInit & { token?: string; key?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.token !== undefined) headers.Authorization = `Bearer ${init.token}`;
  if (init.key !== undefined) headers["Idempotency-Key"] = init.key;
  return await app.request(path, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
}

async function send(
  opts: {
    toKey?: string;
    amountMinor?: number;
    destCurrency?: string;
    key?: string;
  } = {},
): Promise<{ id: string; status: string; res: Response }> {
  const tok = await token("amara@test.local");
  const res = await api("/api/v1/transfers", {
    method: "POST",
    token: tok,
    key: opts.key ?? `test-${crypto.randomUUID()}`,
    body: JSON.stringify({
      toKey: opts.toKey ?? "devon@caribpay",
      sourceAccountId: amara.accountId,
      sourceCurrency: "XCD",
      destCurrency: opts.destCurrency ?? "JMD",
      sourceAmountMinor: opts.amountMinor ?? 150000,
    }),
  });
  if (!res.ok) return { id: "", status: "", res };
  const body = (await res.clone().json()) as { transaction: { id: string; status: string } };
  return { id: body.transaction.id, status: body.transaction.status, res };
}

async function statusOf(id: string): Promise<string> {
  const [row] = await t.db.select().from(transactions).where(eq(transactions.id, id));
  return row?.status ?? "missing";
}

describe("a cross-currency transfer", () => {
  test("moves money at both banks and balances the clearing ledger", async () => {
    const { id } = await send();
    await driveTransfer(t.db, id);

    expect(await statusOf(id)).toBe("completed");
    // The assertion that matters: the banks, not our own tables.
    expect(await bankBalance(bank, AMARA_ACCT)).toBe(350000);
    expect(await bankBalance(bank, DEVON_ACCT)).toBe(80000000 + 8777778);
    expect(await outstandingHoldCount(bank)).toBe(0);

    const entries = await t.db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.transactionId, id));
    // Two legs, each balancing within its own currency.
    expect(entries).toHaveLength(4);
    for (const currency of ["XCD", "JMD"]) {
      const net = entries
        .filter((e) => e.currency === currency)
        .reduce((sum, e) => sum + (e.direction === "credit" ? e.amountMinor : -e.amountMinor), 0);
      expect(net).toBe(0);
    }
  });

  test("writes the recipient's notification atomically with the credit", async () => {
    const { id } = await send();
    await driveTransfer(t.db, id);

    const rows = await t.db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, devon.userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe("transfer_received");
    expect((rows[0]!.data as { transactionId: string }).transactionId).toBe(id);
  });

  test("snapshots what the payer typed and the name they were shown", async () => {
    const { id } = await send();
    const [row] = await t.db.select().from(transactions).where(eq(transactions.id, id));
    expect(row!.recipientKeyUsed).toBe("devon@caribpay");
    expect(row!.recipientNameSnapshot).toBe("Devon C.");
  });

  test("reconciles clean afterwards", async () => {
    const { id } = await send();
    await driveTransfer(t.db, id);
    const result = await reconcile(t.db);
    expect(result.currencyImbalances).toEqual([]);
    expect(result.strandedHolds).toEqual([]);
    expect(isClean(result)).toBe(true);
  });
});

describe("failure branches", () => {
  test("a refused hold fails the transfer and posts nothing", async () => {
    const { id } = await send({ amountMinor: 900000 }); // more than the 5,000.00 balance
    await driveTransfer(t.db, id);

    expect(await statusOf(id)).toBe("failed");
    expect(await bankBalance(bank, AMARA_ACCT)).toBe(500000);
    expect(await outstandingHoldCount(bank)).toBe(0);

    const entries = await t.db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.transactionId, id));
    expect(entries).toHaveLength(0);
  });

  test("a refused credit releases the hold and leaves the payer exactly as they started", async () => {
    // Point Devon's key at the closed account so the credit is refused.
    await t.client`UPDATE linked_accounts SET account_ref = ${CLOSED_ACCT} WHERE id = ${devon.accountId}::uuid`;

    const before = await bankBalance(bank, AMARA_ACCT);
    const { id } = await send();
    await driveTransfer(t.db, id);

    expect(await statusOf(id)).toBe("reversed");
    expect(await bankBalance(bank, AMARA_ACCT)).toBe(before);
    expect(await outstandingHoldCount(bank)).toBe(0);
  });

  test("a transfer to an unpayable address is refused before any hold", async () => {
    // Resolve reports these rather than throwing, so the transfer service is
    // the only thing standing between an unpayable address and a stranded hold.
    await t.client`UPDATE linked_accounts SET status = 'closed' WHERE user_id = ${devon.userId}::uuid`;
    const { res } = await send();
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("KEY_NOT_PAYABLE");
    expect(await outstandingHoldCount(bank)).toBe(0);
  });

  test("a transfer beyond the payer bank's debit cap is declined before any hold", async () => {
    await t.client`
      UPDATE system_accounts SET debit_cap_minor = 100
      WHERE type = 'bank_position' AND currency = 'XCD'
        AND institution_id = (SELECT id FROM institutions WHERE psp_handle = 'sknanb')
    `;
    const { res } = await send({ amountMinor: 150000 });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("BANK_CAP_EXCEEDED");

    expect(await outstandingHoldCount(bank)).toBe(0);
    expect(await bankBalance(bank, AMARA_ACCT)).toBe(500000);
  });
});

describe("idempotency", () => {
  test("a retried instruction creates one transfer", async () => {
    const key = `retry-${crypto.randomUUID()}`;
    const first = await send({ key });
    const second = await send({ key });

    expect(second.res.headers.get("Idempotency-Replayed")).toBe("true");
    expect(second.id).toBe(first.id);

    const rows = await t.db.select().from(transactions).where(eq(transactions.type, "p2p_transfer"));
    expect(rows).toHaveLength(1);
  });

  test("re-driving a completed transfer does not move money twice", async () => {
    const { id } = await send();
    await driveTransfer(t.db, id);
    const after = await bankBalance(bank, DEVON_ACCT);

    // The sweeper is allowed to do this, so it must be harmless.
    await driveTransfer(t.db, id);
    await driveTransfer(t.db, id);

    expect(await bankBalance(bank, DEVON_ACCT)).toBe(after);
    expect(await statusOf(id)).toBe("completed");
  });

  test("the same step key is produced on every attempt", () => {
    const id = "7f1c9a2e-4b6d-4f0a-9c3e-1d2b8a5f6e01";
    const keys = Array.from({ length: 50 }, () => bankStepKey(id, "hold"));
    expect(new Set(keys).size).toBe(1);
  });
});

describe("recovery", () => {
  test("drives a transfer abandoned after the credit through to completed", async () => {
    // Simulate the crash window: the payee was credited, then the process died
    // before the ledger was posted. Recovery must complete forward — the credit
    // is irrevocable, so there is nothing to roll back to.
    const { id } = await send();
    const { driveTransfer: drive } = await import("../apps/api/src/services/transfers");
    await drive(t.db, id);
    expect(await statusOf(id)).toBe("completed");

    // Now rewind our own bookkeeping to mid-saga and let the sweeper finish it.
    await t.client`
      UPDATE transactions
      SET status = 'credit_pending', settled_at = NULL, deadline_at = now() - interval '1 minute'
      WHERE id = ${id}::uuid
    `;
    const recovered = await sweepStalled();
    expect(recovered).toBeGreaterThanOrEqual(1);
    expect(await statusOf(id)).toBe("completed");
    // Money moved exactly once despite the replay.
    expect(await bankBalance(bank, DEVON_ACCT)).toBe(80000000 + 8777778);
  });

  test("resolves an abandoned hold by releasing it", async () => {
    await t.client`UPDATE linked_accounts SET account_ref = ${CLOSED_ACCT} WHERE id = ${devon.accountId}::uuid`;
    const { id } = await send();

    // Get as far as the hold, then abandon.
    const { driveTransfer: drive } = await import("../apps/api/src/services/transfers");
    await drive(t.db, id).catch(() => undefined);
    await t.client`UPDATE transactions SET deadline_at = now() - interval '1 minute' WHERE id = ${id}::uuid`;
    await sweepStalled();

    expect(await statusOf(id)).toBe("reversed");
    expect(await outstandingHoldCount(bank)).toBe(0);
    expect(await bankBalance(bank, AMARA_ACCT)).toBe(500000);
  });
});

describe("net settlement", () => {
  test("nets the banks' positions to zero and records the cycle", async () => {
    for (let i = 0; i < 3; i++) {
      const { id } = await send({ amountMinor: 50000 });
      await driveTransfer(t.db, id);
    }

    const before = await reconcile(t.db);
    const sknanb = before.positions.find((p) => p.pspHandle === "sknanb" && p.currency === "XCD");
    expect(sknanb!.positionMinor).toBe(-150000);

    const cycle = await runSettlementCycle(t.db);
    expect(cycle.settled).toBe(true);
    expect(cycle.transferCount).toBe(3);

    const after = await reconcile(t.db);
    for (const p of after.positions) {
      expect(p.positionMinor).toBe(0);
    }
    expect(isClean(after)).toBe(true);
  });

  test("is safe to run twice", async () => {
    const { id } = await send();
    await driveTransfer(t.db, id);
    await runSettlementCycle(t.db);
    const second = await runSettlementCycle(t.db);
    expect(second.settled).toBe(false);
    expect(isClean(await reconcile(t.db))).toBe(true);
  });
});
