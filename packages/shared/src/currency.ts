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
