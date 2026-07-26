import {
  bigint,
  boolean,
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
  DIRECTORY_KEY_TYPES,
  KYC_STATUSES,
  LINKED_ACCOUNT_STATUSES,
  NOTIFICATION_TYPES,
  PSP_STATUSES,
  SUPPORTED_CURRENCIES,
  TRANSACTION_TYPES,
  TRANSFER_LIFECYCLE_STATUSES,
} from "@caribpay/shared";

export const currencyEnum = pgEnum("currency", SUPPORTED_CURRENCIES);
export const kycStatusEnum = pgEnum("kyc_status", KYC_STATUSES);
export const transactionTypeEnum = pgEnum("transaction_type", TRANSACTION_TYPES);
export const transactionStatusEnum = pgEnum("transaction_status", TRANSFER_LIFECYCLE_STATUSES);
export const ledgerDirectionEnum = pgEnum("ledger_direction", ["debit", "credit"]);
export const pspStatusEnum = pgEnum("psp_status", PSP_STATUSES);
export const directoryKeyTypeEnum = pgEnum("directory_key_type", DIRECTORY_KEY_TYPES);
export const linkedAccountStatusEnum = pgEnum("linked_account_status", LINKED_ACCOUNT_STATUSES);
export const notificationTypeEnum = pgEnum("notification_type", NOTIFICATION_TYPES);

/**
 * Clearing accounts. `bank_position` is one per member bank per currency and
 * records what that bank owes or is owed between settlement cycles;
 * `fx_liquidity` is the switch's own FX book; `settlement_clearing` is what a
 * netting cycle posts against to return positions to zero.
 *
 * There is no account type representing a customer here, because customer money
 * lives at the banks.
 */
export const systemAccountTypeEnum = pgEnum("system_account_type", [
  "fx_liquidity",
  "settlement_clearing",
  "fee_revenue",
  "bank_position",
]);

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

/**
 * Member institutions. One table serves both the suffix of a VPA and the
 * account-linking picker, because an institution is both.
 *
 * Every row is simulated; see `packages/shared/src/institutions-data.ts`.
 */
export const institutions = pgTable(
  "institutions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    legalName: text("legal_name").notNull(),
    displayName: text("display_name").notNull(),
    countryCode: char("country_code", { length: 2 }).notNull(),
    currency: currencyEnum("currency").notNull(),
    /** The `@handle` half of a VPA. Null until an institution is onboarded. */
    pspHandle: text("psp_handle").unique(),
    pspStatus: pspStatusEnum("psp_status").notNull().default("planned"),
    supportsAccountLinking: boolean("supports_account_linking").notNull().default(true),
    /** Always true this phase. On the row so no screen can forget to say it. */
    isSimulated: boolean("is_simulated").notNull().default(true),
    /** Handles someone would try in order to impersonate this institution. */
    reservedAliases: text("reserved_aliases").array().notNull().default(sql`'{}'::text[]`),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("institutions_country_idx").on(t.countryCode, t.sortOrder)],
);

/**
 * A bank account the user has linked. Verified through `BankConnector` at link
 * time; we keep the reference and nothing else.
 *
 * **No balance column, deliberately.** The switch does not hold customer money
 * and does not cache what the bank holds. Balances are read live, per request.
 * A test asserts this database contains no column matching `balance`.
 */
export const linkedAccounts = pgTable(
  "linked_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id),
    /** The identifier the bank knows this account by. */
    accountRef: text("account_ref").notNull(),
    accountNumberMasked: text("account_number_masked").notNull(),
    currency: currencyEnum("currency").notNull(),
    /** Masked holder name the bank returned when the link was verified. */
    holderNameVerified: text("holder_name_verified").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    status: linkedAccountStatusEnum("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("linked_accounts_institution_ref_uq").on(t.institutionId, t.accountRef),
    index("linked_accounts_user_idx").on(t.userId),
    uniqueIndex("linked_accounts_one_default_uq")
      .on(t.userId)
      .where(sql`${t.isDefault} AND ${t.status} = 'active'`),
  ],
);

