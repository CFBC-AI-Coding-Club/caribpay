import {
  bigint,
  char,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  KYC_STATUSES,
  SUPPORTED_CURRENCIES,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
} from "@caribpay/shared";

export const currencyEnum = pgEnum("currency", SUPPORTED_CURRENCIES);
export const kycStatusEnum = pgEnum("kyc_status", KYC_STATUSES);
export const transactionTypeEnum = pgEnum("transaction_type", TRANSACTION_TYPES);
export const transactionStatusEnum = pgEnum("transaction_status", TRANSACTION_STATUSES);
export const systemAccountTypeEnum = pgEnum("system_account_type", [
  "fx_liquidity",
  "settlement_clearing",
  "fee_revenue",
]);
export const ledgerAccountTypeEnum = pgEnum("ledger_account_type", ["user_wallet", "system"]);
export const ledgerDirectionEnum = pgEnum("ledger_direction", ["debit", "credit"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  countryCode: char("country_code", { length: 2 }).notNull(),
  kycStatus: kycStatusEnum("kyc_status").notNull().default("unverified"),
  ...timestamps,
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  ...timestamps,
});

export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    currency: currencyEnum("currency").notNull(),
    address: text("address").notNull().unique(),
    ...timestamps,
  },
  (t) => [uniqueIndex("wallets_user_currency_uq").on(t.userId, t.currency)],
);

export const systemAccounts = pgTable(
  "system_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: systemAccountTypeEnum("type").notNull(),
    currency: currencyEnum("currency").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("system_accounts_type_currency_uq").on(t.type, t.currency)],
);

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: transactionTypeEnum("type").notNull(),
  status: transactionStatusEnum("status").notNull().default("initiated"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  senderUserId: uuid("sender_user_id").references(() => users.id),
  recipientUserId: uuid("recipient_user_id").references(() => users.id),
  sourceCurrency: currencyEnum("source_currency").notNull(),
  destCurrency: currencyEnum("dest_currency").notNull(),
  sourceAmountMinor: bigint("source_amount_minor", { mode: "number" }).notNull(),
  destAmountMinor: bigint("dest_amount_minor", { mode: "number" }).notNull(),
  fxRateUsed: numeric("fx_rate_used", { precision: 18, scale: 8 }),
  failureReason: text("failure_reason"),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  ...timestamps,
});

// Append-only: no updated_at, and a DB trigger (see migration) rejects UPDATE/DELETE.
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id),
    accountType: ledgerAccountTypeEnum("account_type").notNull(),
    walletId: uuid("wallet_id").references(() => wallets.id),
    systemAccountId: uuid("system_account_id").references(() => systemAccounts.id),
    direction: ledgerDirectionEnum("direction").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: currencyEnum("currency").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ledger_entries_transaction_idx").on(t.transactionId),
    index("ledger_entries_wallet_idx").on(t.walletId),
    check("ledger_entries_amount_positive", sql`${t.amountMinor} > 0`),
    check(
      "ledger_entries_account_ref",
      sql`(${t.accountType} = 'user_wallet' AND ${t.walletId} IS NOT NULL AND ${t.systemAccountId} IS NULL) OR (${t.accountType} = 'system' AND ${t.systemAccountId} IS NOT NULL AND ${t.walletId} IS NULL)`,
    ),
  ],
);

export const walletBalances = pgTable(
  "wallet_balances",
  {
    walletId: uuid("wallet_id")
      .primaryKey()
      .references(() => wallets.id),
    balanceMinor: bigint("balance_minor", { mode: "number" }).notNull().default(0),
    asOfEntryCreatedAt: timestamp("as_of_entry_created_at", { withTimezone: true }),
  },
  (t) => [check("wallet_balances_non_negative", sql`${t.balanceMinor} >= 0`)],
);

export const fxRates = pgTable(
  "fx_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    baseCurrency: currencyEnum("base_currency").notNull(),
    quoteCurrency: currencyEnum("quote_currency").notNull(),
    rate: numeric("rate", { precision: 18, scale: 8 }).notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [index("fx_rates_pair_valid_idx").on(t.baseCurrency, t.quoteCurrency, t.validFrom)],
);

export const idempotencyRecords = pgTable("idempotency_records", {
  key: text("key").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  requestHash: text("request_hash").notNull(),
  responseStatus: integer("response_status").notNull(),
  responseBody: jsonb("response_body").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
