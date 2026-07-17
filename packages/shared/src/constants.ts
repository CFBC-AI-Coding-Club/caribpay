export const SUPPORTED_CURRENCIES = ["XCD", "JMD", "BBD", "TTD", "USD"] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const CURRENCY_EXPONENTS: Record<Currency, number> = {
  XCD: 2,
  JMD: 2,
  BBD: 2,
  TTD: 2,
  USD: 2,
};

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