/**
 * The directory: what a payer types, and the account it routes to.
 *
 * Uniqueness on `value_normalized` and `skeleton` is **global, not partial** —
 * released keys keep their names forever. In an instant, irreversible system a
 * recycled handle means money reaching a stranger, so a handle is spent once.
 * (This is a deliberate departure from the plan's partial-index sketch, which
 * would have permitted recycling.)
 *
 * `skeleton` is null for phone and email keys: confusable-collapsing is only
 * meaningful for a chosen handle, and Postgres treats nulls as distinct.
 */
export const directoryKeys = pgTable(
  "directory_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    type: directoryKeyTypeEnum("type").notNull(),
    /** Exactly as the user typed it, for display. */
    valueRaw: text("value_raw").notNull(),
    valueNormalized: text("value_normalized").notNull().unique(),
    skeleton: text("skeleton").unique(),
    /** The PSP whose suffix this key carries. Null for phone and email. */
    institutionId: uuid("institution_id").references(() => institutions.id),
    /** Null routes to the user's default account, as UPI does. */
    linkedAccountId: uuid("linked_account_id").references(() => linkedAccounts.id),
    isPrimary: boolean("is_primary").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    /** TODO(prod): a real OTP, delivered. The prototype auto-approves. */
    verificationCode: text("verification_code"),
    verificationExpiresAt: timestamp("verification_expires_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("directory_keys_user_idx").on(t.userId),
    uniqueIndex("directory_keys_one_primary_uq")
      .on(t.userId)
      .where(sql`${t.isPrimary} AND ${t.releasedAt} IS NULL`),
  ],
);

/**
 * Clearing accounts. A `bank_position` row carries the institution it belongs to
 * and the cap on how far that bank may go into debit before the switch declines
 * — the honest answer to who carries intraday risk between an instant credit
 * and a netted settlement.
 */
export const systemAccounts = pgTable(
  "system_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: systemAccountTypeEnum("type").notNull(),
    currency: currencyEnum("currency").notNull(),
    institutionId: uuid("institution_id").references(() => institutions.id),
    /** Only meaningful for `bank_position`. Null means uncapped. */
    debitCapMinor: bigint("debit_cap_minor", { mode: "number" }),
    ...timestamps,
  },
  // Two partial indexes rather than one over a nullable column: Postgres treats
  // nulls as distinct, so a plain unique index would happily allow two
  // fx_liquidity:XCD rows.
  (t) => [
    uniqueIndex("system_accounts_global_type_currency_uq")
      .on(t.type, t.currency)
      .where(sql`${t.institutionId} IS NULL`),
    uniqueIndex("system_accounts_bank_position_uq")
      .on(t.type, t.currency, t.institutionId)
      .where(sql`${t.institutionId} IS NOT NULL`),
  ],
);

/**
 * One logical money movement. In the switch model a transfer is a conversation
 * with two banks, so the row also carries the references those banks handed
 * back — the hold, the debit, the credit — which is what lets the recovery
 * sweeper re-drive an abandoned transfer.
 */
export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: transactionTypeEnum("type").notNull(),
    status: transactionStatusEnum("status").notNull().default("initiated"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    senderUserId: uuid("sender_user_id").references(() => users.id),
    recipientUserId: uuid("recipient_user_id").references(() => users.id),
    payerAccountId: uuid("payer_account_id").references(() => linkedAccounts.id),
    payeeAccountId: uuid("payee_account_id").references(() => linkedAccounts.id),
    sourceCurrency: currencyEnum("source_currency").notNull(),
    destCurrency: currencyEnum("dest_currency").notNull(),
    sourceAmountMinor: bigint("source_amount_minor", { mode: "number" }).notNull(),
    destAmountMinor: bigint("dest_amount_minor", { mode: "number" }).notNull(),
    fxRateUsed: numeric("fx_rate_used", { precision: 18, scale: 8 }),
    note: text("note"),
    /**
     * What the payer actually typed, and the name shown at confirmation. A
     * receipt from March must still read correctly after someone changes their
     * handle, so these are snapshots and never joins.
     */
    recipientKeyUsed: text("recipient_key_used"),
    recipientNameSnapshot: text("recipient_name_snapshot"),
    holdRef: text("hold_ref"),
    debitRef: text("debit_ref"),
    creditRef: text("credit_ref"),
    /** Past this, the recovery sweeper takes over. */
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("transactions_sender_idx").on(t.senderUserId, t.createdAt),
    index("transactions_recipient_idx").on(t.recipientUserId, t.createdAt),
    index("transactions_status_deadline_idx").on(t.status, t.deadlineAt),
  ],
);

