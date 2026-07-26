/**
 * The demo world.
 *
 * ⚠️  Every institution named here is SIMULATED — see
 * `packages/shared/src/institutions-data.ts`. We have no relationship with any
 * of these banks.
 *
 * Account references match `apps/mock-bank/src/db/seed.ts` exactly. The two
 * services own separate databases and never join, so the seeds agree by using
 * the same deterministic reference format rather than by sharing ids.
 */
import { SQL } from "bun";
import { eq } from "drizzle-orm";
import { maskName, vpaSkeleton } from "@caribpay/shared";
import type { DbHandle } from "./client";
import { contacts, directoryKeys, institutions, linkedAccounts, users } from "./schema";
import { seedFxOpeningPosition, seedFxRates, seedInstitutions, seedSystemAccounts } from "./seed";

const DEMO_PASSWORD = "demo1234";

interface DemoUserSpec {
  key: string;
  email: string;
  fullName: string;
  countryCode: string;
  vpa: string;
  phone: string;
  institutionHandle: string;
  /** Must match a row seeded in apps/mock-bank. */
  accountRef: string;
}

const DEMO_USERS: DemoUserSpec[] = [
  {
    key: "kitts",
    email: "amara@caribpay.test",
    fullName: "Amara Liburd",
    countryCode: "KN",
    vpa: "amara@caribpay",
    phone: "+18697654321",
    institutionHandle: "sknanb",
    accountRef: "SKNANB-ACCT-4001",
  },
  {
    key: "jamaica",
    email: "devon@caribpay.test",
    fullName: "Devon Campbell",
    countryCode: "JM",
    vpa: "devon@caribpay",
    phone: "+18765550123",
    institutionHandle: "ncb",
    accountRef: "NCB-ACCT-4001",
  },
  {
    key: "barbados",
    email: "shanice@caribpay.test",
    fullName: "Shanice Braithwaite",
    countryCode: "BB",
    vpa: "shanice@caribpay",
    phone: "+12465550188",
    institutionHandle: "republicbb",
    accountRef: "REPUBLICBB-ACCT-4001",
  },
  {
    key: "trinidad",
    email: "ravi@caribpay.test",
    fullName: "Ravi Maharaj",
    countryCode: "TT",
    vpa: "ravi@caribpay",
    phone: "+18685550177",
    institutionHandle: "republictt",
    accountRef: "REPUBLICTT-ACCT-4001",
  },
];

/** [owner, contact, pinned] */
const DEMO_CONTACTS: Array<[string, string, boolean]> = [
  ["kitts", "jamaica", true],
  ["kitts", "barbados", true],
  ["kitts", "trinidad", false],
  ["jamaica", "kitts", true],
  ["jamaica", "trinidad", false],
  ["barbados", "kitts", true],
  ["barbados", "trinidad", true],
  ["trinidad", "kitts", true],
  ["trinidad", "jamaica", false],
];

const DATA_TABLES = [
  "notifications",
  "settlement_cycle_entries",
  "settlement_cycles",
  "contacts",
  "idempotency_records",
  "ledger_entries",
  "transactions",
  "directory_keys",
  "linked_accounts",
  "system_accounts",
  "institutions",
  "refresh_tokens",
  "fx_rates",
  "users",
];

async function resetAllData(client: SQL): Promise<void> {
  await client.unsafe(`TRUNCATE ${DATA_TABLES.join(", ")} RESTART IDENTITY CASCADE`);
}

export interface SeededUser {
  userId: string;
  accountId: string;
  vpa: string;
}

