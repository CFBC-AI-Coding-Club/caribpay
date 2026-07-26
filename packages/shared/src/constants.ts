export const SUPPORTED_CURRENCIES = ["XCD", "JMD", "BBD", "TTD", "USD"] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const CURRENCY_EXPONENTS: Record<Currency, number> = {
  XCD: 2,
  JMD: 2,
  BBD: 2,
  TTD: 2,
  USD: 2,
};

/** Display symbols, as shown throughout the CaribPay UI. */
export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  XCD: "EC$",
  JMD: "J$",
  BBD: "Bds$",
  TTD: "TT$",
  USD: "US$",
};

export const CURRENCY_NAMES: Record<Currency, string> = {
  XCD: "East Caribbean $",
  JMD: "Jamaican Dollar",
  BBD: "Barbadian Dollar",
  TTD: "Trinidad & Tobago $",
  USD: "US Dollar",
};

/** Countries with a designed flag. Used for wallet, contact, and profile chips. */
export const FLAG_COUNTRIES = ["KN", "JM", "BB", "TT", "VC", "US"] as const;
export type FlagCountry = (typeof FLAG_COUNTRIES)[number];

/**
 * Countries a user can register from, in picker order (alphabetical by name).
 * This is deliberately wider than FLAG_COUNTRIES: whether we have drawn a flag
 * is an asset question, and it must not decide who is allowed an account. Six of
 * these are XCD territories that render a lettered disc until their flag exists.
 */
export const SUPPORTED_COUNTRIES = [
  "AI",
  "AG",
  "BB",
  "DM",
  "GD",
  "JM",
  "MS",
  "KN",
  "LC",
  "VC",
  "TT",
  "US",
] as const;
export type SupportedCountry = (typeof SUPPORTED_COUNTRIES)[number];

export const COUNTRY_NAMES: Record<string, string> = {
  AG: "Antigua & Barbuda",
  AI: "Anguilla",
  BB: "Barbados",
  DM: "Dominica",
  GD: "Grenada",
  JM: "Jamaica",
  KN: "St. Kitts & Nevis",
  LC: "St. Lucia",
  MS: "Montserrat",
  TT: "Trinidad & Tobago",
  US: "United States",
  VC: "St. Vincent & the Grenadines",
};

/**
 * Representative country for a currency, for flag display when we only know the
 * currency (e.g. a wallet row). XCD spans eight territories — KN is the
 * prototype's home market, so it stands in for the zone.
 */
export const CURRENCY_TO_COUNTRY: Record<Currency, FlagCountry> = {
  XCD: "KN",
  JMD: "JM",
  BBD: "BB",
  TTD: "TT",
  USD: "US",
};

/** Narrow an arbitrary ISO code to one we have a flag for, falling back to the currency's. */
export function flagCountryFor(countryCode: string | null | undefined, currency: Currency): FlagCountry {
  const upper = (countryCode ?? "").toUpperCase();
  return (FLAG_COUNTRIES as readonly string[]).includes(upper)
    ? (upper as FlagCountry)
    : CURRENCY_TO_COUNTRY[currency];
}

export const TRANSACTION_TYPES = [
  "p2p_transfer",
  "deposit",
  "withdrawal",
  "fx_conversion",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_STATUSES = [
  "initiated",
  "pending_settlement",
  "settled",
  "failed",
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const KYC_STATUSES = ["unverified", "pending", "verified"] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];

/**
 * The switch's transfer lifecycle. A transfer is a conversation with two banks,
 * so the states track where that conversation has reached:
 *
 *   initiated → debit_pending → debit_held → credit_pending → completed
 *
 * and on failure, either `failed` (the hold was refused, nothing was posted and
 * nothing needs undoing) or `reversal_pending → reversed` (the hold exists and
 * must be released). Held funds sitting in someone's real bank account are the
 * worst state to be stuck in, so `reversal_pending` is retried to exhaustion.
 *
 * Declared here separately from TRANSACTION_STATUSES, which still describes the
 * wallet-era rows; the two are merged in the migration that adds these values.
 */
export const TRANSFER_LIFECYCLE_STATUSES = [
  "initiated",
  "debit_pending",
  "debit_held",
  "credit_pending",
  "completed",
  "failed",
  "reversal_pending",
  "reversed",
] as const;
export type TransferLifecycleStatus = (typeof TRANSFER_LIFECYCLE_STATUSES)[number];

/** States from which no further transition is possible. */
export const TERMINAL_TRANSFER_STATUSES = ["completed", "failed", "reversed"] as const;

export const DIRECTORY_KEY_TYPES = ["vpa", "phone", "email"] as const;
export type DirectoryKeyType = (typeof DIRECTORY_KEY_TYPES)[number];

/** UPI and Pix both cap the number of addresses one person may hold. */
export const MAX_ACTIVE_DIRECTORY_KEYS = 5;

/**
 * Whether a member institution can be registered against today. Only CaribPay
 * is `active`; every real bank is seeded `planned`, so nobody can claim
 * `someone@sknanb` and imply a relationship we do not have.
 */
export const PSP_STATUSES = ["active", "planned"] as const;
export type PspStatus = (typeof PSP_STATUSES)[number];

export const LINKED_ACCOUNT_STATUSES = ["active", "suspended", "closed"] as const;
export type LinkedAccountStatus = (typeof LINKED_ACCOUNT_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  "transfer_received",
  "transfer_failed",
  "transfer_reversed",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const COUNTRY_TO_CURRENCY: Record<string, Currency> = {
  // Eastern Caribbean dollar zone
  AG: "XCD",
  AI: "XCD",
  DM: "XCD",
  GD: "XCD",
  KN: "XCD",
  LC: "XCD",
  MS: "XCD",
  VC: "XCD",
  JM: "JMD",
  BB: "BBD",
  TT: "TTD",
};

export const FALLBACK_CURRENCY: Currency = "USD";

export function homeCurrencyFor(countryCode: string): Currency {
  return COUNTRY_TO_CURRENCY[countryCode.toUpperCase()] ?? FALLBACK_CURRENCY;
}

export const WALLET_ADDRESS_PATTERN = /^CW(-[A-Z0-9]{4}){4}$/;

export const FX_QUOTE_TTL_SECONDS = 60;
