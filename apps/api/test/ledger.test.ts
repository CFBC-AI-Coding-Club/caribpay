import { afterAll, beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";

// DB round-trips on dev machines go through the WSL port relay; the 5 s default
// is too tight for hook-heavy integration tests and abandons transactions mid-flight.
setDefaultTimeout(30000);
import type { Currency } from "@caribpay/shared";
import { seedSystemAccounts } from "../src/db/seed";
import { reconcile } from "../src/db/reconcile";
import { systemAccounts, transactions, users, wallets } from "../src/db/schema";
import {
  InsufficientBalanceError,
  LedgerValidationError,
  UnbalancedLedgerError,
  assertSufficientBalance,
  getBalance,
  postLedgerEntries,
  type LedgerEntryInput,
} from "../src/services/ledger";
import { setupTestDb, testWalletAddress, truncateAll, type TestDb } from "./helpers";

let t: TestDb;
let systemAccountIds: Map<string, string>;

beforeAll(async () => {
  t = await setupTestDb();
});

afterAll(async () => {
  await t.client.close();
});

beforeEach(async () => {
  await truncateAll(t.client);
  await seedSystemAccounts(t.db);
  const accounts = await t.db.select().from(systemAccounts);
  systemAccountIds = new Map(accounts.map((a) => [`${a.type}:${a.currency}`, a.id]));
});

function sysAccount(type: string, currency: Currency): string {
  const id = systemAccountIds.get(`${type}:${currency}`);
  if (id === undefined) throw new Error(`missing system account ${type}:${currency}`);
  return id;
}

async function createWallet(currency: Currency): Promise<string> {
  const [user] = await t.db
    .insert(users)
    .values({
      email: `${crypto.randomUUID()}@test.local`,
      passwordHash: "test-hash",
      fullName: "Test User",
      countryCode: "KN",
    })
    .returning({ id: users.id });
  const [wallet] = await t.db
    .insert(wallets)
    .values({ userId: user!.id, currency, address: testWalletAddress() })
    .returning({ id: wallets.id });
  return wallet!.id;
}

async function createTransactionRow(
  sourceCurrency: Currency,
  destCurrency: Currency,
  sourceAmountMinor: number,
  destAmountMinor: number,
  type: "p2p_transfer" | "deposit" = "p2p_transfer",
): Promise<string> {
  const [row] = await t.db
    .insert(transactions)
    .values({
      type,
      status: "settled",
      idempotencyKey: crypto.randomUUID(),
      sourceCurrency,
      destCurrency,
      sourceAmountMinor,
      destAmountMinor,
    })
    .returning({ id: transactions.id });
  return row!.id;
}

/** Mirrors production usage: entries always post inside a DB transaction. */
async function post(transactionId: string, entries: LedgerEntryInput[]): Promise<void> {
  await t.db.transaction(async (tx) => {
    await postLedgerEntries(tx, transactionId, entries);
  });
}

async function fundWallet(walletId: string, currency: Currency, amountMinor: number): Promise<void> {
  const txId = await createTransactionRow(currency, currency, amountMinor, amountMinor, "deposit");
  await post(txId, [
    {
      accountType: "system",
      systemAccountId: sysAccount("settlement_clearing", currency),
      direction: "debit",
      amountMinor,
      currency,
    },
    { accountType: "user_wallet", walletId, direction: "credit", amountMinor, currency },
  ]);
}

describe("postLedgerEntries validation", () => {
  test("rejects unbalanced entries within a currency", async () => {
    const walletId = await createWallet("XCD");
    const txId = await createTransactionRow("XCD", "XCD", 10000, 10000);
    const entries: LedgerEntryInput[] = [
      {
        accountType: "system",
        systemAccountId: sysAccount("settlement_clearing", "XCD"),
        direction: "debit",
        amountMinor: 10000,
        currency: "XCD",
      },
      { accountType: "user_wallet", walletId, direction: "credit", amountMinor: 9000, currency: "XCD" },
    ];
    await expect(post(txId, entries)).rejects.toThrow(UnbalancedLedgerError);
  });

  test("rejects entries that only balance across different currencies", async () => {
    const xcdWallet = await createWallet("XCD");
    const jmdWallet = await createWallet("JMD");
    const txId = await createTransactionRow("XCD", "JMD", 100, 100);
    const entries: LedgerEntryInput[] = [
      { accountType: "user_wallet", walletId: xcdWallet, direction: "debit", amountMinor: 100, currency: "XCD" },
      { accountType: "user_wallet", walletId: jmdWallet, direction: "credit", amountMinor: 100, currency: "JMD" },
    ];
    await expect(post(txId, entries)).rejects.toThrow(UnbalancedLedgerError);
  });

  test("rejects empty, zero, negative and fractional amounts", async () => {
    const walletId = await createWallet("XCD");
    const txId = await createTransactionRow("XCD", "XCD", 100, 100);
    await expect(post(txId, [])).rejects.toThrow(LedgerValidationError);
    for (const amountMinor of [0, -100, 10.5]) {
      const entries: LedgerEntryInput[] = [
        {
          accountType: "system",
          systemAccountId: sysAccount("settlement_clearing", "XCD"),
          direction: "debit",
          amountMinor,
          currency: "XCD",
        },
        { accountType: "user_wallet", walletId, direction: "credit", amountMinor, currency: "XCD" },
      ];
      await expect(post(txId, entries)).rejects.toThrow(LedgerValidationError);
    }
  });

  test("rejects entries whose currency does not match the account", async () => {
    const xcdWallet = await createWallet("XCD");
    const txId = await createTransactionRow("JMD", "JMD", 100, 100);
    const entries: LedgerEntryInput[] = [
      {
        accountType: "system",
        systemAccountId: sysAccount("settlement_clearing", "JMD"),
        direction: "debit",
        amountMinor: 100,
        currency: "JMD",
      },
      { accountType: "user_wallet", walletId: xcdWallet, direction: "credit", amountMinor: 100, currency: "JMD" },
    ];
    await expect(post(txId, entries)).rejects.toThrow(LedgerValidationError);
  });
});

describe("balances", () => {
  test("posting updates the cached balance", async () => {
    const walletId = await createWallet("XCD");
    expect(await getBalance(t.db, walletId)).toBe(0);
    await fundWallet(walletId, "XCD", 10000);
    expect(await getBalance(t.db, walletId)).toBe(10000);
    await fundWallet(walletId, "XCD", 2500);
    expect(await getBalance(t.db, walletId)).toBe(12500);
  });

  test("assertSufficientBalance passes when covered, throws when not", async () => {
    const walletId = await createWallet("XCD");
    await fundWallet(walletId, "XCD", 5000);
    await t.db.transaction(async (tx) => {
      await assertSufficientBalance(tx, walletId, 5000);
    });
    await expect(
      t.db.transaction(async (tx) => {
        await assertSufficientBalance(tx, walletId, 5001);
      }),
    ).rejects.toThrow(InsufficientBalanceError);
  });

  test("overdraw is blocked by the database even when the pre-check is skipped", async () => {
    const walletId = await createWallet("XCD");
    await fundWallet(walletId, "XCD", 100);
    const txId = await createTransactionRow("XCD", "XCD", 150, 150);
    const entries: LedgerEntryInput[] = [
      { accountType: "user_wallet", walletId, direction: "debit", amountMinor: 150, currency: "XCD" },
      {
        accountType: "system",
        systemAccountId: sysAccount("settlement_clearing", "XCD"),
        direction: "credit",
        amountMinor: 150,
        currency: "XCD",
      },
    ];
    await expect(post(txId, entries)).rejects.toThrow(InsufficientBalanceError);
    expect(await getBalance(t.db, walletId)).toBe(100);
    expect((await reconcile(t.db)).mismatches).toEqual([]);
  });
});

describe("append-only enforcement", () => {
  test("UPDATE on ledger_entries raises", async () => {
    const walletId = await createWallet("XCD");
    await fundWallet(walletId, "XCD", 1000);
    // Wrapped in a native promise: postgres.js queries are lazy thenables that
    // bun's expect().rejects never triggers.
    const attempt = async () => {
      await t.client`UPDATE ledger_entries SET amount_minor = 1`;
    };
    await expect(attempt()).rejects.toThrow(/append-only/);
  });

  test("DELETE on ledger_entries raises", async () => {
    const walletId = await createWallet("XCD");
    await fundWallet(walletId, "XCD", 1000);
    const attempt = async () => {
      await t.client`DELETE FROM ledger_entries`;
    };
    await expect(attempt()).rejects.toThrow(/append-only/);
  });
});

describe("reconcile", () => {
  test("cache matches ledger after 100 random transactions", async () => {
    const currencies: Currency[] = ["XCD", "JMD", "BBD", "TTD"];
    const walletIds: string[] = [];
    const currencyByWallet = new Map<string, Currency>();
    for (const currency of currencies) {
      const walletId = await createWallet(currency);
      walletIds.push(walletId);
      currencyByWallet.set(walletId, currency);
      await fundWallet(walletId, currency, 1_000_000);
    }

    const randomInt = (min: number, max: number) =>
      min + Math.floor(Math.random() * (max - min + 1));

    for (let i = 0; i < 100; i++) {
      const senderId = walletIds[randomInt(0, walletIds.length - 1)]!;
      let recipientId = senderId;
      while (recipientId === senderId) {
        recipientId = walletIds[randomInt(0, walletIds.length - 1)]!;
      }
      const sourceCurrency = currencyByWallet.get(senderId)!;
      const destCurrency = currencyByWallet.get(recipientId)!;
      const sourceAmount = randomInt(1, 5000);
      const destAmount = randomInt(1, 5000);

      const entries: LedgerEntryInput[] =
        sourceCurrency === destCurrency
          ? [
              {
                accountType: "user_wallet",
                walletId: senderId,
                direction: "debit",
                amountMinor: sourceAmount,
                currency: sourceCurrency,
              },
              {
                accountType: "user_wallet",
                walletId: recipientId,
                direction: "credit",
                amountMinor: sourceAmount,
                currency: sourceCurrency,
              },
            ]
          : [
              {
                accountType: "user_wallet",
                walletId: senderId,
                direction: "debit",
                amountMinor: sourceAmount,
                currency: sourceCurrency,
              },
              {
                accountType: "system",
                systemAccountId: sysAccount("fx_liquidity", sourceCurrency),
                direction: "credit",
                amountMinor: sourceAmount,
                currency: sourceCurrency,
              },
              {
                accountType: "system",
                systemAccountId: sysAccount("fx_liquidity", destCurrency),
                direction: "debit",
                amountMinor: destAmount,
                currency: destCurrency,
              },
              {
                accountType: "user_wallet",
                walletId: recipientId,
                direction: "credit",
                amountMinor: destAmount,
                currency: destCurrency,
              },
            ];

      const txId = await createTransactionRow(
        sourceCurrency,
        destCurrency,
        sourceAmount,
        sourceCurrency === destCurrency ? sourceAmount : destAmount,
      );
      await post(txId, entries);
    }

    const result = await reconcile(t.db);
    expect(result.walletsChecked).toBe(4);
    expect(result.mismatches).toEqual([]);
  });

  test("detects a corrupted cache row", async () => {
    const walletId = await createWallet("XCD");
    await fundWallet(walletId, "XCD", 1000);
    await t.client`UPDATE wallet_balances SET balance_minor = balance_minor + 1 WHERE wallet_id = ${walletId}`;
    const result = await reconcile(t.db);
    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0]!.walletId).toBe(walletId);
    expect(result.mismatches[0]!.derivedMinor).toBe("1000");
    expect(result.mismatches[0]!.cachedMinor).toBe("1001");
  });
});
