import { afterAll, beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { bankStepKey, holdResponseSchema, creditResponseSchema } from "@caribpay/shared";
import type { BankAppEnv } from "../src/app-env";
import { accounts, holds } from "../src/db/schema";
import { TEST_BANK_DATABASE_URL, setupTestBankDb, truncateBank, type TestBankDb } from "./helpers";

setDefaultTimeout(30000);

let t: TestBankDb;
let app: Hono<BankAppEnv>;

const PAYER = "SKNANB-ACCT-4001";
const PAYEE = "NCB-ACCT-4001";
const CLOSED = "NCB-ACCT-4009";
const FROZEN = "SKNANB-ACCT-4009";

const TX = "7f1c9a2e-4b6d-4f0a-9c3e-1d2b8a5f6e01";

beforeAll(async () => {
  t = await setupTestBankDb();
  process.env.BANK_DATABASE_URL = TEST_BANK_DATABASE_URL;
  // A rail with no latency and no injected failures, so tests measure the logic.
  process.env.MOCK_BANK_LATENCY_MIN_MS = "0";
  process.env.MOCK_BANK_LATENCY_MAX_MS = "0";
  process.env.MOCK_BANK_FAILURE_RATE = "0";
  const { buildBankApp } = await import("../src/app");
  app = buildBankApp();
});

afterAll(async () => {
  await t.client.close();
});

beforeEach(async () => {
  await truncateBank(t.client);
  await t.db.insert(accounts).values([
    {
      accountRef: PAYER,
      institutionHandle: "sknanb",
      holderName: "Amara Liburd",
      currency: "XCD",
      balanceMinor: 500000,
    },
    {
      accountRef: PAYEE,
      institutionHandle: "ncb",
      holderName: "Devon Campbell",
      currency: "JMD",
      balanceMinor: 1000000,
    },
    {
      accountRef: CLOSED,
      institutionHandle: "ncb",
      holderName: "Closed Account",
      currency: "JMD",
      balanceMinor: 0,
      status: "closed",
    },
    {
      accountRef: FROZEN,
      institutionHandle: "sknanb",
      holderName: "Frozen Account",
      currency: "XCD",
      balanceMinor: 10000,
      status: "frozen",
    },
  ]);
});

async function call(path: string, init: RequestInit & { key?: string } = {}): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.key !== undefined) headers["Idempotency-Key"] = init.key;
  return await app.request(path, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
}

async function errorCode(res: Response): Promise<string> {
  const body = (await res.json()) as { error: { code: string } };
  return body.error.code;
}

function hold(body: Record<string, unknown>, key: string) {
  return call("/debits/hold", { method: "POST", body: JSON.stringify(body), key });
}

const holdBody = (amountMinor = 150000) => ({
  accountRef: PAYER,
  amountMinor,
  currency: "XCD",
  reference: TX,
});

async function balanceOf(accountRef: string): Promise<{ balanceMinor: number; availableMinor: number }> {
  const res = await call(`/accounts/${accountRef}/balance`);
  const body = (await res.json()) as { balanceMinor: number; availableMinor: number };
  return body;
}

