import { SQL } from "bun";
import { and, desc, eq } from "drizzle-orm";
import { applyRate, homeCurrencyFor, toMinor, type Currency } from "@caribpay/shared";
import type { DbHandle } from "./client";
import { contacts, fxRates, systemAccounts, transactions, users } from "./schema";
import { seedFxRates, seedSystemAccounts } from "./seed";
import { postLedgerEntries, type LedgerEntryInput } from "../services/ledger";
import { createWalletForUser } from "../services/wallets";

const DEMO_PASSWORD = "demo1234";

interface DemoUserSpec {
  key: string;
  email: string;
  fullName: string;
  countryCode: string;
  /** Home-wallet starting balance, in major units. */
  fundMajor: number;
}

const DEMO_USERS: DemoUserSpec[] = [
  { key: "kitts", email: "amara@caribpay.test", fullName: "Amara Liburd", countryCode: "KN", fundMajor: 5000 },
  { key: "jamaica", email: "devon@caribpay.test", fullName: "Devon Campbell", countryCode: "JM", fundMajor: 800000 },
  { key: "barbados", email: "shanice@caribpay.test", fullName: "Shanice Braithwaite", countryCode: "BB", fundMajor: 4000 },
  { key: "trinidad", email: "ravi@caribpay.test", fullName: "Ravi Maharaj", countryCode: "TT", fundMajor: 10000 },
];

// [sender, recipient, amount in sender's currency, daysAgo, note]
const HISTORICAL_TRANSFERS: Array<[string, string, number, number, string]> = [
  ["kitts", "jamaica", 120, 28, "Birthday gift"],
  ["jamaica", "kitts", 5000, 26, "Repayment"],
  ["barbados", "trinidad", 200, 24, "Concert tickets"],
  ["trinidad", "barbados", 350, 22, "Dinner split"],
  ["kitts", "barbados", 90, 20, "Groceries"],
  ["jamaica", "trinidad", 8000, 18, "Rent share"],
  ["trinidad", "kitts", 500, 16, "Freelance work"],
  ["barbados", "jamaica", 150, 14, "Gift"],
  ["kitts", "trinidad", 75, 12, "Coffee fund"],
  ["jamaica", "barbados", 12000, 10, "Wedding contribution"],
  ["trinidad", "jamaica", 400, 8, "Loan"],
  ["barbados", "kitts", 220, 6, "Supplies"],
  ["jamaica", "kitts", 6500, 4, "Thanks!"],
  ["trinidad", "barbados", 180, 3, "Taxi"],
  ["kitts", "jamaica", 60, 1, "Lunch"],
];

interface SeededUser {
  userId: string;
  walletId: string;
  address: string;
  currency: Currency;
}

const DATA_TABLES = [
  "contacts",
  "idempotency_records",
  "ledger_entries",
  "wallet_balances",
  "transactions",
  "wallets",
  "refresh_tokens",
  "fx_rates",
  "system_accounts",
  "users",
];

async function resetAllData(client: SQL): Promise<void> {
  await client.unsafe(`TRUNCATE ${DATA_TABLES.join(", ")} RESTART IDENTITY CASCADE`);
}

/** Idempotently ensure the ledger's system accounts and FX rates exist. */
async function ensureSystemAndFx(dbh: DbHandle): Promise<void> {
  await seedSystemAccounts(dbh);
  const [existing] = await dbh.select({ id: fxRates.id }).from(fxRates).limit(1);
  if (existing === undefined) {
    await seedFxRates(dbh);
  }
}

async function systemAccountMap(dbh: DbHandle): Promise<Map<string, string>> {
  const rows = await dbh.select().from(systemAccounts);
  return new Map(rows.map((r) => [`${r.type}:${r.currency}`, r.id]));
}

async function latestRate(dbh: DbHandle, from: Currency, to: Currency): Promise<string> {
  const [row] = await dbh
    .select({ rate: fxRates.rate })
    .from(fxRates)
    .where(and(eq(fxRates.baseCurrency, from), eq(fxRates.quoteCurrency, to)))
    .orderBy(desc(fxRates.validFrom))
    .limit(1);
  if (row === undefined) throw new Error(`No FX rate for ${from}/${to}`);
  return row.rate;
}

async function createDemoUser(dbh: DbHandle, spec: DemoUserSpec): Promise<SeededUser> {
  const passwordHash = await Bun.password.hash(DEMO_PASSWORD, { algorithm: "argon2id" });
  const currency = homeCurrencyFor(spec.countryCode);
  const [user] = await dbh
    .insert(users)
    .values({
      email: spec.email,
      passwordHash,
      fullName: spec.fullName,
      countryCode: spec.countryCode,
      kycStatus: "verified",
    })
    .returning({ id: users.id });
  const wallet = await createWalletForUser(dbh, user!.id, currency);
  return { userId: user!.id, walletId: wallet.id, address: wallet.address, currency };
}

