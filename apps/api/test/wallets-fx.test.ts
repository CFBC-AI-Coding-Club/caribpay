import { afterAll, beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
  WALLET_ADDRESS_PATTERN,
  authResponseSchema,
  errorResponseSchema,
  fxQuoteResponseSchema,
  transactionsPageSchema,
  walletsResponseSchema,
  createWalletResponseSchema,
} from "@caribpay/shared";
import type { Hono } from "hono";
import type { AppEnv } from "../src/app-env";
import { fxRates, wallets } from "../src/db/schema";
import { seedFxRates, seedSystemAccounts } from "../src/db/seed";
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

beforeAll(async () => {
  t = await setupTestDb();
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  const { buildApp } = await import("../src/app");
  app = buildApp();
});

afterAll(async () => {
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

async function registerUser(countryCode = "KN") {
  const res = await api("/api/v1/auth/register", undefined, {
    method: "POST",
    body: JSON.stringify({
      email: `${crypto.randomUUID()}@test.local`,
      password: "password-12345",
      fullName: "Test User",
      countryCode,
    }),
  });
  expect(res.status).toBe(201);
  const { user, tokens } = authResponseSchema.parse(await res.json());
  const [wallet] = await t.db.select().from(wallets).where(eq(wallets.userId, user.id));
  return { userId: user.id, token: tokens.accessToken, walletId: wallet!.id };
}

describe("GET /wallets", () => {
  test("new account: one wallet, zero balance, zero home-currency total", async () => {
    const { token } = await registerUser("KN");
    const res = await api("/api/v1/wallets", token);
    expect(res.status).toBe(200);
    const body = walletsResponseSchema.parse(await res.json());
    expect(body.wallets).toHaveLength(1);
    expect(body.wallets[0]!.currency).toBe("XCD");
    expect(body.wallets[0]!.balanceMinor).toBe(0);
    expect(body.totalBalance).toEqual({ currency: "XCD", amountMinor: 0 });
  });

  test("reflects cached balances and converts the total into the home currency", async () => {
    const { token, walletId } = await registerUser("KN");
    await fundWalletForTest(t.db, walletId, "XCD", 50000);

    const created = await api("/api/v1/wallets", token, {
      method: "POST",
      body: JSON.stringify({ currency: "JMD" }),
    });
    expect(created.status).toBe(201);
    const { wallet: jmdWallet } = createWalletResponseSchema.parse(await created.json());
    await fundWalletForTest(t.db, jmdWallet.id, "JMD", 100000);

    const res = await api("/api/v1/wallets", token);
    const body = walletsResponseSchema.parse(await res.json());
    const byCurrency = new Map(body.wallets.map((w) => [w.currency, w]));
    expect(byCurrency.get("XCD")!.balanceMinor).toBe(50000);
    expect(byCurrency.get("JMD")!.balanceMinor).toBe(100000);
    // JMD->XCD seeded rate is (2.7/158).toFixed(8) = 0.01708861;
    // applyRate(100000) = round(1708.861) = 1709, so total = 50000 + 1709.
    expect(body.totalBalance).toEqual({ currency: "XCD", amountMinor: 51709 });
  });

  test("requires auth", async () => {
    expect((await api("/api/v1/wallets")).status).toBe(401);
  });
});

describe("POST /wallets", () => {
  test("creates a wallet in a new currency and rejects duplicates", async () => {
    const { token } = await registerUser("BB");
    const first = await api("/api/v1/wallets", token, {
      method: "POST",
      body: JSON.stringify({ currency: "TTD" }),
    });
    expect(first.status).toBe(201);
    const { wallet } = createWalletResponseSchema.parse(await first.json());
    expect(wallet.currency).toBe("TTD");
    expect(wallet.address).toMatch(WALLET_ADDRESS_PATTERN);

    const dup = await api("/api/v1/wallets", token, {
      method: "POST",
      body: JSON.stringify({ currency: "TTD" }),
    });
    expect(dup.status).toBe(409);
    expect(errorResponseSchema.parse(await dup.json()).error.code).toBe("WALLET_EXISTS");
  });
});

describe("GET /fx/quote", () => {
  test("computes destAmountMinor from the latest seeded rate", async () => {
    const { token } = await registerUser("KN");
    const res = await api("/api/v1/fx/quote?from=XCD&to=JMD&amountMinor=150000", token);
    expect(res.status).toBe(200);
    const { quote } = fxQuoteResponseSchema.parse(await res.json());
    // XCD->JMD seeded rate is (158/2.7).toFixed(8) = 58.51851852;
    // 150000 * 58.51851852 = 8777777.778 -> rounds half-up to 8777778.
    expect(quote.rate).toBe("58.51851852");
    expect(quote.sourceAmountMinor).toBe(150000);
    expect(quote.destAmountMinor).toBe(8777778);
    const msLeft = new Date(quote.expiresAt).getTime() - Date.now();
    expect(msLeft).toBeGreaterThan(50000);
    expect(msLeft).toBeLessThanOrEqual(61000);

    const { getQuote } = await import("../src/services/fx");
    expect(await getQuote(quote.id)).toEqual(quote);
    expect(await getQuote(crypto.randomUUID())).toBeNull();
  });

  test("uses the newest rate row for the pair", async () => {
    const { token } = await registerUser("KN");
    await t.db.insert(fxRates).values({
      baseCurrency: "XCD",
      quoteCurrency: "JMD",
      rate: "60.00000000",
      validFrom: new Date(Date.now() + 1000),
    });
    const res = await api("/api/v1/fx/quote?from=XCD&to=JMD&amountMinor=150000", token);
    const { quote } = fxQuoteResponseSchema.parse(await res.json());
    expect(quote.rate).toBe("60.00000000");
    expect(quote.destAmountMinor).toBe(9000000);
  });

  test("rejects same-currency, invalid amounts, and missing auth", async () => {
    const { token } = await registerUser("KN");
    const same = await api("/api/v1/fx/quote?from=XCD&to=XCD&amountMinor=100", token);
    expect(same.status).toBe(400);
    expect(errorResponseSchema.parse(await same.json()).error.code).toBe("SAME_CURRENCY");

    const zero = await api("/api/v1/fx/quote?from=XCD&to=JMD&amountMinor=0", token);
    expect(zero.status).toBe(400);

    const anon = await api("/api/v1/fx/quote?from=XCD&to=JMD&amountMinor=100");
    expect(anon.status).toBe(401);
  });
});

describe("GET /wallets/:id/transactions", () => {
  test("paginates newest-first with a stable keyset cursor", async () => {
    const { token, walletId } = await registerUser("KN");
    const txIds: string[] = [];
    for (const amount of [1000, 2000, 3000, 4000]) {
      txIds.push(await fundWalletForTest(t.db, walletId, "XCD", amount));
    }

    const page1Res = await api(`/api/v1/wallets/${walletId}/transactions?limit=3`, token);
    expect(page1Res.status).toBe(200);
    const page1 = transactionsPageSchema.parse(await page1Res.json());
    expect(page1.items).toHaveLength(3);
    expect(page1.items.map((i) => i.id)).toEqual([txIds[3], txIds[2], txIds[1]]);
    expect(page1.items[0]!.walletDeltaMinor).toBe(4000);
    expect(page1.nextCursor).toBe(txIds[1]!);

    // A new insert must not shift the next page (keyset, not offset).
    await fundWalletForTest(t.db, walletId, "XCD", 5000);

    const page2Res = await api(
      `/api/v1/wallets/${walletId}/transactions?limit=3&cursor=${page1.nextCursor}`,
      token,
    );
    const page2 = transactionsPageSchema.parse(await page2Res.json());
    expect(page2.items.map((i) => i.id)).toEqual([txIds[0]]);
    expect(page2.nextCursor).toBeNull();
  });

  test("404s for another user's wallet and unknown ids", async () => {
    const alice = await registerUser("KN");
    const mallory = await registerUser("JM");
    const foreign = await api(`/api/v1/wallets/${alice.walletId}/transactions`, mallory.token);
    expect(foreign.status).toBe(404);
    const unknown = await api(`/api/v1/wallets/${crypto.randomUUID()}/transactions`, alice.token);
    expect(unknown.status).toBe(404);
  });
});