describe("account verification", () => {
  test("returns the holder and currency for a real account", async () => {
    const res = await call("/accounts/verify", {
      method: "POST",
      body: JSON.stringify({ accountRef: PAYER }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      exists: true,
      holderName: "Amara Liburd",
      currency: "XCD",
      status: "active",
      accountNumberMasked: "••••4001",
    });
  });

  test("a missing account is a legitimate no, not an error", async () => {
    const res = await call("/accounts/verify", {
      method: "POST",
      body: JSON.stringify({ accountRef: "NOPE-0000" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ exists: false, holderName: null });
  });
});

describe("holds", () => {
  test("reserve funds without moving them", async () => {
    const res = await hold(holdBody(), bankStepKey(TX, "hold"));
    expect(res.status).toBe(201);
    const body = holdResponseSchema.parse(await res.json());
    expect(body.amountMinor).toBe(150000);

    const after = await balanceOf(PAYER);
    expect(after.balanceMinor).toBe(500000);
    expect(after.availableMinor).toBe(350000);
  });

  test("a retried hold under the same key debits once", async () => {
    // The single most important property of this service. A timeout on the
    // switch side must never become a second hold here.
    const key = bankStepKey(TX, "hold");
    const first = await hold(holdBody(), key);
    const second = await hold(holdBody(), key);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers.get("Idempotency-Replayed")).toBe("true");

    const firstBody = holdResponseSchema.parse(await first.json());
    const secondBody = holdResponseSchema.parse(await second.json());
    expect(secondBody.holdRef).toBe(firstBody.holdRef);

    const rows = await t.db.select().from(holds);
    expect(rows).toHaveLength(1);
    expect((await balanceOf(PAYER)).availableMinor).toBe(350000);
  });

  test("ten concurrent retries of the same instruction still place one hold", async () => {
    // A flaky connection produces exactly this: several copies of one
    // instruction in flight at once. Checking for an existing record and then
    // acting is a race that places a hold per racer, so the key is claimed
    // before the work runs.
    const key = bankStepKey(TX, "hold");
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => hold(holdBody(), key)),
    );

    const rows = await t.db.select().from(holds);
    expect(rows).toHaveLength(1);
    expect((await balanceOf(PAYER)).availableMinor).toBe(350000);

    // Every caller either did the work, replayed it, or was told it was already
    // running. None of those is a refusal, so the switch keeps its nerve.
    const created = responses.filter((r) => r.status === 201);
    const inFlight = responses.filter((r) => r.status === 409);
    expect(created.length + inFlight.length).toBe(10);
    expect(created.length).toBeGreaterThanOrEqual(1);
  });

  test("reusing a key for a different instruction is refused", async () => {
    const key = bankStepKey(TX, "hold");
    await hold(holdBody(150000), key);
    const res = await hold(holdBody(999), key);
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  test("refuses more than the available balance", async () => {
    const res = await hold(holdBody(500001), bankStepKey(TX, "hold"));
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe("INSUFFICIENT_FUNDS");
  });

  test("holds stack against the available balance", async () => {
    await hold(holdBody(300000), bankStepKey(TX, "hold"));
    const other = "0a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d";
    const res = await hold(
      { ...holdBody(300000), reference: other },
      bankStepKey(other, "hold"),
    );
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe("INSUFFICIENT_FUNDS");
  });

  test("refuses a frozen account", async () => {
    const res = await hold(
      { accountRef: FROZEN, amountMinor: 100, currency: "XCD", reference: TX },
      bankStepKey(TX, "hold"),
    );
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe("ACCOUNT_FROZEN");
  });

  test("refuses a currency the account does not hold", async () => {
    const res = await hold(
      { accountRef: PAYER, amountMinor: 100, currency: "JMD", reference: TX },
      bankStepKey(TX, "hold"),
    );
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe("CURRENCY_MISMATCH");
  });

  test("requires an idempotency key", async () => {
    const res = await call("/debits/hold", { method: "POST", body: JSON.stringify(holdBody()) });
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });
});

describe("confirm", () => {
  async function placed(): Promise<string> {
    const res = await hold(holdBody(), bankStepKey(TX, "hold"));
    return holdResponseSchema.parse(await res.json()).holdRef;
  }

  test("draws the hold down and moves the money", async () => {
    const holdRef = await placed();
    const res = await call(`/debits/${holdRef}/confirm`, {
      method: "POST",
      key: bankStepKey(TX, "confirm"),
    });
    expect(res.status).toBe(200);

    const after = await balanceOf(PAYER);
    expect(after.balanceMinor).toBe(350000);
    expect(after.availableMinor).toBe(350000);
  });

  test("confirming twice moves the money once, even under different keys", async () => {
    // Domain-level idempotency, on top of the wire-level replay: a sweeper
    // re-driving an abandoned transfer must not double-debit.
    const holdRef = await placed();
    const first = await call(`/debits/${holdRef}/confirm`, {
      method: "POST",
      key: bankStepKey(TX, "confirm"),
    });
    const second = await call(`/debits/${holdRef}/confirm`, {
      method: "POST",
      key: `${TX}:confirm-retry`,
    });

    expect(second.status).toBe(200);
    const firstDebit = (await first.json()) as { debitRef: string };
    const secondDebit = (await second.json()) as { debitRef: string };
    expect(secondDebit.debitRef).toBe(firstDebit.debitRef);
    expect((await balanceOf(PAYER)).balanceMinor).toBe(350000);
  });

  test("refuses an expired hold", async () => {
    const holdRef = await placed();
    await t.db
      .update(holds)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(holds.holdRef, holdRef));

    const res = await call(`/debits/${holdRef}/confirm`, {
      method: "POST",
      key: bankStepKey(TX, "confirm"),
    });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe("HOLD_EXPIRED");
  });

  test("a hold that expires without confirmation self-releases the funds", async () => {
    const holdRef = await placed();
    expect((await balanceOf(PAYER)).availableMinor).toBe(350000);

    await t.db
      .update(holds)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(holds.holdRef, holdRef));

    // Reading the balance sweeps it: even a total switch failure cannot leave
    // money frozen in someone's account.
    const after = await balanceOf(PAYER);
    expect(after.balanceMinor).toBe(500000);
    expect(after.availableMinor).toBe(500000);
  });
});