async function fundWallet(
  dbh: DbHandle,
  sys: Map<string, string>,
  user: SeededUser,
  amountMinor: number,
): Promise<void> {
  const clearing = sys.get(`settlement_clearing:${user.currency}`)!;
  const [tx] = await dbh
    .insert(transactions)
    .values({
      type: "deposit",
      status: "settled",
      idempotencyKey: `demo-deposit-${crypto.randomUUID()}`,
      recipientUserId: user.userId,
      sourceCurrency: user.currency,
      destCurrency: user.currency,
      sourceAmountMinor: amountMinor,
      destAmountMinor: amountMinor,
      settledAt: new Date(),
    })
    .returning({ id: transactions.id });
  await dbh.transaction(async (t) => {
    await postLedgerEntries(t, tx!.id, [
      { accountType: "system", systemAccountId: clearing, direction: "debit", amountMinor, currency: user.currency },
      { accountType: "user_wallet", walletId: user.walletId, direction: "credit", amountMinor, currency: user.currency },
    ]);
  });
}

async function seedHistoricalTransfer(
  dbh: DbHandle,
  sys: Map<string, string>,
  sender: SeededUser,
  recipient: SeededUser,
  sourceAmountMinor: number,
  daysAgo: number,
  note: string,
): Promise<void> {
  const rate = await latestRate(dbh, sender.currency, recipient.currency);
  const destAmountMinor = applyRate(sourceAmountMinor, rate);
  const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  const settledAt = new Date(createdAt.getTime() + 4000);

  const [tx] = await dbh
    .insert(transactions)
    .values({
      type: "p2p_transfer",
      status: "settled",
      idempotencyKey: `demo-transfer-${crypto.randomUUID()}`,
      senderUserId: sender.userId,
      recipientUserId: recipient.userId,
      sourceCurrency: sender.currency,
      destCurrency: recipient.currency,
      sourceAmountMinor,
      destAmountMinor,
      fxRateUsed: rate,
      note,
      createdAt,
      settledAt,
    })
    .returning({ id: transactions.id });

  const srcLiquidity = sys.get(`fx_liquidity:${sender.currency}`)!;
  const destLiquidity = sys.get(`fx_liquidity:${recipient.currency}`)!;
  const entries: LedgerEntryInput[] = [
    { accountType: "user_wallet", walletId: sender.walletId, direction: "debit", amountMinor: sourceAmountMinor, currency: sender.currency },
    { accountType: "system", systemAccountId: srcLiquidity, direction: "credit", amountMinor: sourceAmountMinor, currency: sender.currency },
    { accountType: "system", systemAccountId: destLiquidity, direction: "debit", amountMinor: destAmountMinor, currency: recipient.currency },
    { accountType: "user_wallet", walletId: recipient.walletId, direction: "credit", amountMinor: destAmountMinor, currency: recipient.currency },
  ];
  await dbh.transaction(async (t) => {
    await postLedgerEntries(t, tx!.id, entries);
  });
}

async function linkContacts(dbh: DbHandle, seeded: Map<string, SeededUser>): Promise<void> {
  const rows = [];
  for (const [ownerKey, owner] of seeded) {
    for (const spec of DEMO_USERS) {
      if (spec.key === ownerKey) continue;
      const target = seeded.get(spec.key)!;
      rows.push({
        ownerUserId: owner.userId,
        contactUserId: target.userId,
        walletAddress: target.address,
        displayName: spec.fullName.split(" ")[0]!,
        // Pinned so the Contacts screen's "Quick send" row is populated in a demo.
        pinned: true,
      });
    }
  }
  await dbh.insert(contacts).values(rows);
}

export async function seedDemo(
  dbh: DbHandle,
  client: SQL,
  options: { reset: boolean },
): Promise<{ created: boolean }> {
  if (options.reset) {
    await resetAllData(client);
  }

  const [existingDemo] = await dbh
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, DEMO_USERS[0]!.email));
  if (existingDemo !== undefined) {
    return { created: false };
  }

  await ensureSystemAndFx(dbh);
  const sys = await systemAccountMap(dbh);

  const seeded = new Map<string, SeededUser>();
  for (const spec of DEMO_USERS) {
    const user = await createDemoUser(dbh, spec);
    seeded.set(spec.key, user);
    await fundWallet(dbh, sys, user, toMinor(String(spec.fundMajor), user.currency));
  }

  await linkContacts(dbh, seeded);

  // Post oldest-first so timestamps read naturally in the feed.
  const ordered = [...HISTORICAL_TRANSFERS].sort((a, b) => b[3] - a[3]);
  for (const [senderKey, recipientKey, amountMajor, daysAgo, note] of ordered) {
    const sender = seeded.get(senderKey)!;
    const recipient = seeded.get(recipientKey)!;
    await seedHistoricalTransfer(
      dbh,
      sys,
      sender,
      recipient,
      toMinor(String(amountMajor), sender.currency),
      daysAgo,
      note,
    );
  }

  return { created: true };
}

if (import.meta.main) {
  const reset = process.argv.includes("--reset");
  const { db, sqlClient } = await import("./client");
  const result = await seedDemo(db, sqlClient, { reset });
  if (result.created) {
    console.log("Demo data seeded. Log in with password 'demo1234':");
    for (const spec of DEMO_USERS) {
      console.log(`  ${spec.fullName.padEnd(22)} ${spec.email}  (${homeCurrencyFor(spec.countryCode)})`);
    }
  } else {
    console.log("Demo users already exist. Re-run with --reset to wipe and reseed.");
  }
  await sqlClient.end();
  process.exit(0);
}