/**
 * The clearing ledger. Append-only — a DB trigger rejects UPDATE and DELETE.
 *
 * Every entry is now a system-account entry: with no customer balances there is
 * no second kind of account, so the `user_wallet | system` discriminator, the
 * nullable `wallet_id`, and the two-branch check constraint are all gone.
 */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id),
    systemAccountId: uuid("system_account_id")
      .notNull()
      .references(() => systemAccounts.id),
    direction: ledgerDirectionEnum("direction").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: currencyEnum("currency").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ledger_entries_transaction_idx").on(t.transactionId),
    index("ledger_entries_account_idx").on(t.systemAccountId),
    check("ledger_entries_amount_positive", sql`${t.amountMinor} > 0`),
  ],
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

/**
 * Replayed responses for money-moving endpoints.
 *
 * `response_status` is nullable because the row is claimed *before* the handler
 * runs: reading for an existing record and then acting is a check-then-act race
 * that lets concurrent retries all execute. The identical bug in the mock bank
 * placed three holds for ten concurrent retries of one instruction.
 */
export const idempotencyRecords = pgTable("idempotency_records", {
  key: text("key").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  requestHash: text("request_hash").notNull(),
  responseStatus: integer("response_status"),
  responseBody: jsonb("response_body"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Quick contacts. Keyed on the counterparty's user id, which is durable, and
 * carrying the key the user saved for the receipt trail — the *current* address
 * is resolved from the directory on read, so a contact survives its owner
 * changing their handle.
 */
export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id),
    contactUserId: uuid("contact_user_id")
      .notNull()
      .references(() => users.id),
    savedKey: text("saved_key").notNull(),
    displayName: text("display_name").notNull(),
    pinned: boolean("pinned").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("contacts_owner_contact_uq").on(t.ownerUserId, t.contactUserId)],
);

/**
 * What the recipient needs to know.
 *
 * The row is written inside the same DB transaction as the status flip it
 * describes, so if the money moved the notification exists. There is no
 * best-effort second write to lose.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    type: notificationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    data: jsonb("data").notNull().default(sql`'{}'::jsonb`),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_user_created_idx").on(t.userId, t.createdAt),
    index("notifications_unread_idx").on(t.userId).where(sql`${t.readAt} IS NULL`),
  ],
);

/**
 * A net settlement run.
 *
 * The credit to a payee is instant and irrevocable; settlement between the banks
 * is deferred and netted. One instruction replaces every transfer in the window,
 * which is the whole economic argument for a switch.
 */
export const settlementCycles = pgTable("settlement_cycles", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** The clearing transaction whose entries returned positions to zero. */
  transactionId: uuid("transaction_id").references(() => transactions.id),
  transferCount: integer("transfer_count").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

/** One bank's net obligation in one currency for one cycle. */
export const settlementCycleEntries = pgTable(
  "settlement_cycle_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => settlementCycles.id),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id),
    currency: currencyEnum("currency").notNull(),
    /** Negative means the bank owes the network; positive means it is owed. */
    netPositionMinor: bigint("net_position_minor", { mode: "number" }).notNull(),
    grossInMinor: bigint("gross_in_minor", { mode: "number" }).notNull().default(0),
    grossOutMinor: bigint("gross_out_minor", { mode: "number" }).notNull().default(0),
  },
  (t) => [uniqueIndex("settlement_entries_cycle_inst_ccy_uq").on(t.cycleId, t.institutionId, t.currency)],
);
