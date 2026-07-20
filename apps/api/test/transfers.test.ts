import { afterAll, beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { Worker } from "bullmq";
import {
  authResponseSchema,
  errorResponseSchema,
  fxQuoteResponseSchema,
  transferResponseSchema,
  type Transaction,
} from "@caribpay/shared";
import type { Hono } from "hono";
import type { AppEnv } from "../src/app-env";
import { ledgerEntries, transactions, wallets } from "../src/db/schema";
import { seedFxRates, seedSystemAccounts } from "../src/db/seed";
import { reconcile } from "../src/db/reconcile";
import { getBalance } from "../src/services/ledger";
import {
  TEST_DATABASE_URL,
  fundWalletForTest,
  setupTestDb,
  truncateAll,
  type TestDb,
} from "./helpers";

setDefaultTimeout(30000);

let t: TestDb;
let app: Hono<AppEnv>;
let worker: Worker;
let settlementQueue: typeof import("../src/lib/queue").settlementQueue;
let finalizeFailed: typeof import("../src/services/transfers").finalizeFailed;
let finalizeSettled: typeof import("../src/services/transfers").finalizeSettled;

beforeAll(async () => {
  t = await setupTestDb();
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.MOCK_SETTLEMENT_DELAY_MS = "150";
  const { buildApp } = await import("../src/app");
  app = buildApp();
  const queueLib = await import("../src/lib/queue");
  settlementQueue = queueLib.settlementQueue;
  await settlementQueue.obliterate({ force: true });
  const { createSettlementWorker } = await import("../src/workers/settlement");
  worker = createSettlementWorker();
  ({ finalizeFailed, finalizeSettled } = await import("../src/services/transfers"));
});

afterAll(async () => {
  await worker.close();
  await t.client.close();
});

beforeEach(async () => {
  await truncateAll(t.client);
  await seedSystemAccounts(t.db);
  await seedFxRates(t.db);
});

async function api(path: string, token?: string, init: RequestInit = {}): Promise<Response> {
  return await app.request(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
      ...(init.headers ?? {}),
    },
  });
}

async function registerUser(countryCode: string) {
  const res = await api("/api/v1/auth/register", undefined, {
    method: "POST",
    body: JSON.stringify({
      email: `${crypto.randomUUID()}@test.local`,
      password: "password-12345",
      fullName: "Test User",
      countryCode,
    }),
  });
  const { user, tokens } = authResponseSchema.parse(await res.json());
  const [wallet] = await t.db.select().from(wallets).where(eq(wallets.userId, user.id));
  return {
    userId: user.id,
    token: tokens.accessToken,
    walletId: wallet!.id,
    address: wallet!.address,
    currency: wallet!.currency,
  };
}

async function postTransfer(
  token: string,
  body: Record<string, unknown>,
  idempotencyKey = crypto.randomUUID(),
): Promise<Response> {
  return await api("/api/v1/transfers", token, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

async function waitForStatus(
  token: string,
  transferId: string,
  wanted: Transaction["status"],
  timeoutMs = 10000,
): Promise<Transaction> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await api(`/api/v1/transfers/${transferId}`, token);
    expect(res.status).toBe(200);
    const { transaction } = transferResponseSchema.parse(await res.json());
    if (transaction.status === wanted) return transaction;
    if (Date.now() > deadline) {
      throw new Error(`Transfer ${transferId} stuck in ${transaction.status}, wanted ${wanted}`);
    }
    await Bun.sleep(150);
  }
}

describe("same-currency transfer lifecycle", () => {
  test("holds immediately, settles via the worker, ledger stays clean", async () => {
    const sender = await registerUser("KN");
    const recipient = await registerUser("VC");
    await fundWalletForTest(t.db, sender.walletId, "XCD", 10000);

    const res = await postTransfer(sender.token, {
      recipientAddress: recipient.address,
      sourceCurrency: "XCD",
      destCurrency: "XCD",
      sourceAmountMinor: 2500,
      note: "lunch money",
    });
    expect(res.status).toBe(201);
    const { transaction } = transferResponseSchema.parse(await res.json());
    expect(transaction.status).toBe("pending_settlement");
    expect(transaction.note).toBe("lunch money");
    expect(transaction.fxRateUsed).toBeNull();

    // Hold is posted synchronously: sender debited before settlement.
    expect(await getBalance(t.db, sender.walletId)).toBe(7500);
    expect(await getBalance(t.db, recipient.walletId)).toBe(0);

    const settled = await waitForStatus(sender.token, transaction.id, "settled");
    expect(settled.settledAt).not.toBeNull();
    expect(await getBalance(t.db, sender.walletId)).toBe(7500);
    expect(await getBalance(t.db, recipient.walletId)).toBe(2500);

    const entries = await t.db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.transactionId, transaction.id));
    expect(entries).toHaveLength(4);
    expect((await reconcile(t.db)).mismatches).toEqual([]);
  });
});

