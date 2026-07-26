import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { BANK_ACCOUNT_STATUSES, SUPPORTED_CURRENCIES } from "@caribpay/shared";

export const currencyEnum = pgEnum("bank_currency", SUPPORTED_CURRENCIES);
export const accountStatusEnum = pgEnum("bank_account_status", BANK_ACCOUNT_STATUSES);
export const holdStatusEnum = pgEnum("hold_status", [
  "outstanding",
  "confirmed",
  "released",
  "expired",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/**
 * A customer account at a member bank. This is where money actually lives — the
 * switch has no equivalent table and must never gain one.
 *
 * Keyed by `institution_handle` rather than a uuid because the two services own
 * separate databases; a shared uuid would need coordinating at seed time, and
 * the handle is already globally unique by design.
 */
export const accounts = pgTable(
  "accounts",
  {
    accountRef: text("account_ref").primaryKey(),
    institutionHandle: text("institution_handle").notNull(),
    holderName: text("holder_name").notNull(),
    currency: currencyEnum("currency").notNull(),
    balanceMinor: bigint("balance_minor", { mode: "number" }).notNull().default(0),
    status: accountStatusEnum("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    index("accounts_institution_idx").on(t.institutionHandle),
    check("accounts_balance_non_negative", sql`${t.balanceMinor} >= 0`),
  ],
);

/**
 * Funds reserved against an account but not yet drawn. `available = balance −
 * sum(outstanding holds)`.
 *
 * `expires_at` is the safety net: even a total switch failure cannot strand
 * someone's money, because the bank releases the hold on its own.
 */
export const holds = pgTable(
  "holds",
  {
    holdRef: text("hold_ref").primaryKey(),
    accountRef: text("account_ref")
      .notNull()
      .references(() => accounts.accountRef),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: currencyEnum("currency").notNull(),
    /** The switch's transaction id, for the bank's own audit trail. */
    reference: text("reference").notNull(),
    status: holdStatusEnum("status").notNull().default("outstanding"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [
    index("holds_account_status_idx").on(t.accountRef, t.status),
    index("holds_reference_idx").on(t.reference),
    check("holds_amount_positive", sql`${t.amountMinor} > 0`),
  ],
);

/** A confirmed hold: money that has left the account. */
export const debits = pgTable(
  "debits",
  {
    debitRef: text("debit_ref").primaryKey(),
    holdRef: text("hold_ref")
      .notNull()
      .references(() => holds.holdRef),
    accountRef: text("account_ref")
      .notNull()
      .references(() => accounts.accountRef),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: currencyEnum("currency").notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("debits_hold_uq").on(t.holdRef)],
);

/** Money arriving into an account. Irrevocable once posted. */
export const credits = pgTable(
  "credits",
  {
    creditRef: text("credit_ref").primaryKey(),
    accountRef: text("account_ref")
      .notNull()
      .references(() => accounts.accountRef),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: currencyEnum("currency").notNull(),
    reference: text("reference").notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("credits_reference_idx").on(t.reference)],
);

/**
 * Replayed responses. A retried instruction must never move money twice — the
 * single most important property of this service.
 */
export const bankIdempotencyRecords = pgTable("bank_idempotency_records", {
  key: text("key").primaryKey(),
  requestHash: text("request_hash").notNull(),
  /**
   * Null while the instruction is still executing. The row is inserted *before*
   * the work starts, so the primary key is what serialises concurrent retries —
   * checking for an existing record and then acting is a race, and the race
   * places two holds.
   */
  responseStatus: integer("response_status"),
  responseBody: jsonb("response_body"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