async function seedUser(dbh: DbHandle, spec: DemoUserSpec): Promise<SeededUser> {
  const passwordHash = await Bun.password.hash(DEMO_PASSWORD, { algorithm: "argon2id" });

  const [user] = await dbh
    .insert(users)
    .values({
      email: spec.email,
      passwordHash,
      fullName: spec.fullName,
      countryCode: spec.countryCode,
      kycStatus: "verified",
    })
    .returning();

  const [institution] = await dbh
    .select()
    .from(institutions)
    .where(eq(institutions.pspHandle, spec.institutionHandle));
  if (institution === undefined) {
    throw new Error(`Institution ${spec.institutionHandle} is not seeded`);
  }

  const [account] = await dbh
    .insert(linkedAccounts)
    .values({
      userId: user!.id,
      institutionId: institution.id,
      accountRef: spec.accountRef,
      accountNumberMasked: `••••${spec.accountRef.slice(-4)}`,
      currency: institution.currency,
      holderNameVerified: maskName(spec.fullName),
      isDefault: true,
    })
    .returning();

  const [caribpay] = await dbh
    .select({ id: institutions.id })
    .from(institutions)
    .where(eq(institutions.pspHandle, "caribpay"));

  const local = spec.vpa.split("@")[0]!;
  await dbh.insert(directoryKeys).values([
    {
      userId: user!.id,
      type: "vpa",
      valueRaw: spec.vpa,
      valueNormalized: spec.vpa,
      skeleton: vpaSkeleton(local),
      institutionId: caribpay?.id ?? null,
      linkedAccountId: account!.id,
      isPrimary: true,
      verifiedAt: new Date(),
    },
    {
      // Demo users arrive with a verified phone key so resolve-by-phone can be
      // shown without walking the OTP flow on stage.
      userId: user!.id,
      type: "phone",
      valueRaw: spec.phone,
      valueNormalized: spec.phone,
      linkedAccountId: account!.id,
      isPrimary: false,
      verifiedAt: new Date(),
    },
  ]);

  return { userId: user!.id, accountId: account!.id, vpa: spec.vpa };
}

export async function seedDemoWorld(dbh: DbHandle): Promise<Map<string, SeededUser>> {
  await seedInstitutions(dbh);
  await seedSystemAccounts(dbh);
  await seedFxRates(dbh);
  await seedFxOpeningPosition(dbh);

  const seeded = new Map<string, SeededUser>();
  for (const spec of DEMO_USERS) {
    seeded.set(spec.key, await seedUser(dbh, spec));
  }

  const contactRows = DEMO_CONTACTS.flatMap(([ownerKey, contactKey, pinned]) => {
    const owner = seeded.get(ownerKey);
    const contact = seeded.get(contactKey);
    const spec = DEMO_USERS.find((u) => u.key === contactKey);
    if (owner === undefined || contact === undefined || spec === undefined) return [];
    return [
      {
        ownerUserId: owner.userId,
        contactUserId: contact.userId,
        savedKey: contact.vpa,
        displayName: spec.fullName,
        pinned,
      },
    ];
  });
  if (contactRows.length > 0) {
    await dbh.insert(contacts).values(contactRows).onConflictDoNothing();
  }

  return seeded;
}

if (import.meta.main) {
  const { db, sqlClient, databaseUrl } = await import("./client");
  const reset = process.argv.includes("--reset");

  const [existing] = await db.select({ id: users.id }).from(users).limit(1);
  if (existing !== undefined && !reset) {
    console.error("Demo data already exists. Re-run with --reset to wipe and reseed.");
    await sqlClient.end();
    process.exit(1);
  }
  if (reset) {
    const client = new SQL(databaseUrl, { max: 1 });
    await resetAllData(client);
    await client.close();
  }

  const seeded = await seedDemoWorld(db);
  console.log(`seeded ${seeded.size} demo users (password: ${DEMO_PASSWORD})`);
  for (const spec of DEMO_USERS) {
    console.log(`  ${spec.fullName.padEnd(22)} ${spec.vpa.padEnd(18)} ${spec.accountRef}`);
  }
  console.log("\nBank balances live in the mock-bank database — run: bun run db:seed:bank");
  await sqlClient.end();
  process.exit(0);
}