describe("cross-currency transfer with a locked quote", () => {
  test("uses the quote's rate and credits the converted amount", async () => {
    const sender = await registerUser("KN");
    const recipient = await registerUser("JM");
    await fundWalletForTest(t.db, sender.walletId, "XCD", 200000);

    const quoteRes = await api("/api/v1/fx/quote?from=XCD&to=JMD&amountMinor=150000", sender.token);
    const { quote } = fxQuoteResponseSchema.parse(await quoteRes.json());

    const res = await postTransfer(sender.token, {
      recipientAddress: recipient.address,
      sourceCurrency: "XCD",
      destCurrency: "JMD",
      sourceAmountMinor: 150000,
      quoteId: quote.id,
    });
    expect(res.status).toBe(201);
    const { transaction } = transferResponseSchema.parse(await res.json());
    expect(transaction.fxRateUsed).toBe(quote.rate);
    expect(transaction.destAmountMinor).toBe(quote.destAmountMinor);

    await waitForStatus(sender.token, transaction.id, "settled");
    expect(await getBalance(t.db, sender.walletId)).toBe(50000);
    expect(await getBalance(t.db, recipient.walletId)).toBe(quote.destAmountMinor);
    expect((await reconcile(t.db)).mismatches).toEqual([]);
  });

  test("rejects expired quotes and mismatched quotes", async () => {
    const sender = await registerUser("KN");
    const recipient = await registerUser("JM");
    await fundWalletForTest(t.db, sender.walletId, "XCD", 200000);

    const gone = await postTransfer(sender.token, {
      recipientAddress: recipient.address,
      sourceCurrency: "XCD",
      destCurrency: "JMD",
      sourceAmountMinor: 150000,
      quoteId: crypto.randomUUID(),
    });
    expect(gone.status).toBe(410);
    expect(errorResponseSchema.parse(await gone.json()).error.code).toBe("QUOTE_EXPIRED");

    const quoteRes = await api("/api/v1/fx/quote?from=XCD&to=JMD&amountMinor=99999", sender.token);
    const { quote } = fxQuoteResponseSchema.parse(await quoteRes.json());
    const mismatch = await postTransfer(sender.token, {
      recipientAddress: recipient.address,
      sourceCurrency: "XCD",
      destCurrency: "JMD",
      sourceAmountMinor: 150000,
      quoteId: quote.id,
    });
    expect(mismatch.status).toBe(422);
    expect(errorResponseSchema.parse(await mismatch.json()).error.code).toBe("QUOTE_MISMATCH");
  });
});