describe("release", () => {
  test("gives the money back", async () => {
    const res = await hold(holdBody(), bankStepKey(TX, "hold"));
    const { holdRef } = holdResponseSchema.parse(await res.json());

    const released = await call(`/debits/${holdRef}/release`, {
      method: "POST",
      key: bankStepKey(TX, "release"),
    });
    expect(released.status).toBe(200);

    const after = await balanceOf(PAYER);
    expect(after.balanceMinor).toBe(500000);
    expect(after.availableMinor).toBe(500000);
  });

  test("releasing twice succeeds, because the switch retries to exhaustion", async () => {
    const res = await hold(holdBody(), bankStepKey(TX, "hold"));
    const { holdRef } = holdResponseSchema.parse(await res.json());

    await call(`/debits/${holdRef}/release`, { method: "POST", key: bankStepKey(TX, "release") });
    const again = await call(`/debits/${holdRef}/release`, {
      method: "POST",
      key: `${TX}:release-retry`,
    });
    expect(again.status).toBe(200);
    expect((await balanceOf(PAYER)).availableMinor).toBe(500000);
  });

  test("cannot release a hold that was already drawn down", async () => {
    const res = await hold(holdBody(), bankStepKey(TX, "hold"));
    const { holdRef } = holdResponseSchema.parse(await res.json());
    await call(`/debits/${holdRef}/confirm`, { method: "POST", key: bankStepKey(TX, "confirm") });

    const released = await call(`/debits/${holdRef}/release`, {
      method: "POST",
      key: bankStepKey(TX, "release"),
    });
    expect(released.status).toBe(409);
    expect(await errorCode(released)).toBe("HOLD_ALREADY_SETTLED");
  });
});

describe("credits", () => {
  const creditBody = (accountRef = PAYEE, amountMinor = 8777778) => ({
    accountRef,
    amountMinor,
    currency: "JMD",
    reference: TX,
  });

  test("posts money into the account", async () => {
    const res = await call("/credits", {
      method: "POST",
      body: JSON.stringify(creditBody()),
      key: bankStepKey(TX, "credit"),
    });
    expect(res.status).toBe(201);
    creditResponseSchema.parse(await res.json());
    expect((await balanceOf(PAYEE)).balanceMinor).toBe(1000000 + 8777778);
  });

  test("a retried credit posts once", async () => {
    const key = bankStepKey(TX, "credit");
    await call("/credits", { method: "POST", body: JSON.stringify(creditBody()), key });
    const second = await call("/credits", {
      method: "POST",
      body: JSON.stringify(creditBody()),
      key,
    });
    expect(second.headers.get("Idempotency-Replayed")).toBe("true");
    expect((await balanceOf(PAYEE)).balanceMinor).toBe(1000000 + 8777778);
  });

  test("refuses a closed account, which is what drives the reversal branch", async () => {
    const res = await call("/credits", {
      method: "POST",
      body: JSON.stringify(creditBody(CLOSED)),
      key: bankStepKey(TX, "credit"),
    });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe("ACCOUNT_CLOSED");
  });
});

describe("outstanding holds", () => {
  test("lists what is still reserved, for reconcile", async () => {
    await hold(holdBody(), bankStepKey(TX, "hold"));
    const res = await call("/holds?status=outstanding");
    const body = (await res.json()) as { holds: unknown[] };
    expect(body.holds).toHaveLength(1);
  });

  test("is empty once everything has settled", async () => {
    const placed = await hold(holdBody(), bankStepKey(TX, "hold"));
    const { holdRef } = holdResponseSchema.parse(await placed.json());
    await call(`/debits/${holdRef}/confirm`, { method: "POST", key: bankStepKey(TX, "confirm") });

    const res = await call("/holds?status=outstanding");
    expect(((await res.json()) as { holds: unknown[] }).holds).toHaveLength(0);
  });
});
