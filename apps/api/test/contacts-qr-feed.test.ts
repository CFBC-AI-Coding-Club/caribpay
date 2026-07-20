import { afterAll, beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { Worker } from "bullmq";
import {
  WALLET_ADDRESS_PATTERN,
  authResponseSchema,
  contactsResponseSchema,
  createContactResponseSchema,
  errorResponseSchema,
  qrReceiveResponseSchema,
  qrResolveResponseSchema,
  transactionsPageSchema,
  transferResponseSchema,
} from "@caribpay/shared";
import type { Hono } from "hono";
import type { AppEnv } from "../src/app-env";
import { wallets } from "../src/db/schema";
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
let worker: Worker;

beforeAll(async () => {
  t = await setupTestDb();
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.MOCK_SETTLEMENT_DELAY_MS = "100";
  const { buildApp } = await import("../src/app");
  app = buildApp();
  const { settlementQueue } = await import("../src/lib/queue");
  await settlementQueue.obliterate({ force: true });
  const { createSettlementWorker } = await import("../src/workers/settlement");
  worker = createSettlementWorker();
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

async function registerUser(countryCode = "KN", fullName = "Test User") {
  const res = await api("/api/v1/auth/register", undefined, {
    method: "POST",
    body: JSON.stringify({
      email: `${crypto.randomUUID()}@test.local`,
      password: "password-12345",
      fullName,
      countryCode,
    }),
  });
  expect(res.status).toBe(201);
  const { user, tokens } = authResponseSchema.parse(await res.json());
  const [wallet] = await t.db.select().from(wallets).where(eq(wallets.userId, user.id));
  return {
    userId: user.id,
    token: tokens.accessToken,
    walletId: wallet!.id,
    address: wallet!.address,
  };
}

describe("contacts", () => {
  test("adds a contact for a real address and lists it", async () => {
    const owner = await registerUser("KN");
    const friend = await registerUser("JM", "Marlon Case");

    const created = await api("/api/v1/contacts", owner.token, {
      method: "POST",
      body: JSON.stringify({ walletAddress: friend.address, displayName: "Marlon" }),
    });
    expect(created.status).toBe(201);
    const { contact } = createContactResponseSchema.parse(await created.json());
    expect(contact.walletAddress).toBe(friend.address);
    expect(contact.contactUserId).toBe(friend.userId);
    expect(contact.displayName).toBe("Marlon");

    const list = await api("/api/v1/contacts", owner.token);
    const { contacts } = contactsResponseSchema.parse(await list.json());
    expect(contacts).toHaveLength(1);
    expect(contacts[0]!.id).toBe(contact.id);
  });

  test("rejects unknown addresses, self, and duplicates", async () => {
    const owner = await registerUser("KN");
    const friend = await registerUser("JM");

    const ghost = await api("/api/v1/contacts", owner.token, {
      method: "POST",
      body: JSON.stringify({ walletAddress: "CW-AAAA-BBBB-CCCC-DDDD", displayName: "Nobody" }),
    });
    expect(ghost.status).toBe(404);
    expect(errorResponseSchema.parse(await ghost.json()).error.code).toBe("ADDRESS_NOT_FOUND");

    const self = await api("/api/v1/contacts", owner.token, {
      method: "POST",
      body: JSON.stringify({ walletAddress: owner.address, displayName: "Me" }),
    });
    expect(self.status).toBe(422);
    expect(errorResponseSchema.parse(await self.json()).error.code).toBe("SELF_CONTACT");

    const body = JSON.stringify({ walletAddress: friend.address, displayName: "Friend" });
    expect((await api("/api/v1/contacts", owner.token, { method: "POST", body })).status).toBe(201);
    const dup = await api("/api/v1/contacts", owner.token, { method: "POST", body });
    expect(dup.status).toBe(409);
    expect(errorResponseSchema.parse(await dup.json()).error.code).toBe("CONTACT_EXISTS");
  });

  test("contacts are scoped per owner", async () => {
    const alice = await registerUser("KN");
    const bob = await registerUser("BB");
    const friend = await registerUser("JM");
    await api("/api/v1/contacts", alice.token, {
      method: "POST",
      body: JSON.stringify({ walletAddress: friend.address, displayName: "Friend" }),
    });
    const bobList = await api("/api/v1/contacts", bob.token);
    expect(contactsResponseSchema.parse(await bobList.json()).contacts).toHaveLength(0);
  });

  test("requires auth", async () => {
    expect((await api("/api/v1/contacts")).status).toBe(401);
  });
});

describe("QR receive + resolve", () => {
  test("receive payload round-trips through resolve", async () => {
    const user = await registerUser("JM", "Keisha Browne");

    const receiveRes = await api("/api/v1/qr/receive", user.token);
    expect(receiveRes.status).toBe(200);
    const receive = qrReceiveResponseSchema.parse(await receiveRes.json());
    expect(receive.walletAddress).toBe(user.address);
    expect(receive.currency).toBe("JMD"); // home currency default
    expect(receive.displayName).toBe("Keisha Browne");
    expect(receive.payload).toStartWith("caribpay://pay?");

    // Anyone authenticated can resolve a scanned payload.
    const scanner = await registerUser("KN");
    const resolveRes = await api(
      `/api/v1/qr/resolve?payload=${encodeURIComponent(receive.payload)}`,
      scanner.token,
    );
    expect(resolveRes.status).toBe(200);
    const resolved = qrResolveResponseSchema.parse(await resolveRes.json());
    expect(resolved.walletAddress).toBe(user.address);
    expect(resolved.currency).toBe("JMD");
    expect(resolved.displayName).toBe("Keisha Browne");
  });

  test("tampered payloads are rejected", async () => {
    const user = await registerUser("KN");
    const scanner = await registerUser("JM");
    const receive = qrReceiveResponseSchema.parse(
      await (await api("/api/v1/qr/receive", user.token)).json(),
    );

    // Swap the address but keep the original signature.
    const tampered = receive.payload.replace(user.address, "CW-EVIL-EVIL-EVIL-EVIL");
    const res = await api(
      `/api/v1/qr/resolve?payload=${encodeURIComponent(tampered)}`,
      scanner.token,
    );
    expect(res.status).toBe(400);
    expect(errorResponseSchema.parse(await res.json()).error.code).toBe("QR_SIGNATURE_INVALID");

    // Non-CaribPay URI.
    const foreign = await api(
      `/api/v1/qr/resolve?payload=${encodeURIComponent("https://evil.example/pay")}`,
      scanner.token,
    );
    expect(foreign.status).toBe(400);
    expect(errorResponseSchema.parse(await foreign.json()).error.code).toBe("QR_INVALID");
  });

  test("can request a specific currency wallet", async () => {
    const user = await registerUser("KN");
    await api("/api/v1/wallets", user.token, {
      method: "POST",
      body: JSON.stringify({ currency: "USD" }),
    });
    const receive = qrReceiveResponseSchema.parse(
      await (await api("/api/v1/qr/receive?currency=USD", user.token)).json(),
    );
    expect(receive.currency).toBe("USD");
    expect(receive.walletAddress).toMatch(WALLET_ADDRESS_PATTERN);
    expect(receive.walletAddress).not.toBe(user.address); // different from XCD wallet
  });
});

describe("unified transaction feed", () => {
  async function makeTransfer(
    senderToken: string,
    recipientAddress: string,
    amountMinor: number,
  ): Promise<string> {
    const res = await api("/api/v1/transfers", senderToken, {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        recipientAddress,
        sourceCurrency: "XCD",
        destCurrency: "XCD",
        sourceAmountMinor: amountMinor,
      }),
    });
    expect(res.status).toBe(201);
    return transferResponseSchema.parse(await res.json()).transaction.id;
  }

  test("shows transfers where the user is sender or recipient, newest first", async () => {
    const alice = await registerUser("KN");
    const bob = await registerUser("VC");
    const carol = await registerUser("VC"); // XCD home wallet so onward transfer matches
    await fundWalletForTest(t.db, alice.walletId, "XCD", 100000);

    const sent = await makeTransfer(alice.token, bob.address, 1000);
    // Bob (recipient of `sent`) sends onward to Carol — needs XCD funds.
    await fundWalletForTest(t.db, bob.walletId, "XCD", 50000);
    const onward = await makeTransfer(bob.token, carol.address, 2000);

    const aliceFeed = transactionsPageSchema.parse(
      await (await api("/api/v1/transactions", alice.token)).json(),
    );
    expect(aliceFeed.items.map((i) => i.id)).toEqual([sent]);

    const bobFeed = transactionsPageSchema.parse(
      await (await api("/api/v1/transactions", bob.token)).json(),
    );
    // Bob is party to both; newest (onward) first.
    expect(bobFeed.items.map((i) => i.id)).toEqual([onward, sent]);

    const carolFeed = transactionsPageSchema.parse(
      await (await api("/api/v1/transactions", carol.token)).json(),
    );
    expect(carolFeed.items.map((i) => i.id)).toEqual([onward]);
  });

  test("paginates with a stable keyset cursor under new inserts", async () => {
    const alice = await registerUser("KN");
    const bob = await registerUser("VC");
    await fundWalletForTest(t.db, alice.walletId, "XCD", 100000);

    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      ids.push(await makeTransfer(alice.token, bob.address, 100 + i));
    }

    const page1 = transactionsPageSchema.parse(
      await (await api("/api/v1/transactions?limit=3", alice.token)).json(),
    );
    expect(page1.items.map((i) => i.id)).toEqual([ids[3], ids[2], ids[1]]);
    expect(page1.nextCursor).toBe(ids[1]!);

    // Insert a newer transfer; it must not disturb the older page boundary.
    await makeTransfer(alice.token, bob.address, 999);

    const page2 = transactionsPageSchema.parse(
      await (
        await api(`/api/v1/transactions?limit=3&cursor=${page1.nextCursor}`, alice.token)
      ).json(),
    );
    expect(page2.items.map((i) => i.id)).toEqual([ids[0]]);
    expect(page2.nextCursor).toBeNull();
  });

  test("requires auth", async () => {
    expect((await api("/api/v1/transactions")).status).toBe(401);
  });
});