describe("idempotency", () => {
  test("same key + same body replays the original response without double-posting", async () => {
    const sender = await registerUser("KN");
    const recipient = await registerUser("VC");
    await fundWalletForTest(t.db, sender.walletId, "XCD", 10000);
    const key = crypto.randomUUID();
    const body = {
      recipientAddress: recipient.address,
      sourceCurrency: "XCD",
      destCurrency: "XCD",
      sourceAmountMinor: 2500,
    };

    const first = await postTransfer(sender.token, body, key);
    expect(first.status).toBe(201);
    const firstTx = transferResponseSchema.parse(await first.json()).transaction;

    const second = await postTransfer(sender.token, body, key);
    expect(second.status).toBe(201); // replayed verbatim, including status code
    expect(second.headers.get("Idempotency-Replayed")).toBe("true");
    const secondTx = transferResponseSchema.parse(await second.json()).transaction;
    expect(secondTx.id).toBe(firstTx.id);

    const rows = await t.db
      .select()
      .from(transactions)
      .where(eq(transactions.idempotencyKey, key));
    expect(rows).toHaveLength(1);
    expect(await getBalance(t.db, sender.walletId)).toBe(7500);
  });

  test("same key with a different body is rejected", async () => {
    const sender = await registerUser("KN");
    const recipient = await registerUser("VC");
    await fundWalletForTest(t.db, sender.walletId, "XCD", 10000);
    const key = crypto.randomUUID();
    const base = {
      recipientAddress: recipient.address,
      sourceCurrency: "XCD",
      destCurrency: "XCD",
      sourceAmountMinor: 2500,
    };
    expect((await postTransfer(sender.token, base, key)).status).toBe(201);
    const altered = await postTransfer(sender.token, { ...base, sourceAmountMinor: 9999 }, key);
    expect(altered.status).toBe(422);
    expect(errorResponseSchema.parse(await altered.json()).error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  test("missing Idempotency-Key header is a 400", async () => {
    const sender = await registerUser("KN");
    const res = await api("/api/v1/transfers", sender.token, {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(errorResponseSchema.parse(await res.json()).error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });
});

describe("validation and safety", () => {
  test("insufficient balance rejects and persists nothing", async () => {
    const sender = await registerUser("KN");
    const recipient = await registerUser("VC");
    await fundWalletForTest(t.db, sender.walletId, "XCD", 1000);
    const key = crypto.randomUUID();
    const res = await postTransfer(
      sender.token,
      {
        recipientAddress: recipient.address,
        sourceCurrency: "XCD",
        destCurrency: "XCD",
        sourceAmountMinor: 5000,
      },
      key,
    );
    expect(res.status).toBe(422);
    expect(errorResponseSchema.parse(await res.json()).error.code).toBe("INSUFFICIENT_BALANCE");
    expect(
      await t.db.select().from(transactions).where(eq(transactions.idempotencyKey, key)),
    ).toHaveLength(0);
    expect(await getBalance(t.db, sender.walletId)).toBe(1000);
  });

  test("unknown recipient and currency mismatches are rejected", async () => {
    const sender = await registerUser("KN");
    const recipient = await registerUser("JM");
    await fundWalletForTest(t.db, sender.walletId, "XCD", 10000);

    const ghost = await postTransfer(sender.token, {
      recipientAddress: "CW-AAAA-BBBB-CCCC-DDDD",
      sourceCurrency: "XCD",
      destCurrency: "XCD",
      sourceAmountMinor: 100,
    });
    expect(ghost.status).toBe(404);

    const mismatch = await postTransfer(sender.token, {
      recipientAddress: recipient.address, // JMD wallet
      sourceCurrency: "XCD",
      destCurrency: "XCD",
      sourceAmountMinor: 100,
    });
    expect(mismatch.status).toBe(422);
    expect(errorResponseSchema.parse(await mismatch.json()).error.code).toBe(
      "RECIPIENT_CURRENCY_MISMATCH",
    );
  });

  test("transfers are only visible to sender and recipient", async () => {
    const sender = await registerUser("KN");
    const recipient = await registerUser("VC");
    const stranger = await registerUser("BB");
    await fundWalletForTest(t.db, sender.walletId, "XCD", 10000);
    const res = await postTransfer(sender.token, {
      recipientAddress: recipient.address,
      sourceCurrency: "XCD",
      destCurrency: "XCD",
      sourceAmountMinor: 100,
    });
    const { transaction } = transferResponseSchema.parse(await res.json());

    expect((await api(`/api/v1/transfers/${transaction.id}`, recipient.token)).status).toBe(200);
    expect((await api(`/api/v1/transfers/${transaction.id}`, stranger.token)).status).toBe(404);
  });
});

describe("settlement failure", () => {
  test("failure reverses the hold and marks the transfer failed", async () => {
    const sender = await registerUser("KN");
    const recipient = await registerUser("JM");
    await fundWalletForTest(t.db, sender.walletId, "XCD", 200000);

    // Pause the queue so the live worker cannot race the deterministic
    // failure path; the worker exercises these same finalize functions.
    await settlementQueue.pause();
    try {
      const res = await postTransfer(sender.token, {
        recipientAddress: recipient.address,
        sourceCurrency: "XCD",
        destCurrency: "JMD",
        sourceAmountMinor: 150000,
      });
      const { transaction } = transferResponseSchema.parse(await res.json());
      expect(await getBalance(t.db, sender.walletId)).toBe(50000);

      await finalizeFailed(t.db, transaction.id, "CAPSS settlement failed");

      const detail = await waitForStatus(sender.token, transaction.id, "failed", 5000);
      expect(detail.failureReason).toBe("CAPSS settlement failed");
      expect(await getBalance(t.db, sender.walletId)).toBe(200000);
      expect(await getBalance(t.db, recipient.walletId)).toBe(0);
      expect((await reconcile(t.db)).mismatches).toEqual([]);

      // Finalizers are idempotent: a late worker settling a failed transfer is a no-op.
      await finalizeSettled(t.db, transaction.id);
      expect(await getBalance(t.db, recipient.walletId)).toBe(0);
      expect((await waitForStatus(sender.token, transaction.id, "failed", 2000)).status).toBe(
        "failed",
      );
    } finally {
      await settlementQueue.resume();
    }
  });
});
