/**
 * Customer accounts at the simulated member banks.
 *
 * ⚠️  Every institution named here is SIMULATED. See the header of
 * `packages/shared/src/institutions-data.ts` — we have no relationship with any
 * of these banks and nothing here connects to one.
 *
 * Account references are deterministic (`<HANDLE>-<slot>-<check>`) so the API's
 * demo seed can link to them without the two databases coordinating at run time.
 */
import { LINKABLE_INSTITUTION_SEEDS, toMinor, type Currency } from "@caribpay/shared";
import type { DbHandle } from "./client";
import { accounts } from "./schema";

export interface DemoAccountSpec {
  accountRef: string;
  institutionHandle: string;
  holderName: string;
  currency: Currency;
  /** Opening balance in major units. */
  openingMajor: number;
  status?: "active" | "frozen" | "closed";
}

/** Stable reference for a bank's nth account. */
export function accountRefFor(institutionHandle: string, slot: number): string {
  const suffix = String(4000 + slot).padStart(4, "0");
  return `${institutionHandle.toUpperCase()}-ACCT-${suffix}`;
}

/**
 * The four demo users' accounts, plus the two edge-case accounts the failure
 * branches are demonstrated against.
 */
export const DEMO_ACCOUNTS: DemoAccountSpec[] = [
  {
    accountRef: accountRefFor("sknanb", 1),
    institutionHandle: "sknanb",
    holderName: "Amara Liburd",
    currency: "XCD",
    openingMajor: 5000,
  },
  {
    accountRef: accountRefFor("ncb", 1),
    institutionHandle: "ncb",
    holderName: "Devon Campbell",
    currency: "JMD",
    openingMajor: 800000,
  },
  {
    accountRef: accountRefFor("republicbb", 1),
    institutionHandle: "republicbb",
    holderName: "Shanice Braithwaite",
    currency: "BBD",
    openingMajor: 4000,
  },
  {
    accountRef: accountRefFor("republictt", 1),
    institutionHandle: "republictt",
    holderName: "Ravi Maharaj",
    currency: "TTD",
    openingMajor: 10000,
  },
  // Demonstrating the failure branches needs accounts that refuse deterministically,
  // rather than a random failure knob nobody can aim.
  {
    accountRef: accountRefFor("ncb", 9),
    institutionHandle: "ncb",
    holderName: "Closed Account",
    currency: "JMD",
    openingMajor: 0,
    status: "closed",
  },
  {
    accountRef: accountRefFor("sknanb", 9),
    institutionHandle: "sknanb",
    holderName: "Frozen Account",
    currency: "XCD",
    openingMajor: 100,
    status: "frozen",
  },
];

export async function seedDemoAccounts(dbh: DbHandle): Promise<number> {
  const rows = DEMO_ACCOUNTS.map((spec) => ({
    accountRef: spec.accountRef,
    institutionHandle: spec.institutionHandle,
    holderName: spec.holderName,
    currency: spec.currency,
    balanceMinor: toMinor(spec.openingMajor, spec.currency),
    status: spec.status ?? ("active" as const),
  }));
  await dbh.insert(accounts).values(rows).onConflictDoNothing();
  return rows.length;
}

if (import.meta.main) {
  const { db, sqlClient } = await import("./client");
  const linkable = LINKABLE_INSTITUTION_SEEDS.length;
  const count = await seedDemoAccounts(db);
  console.log(`seeded ${count} account(s) across ${linkable} simulated institution(s)`);
  await sqlClient.end();
  process.exit(0);
}
