import { CURRENCY_EXPONENTS, type Currency } from "./constants";

const AMOUNT_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;

/**
 * Parse a decimal amount (string or number) into integer minor units.
 * Digits beyond the currency's exponent are rounded half-up (away from zero).
 * Throws on malformed input or amounts outside the safe integer range.
 */
export function toMinor(amount: string | number, currency: Currency): number {
  const raw = typeof amount === "number" ? String(amount) : amount.trim();
  const match = AMOUNT_PATTERN.exec(raw);
  if (!match) {
    throw new RangeError(`Invalid money amount: "${raw}"`);
  }
  const sign = match[1] === "-" ? -1 : 1;
  const intPart = match[2] ?? "0";
  const fracPart = match[3] ?? "";
  const exponent = CURRENCY_EXPONENTS[currency];
  const scale = 10 ** exponent;

  const keptFrac = fracPart.slice(0, exponent).padEnd(exponent, "0");
  let minor = Number(intPart) * scale + (keptFrac === "" ? 0 : Number(keptFrac));
  const firstDroppedDigit = fracPart.charCodeAt(exponent);
  if (!Number.isNaN(firstDroppedDigit) && firstDroppedDigit >= 0x35 /* "5" */) {
    minor += 1;
  }
  minor *= sign;

  if (!Number.isSafeInteger(minor)) {
    throw new RangeError(`Money amount out of safe integer range: "${raw}"`);
  }
  return minor;
}

/** Convert integer minor units to an exact decimal string, e.g. 150050 -> "1500.50". */
export function fromMinor(amountMinor: number, currency: Currency): string {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new RangeError(`Minor amount must be a safe integer: ${amountMinor}`);
  }
  const exponent = CURRENCY_EXPONENTS[currency];
  const scale = 10 ** exponent;
  const sign = amountMinor < 0 ? "-" : "";
  const abs = Math.abs(amountMinor);
  const whole = Math.floor(abs / scale);
  if (exponent === 0) {
    return `${sign}${whole}`;
  }
  const frac = String(abs % scale).padStart(exponent, "0");
  return `${sign}${whole}.${frac}`;
}

const RATE_PATTERN = /^(\d+)(?:\.(\d+))?$/;

/**
 * Apply an FX rate (positive decimal string, e.g. "58.51851852") to an amount
 * in minor units, rounding half-up. Pure integer/BigInt math — no floats.
 */
export function applyRate(amountMinor: number, rate: string): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new RangeError(`Amount must be a non-negative safe integer: ${amountMinor}`);
  }
  const match = RATE_PATTERN.exec(rate);
  if (!match) {
    throw new RangeError(`Invalid rate: "${rate}"`);
  }
  const fracDigits = match[2] ?? "";
  const mantissa = BigInt((match[1] ?? "0") + fracDigits);
  if (mantissa === 0n) {
    throw new RangeError(`Rate must be positive: "${rate}"`);
  }
  const scale = 10n ** BigInt(fracDigits.length);
  const result = (BigInt(amountMinor) * mantissa + scale / 2n) / scale;
  const asNumber = Number(result);
  if (!Number.isSafeInteger(asNumber)) {
    throw new RangeError(`Converted amount out of safe integer range`);
  }
  return asNumber;
}

/** Format minor units for display, e.g. formatMoney(150050, "XCD") -> "XCD 1,500.50". */
export function formatMoney(
  amountMinor: number,
  currency: Currency,
  locale = "en-US",
): string {
  const exponent = CURRENCY_EXPONENTS[currency];
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  });
  // Intl accepts exact decimal strings, so no float ever touches the amount.
  return formatter.format(fromMinor(amountMinor, currency) as `${number}`);
}
