import { CURRENCY_EXPONENTS, CURRENCY_SYMBOLS, type Currency } from "./constants";

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

/** Insert thousands separators into a run of digits. Pure string work — no floats. */
function group(digits: string): string {
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ",";
    out += digits[i];
  }
  return out;
}

/**
 * Group a partially-typed decimal string as it is entered: "25000" → "25,000",
 * "25000.5" → "25,000.5", and a trailing "." is preserved so the separator does
 * not vanish mid-keystroke.
 *
 * The amount a payer is checking should read the same while typing as it will on
 * the review screen; an ungrouped figure is where an order-of-magnitude slip
 * hides.
 */
export function groupDigits(typed: string): string {
  const [whole = "", frac] = typed.split(".");
  const grouped = group(whole === "" ? "0" : whole);
  if (frac === undefined) return typed.endsWith(".") ? `${grouped}.` : grouped;
  return `${grouped}.${frac}`;
}

export interface FormatAmountOptions {
  /** Prefix the currency symbol (e.g. "EC$1,500.50"). Default true. */
  symbol?: boolean;
  /**
   * Sign handling. "auto" shows "-" only for negatives (default); "always"
   * shows an explicit "+"/"−" for credits and debits; "never" formats the
   * magnitude and leaves the caller to convey direction.
   */
  sign?: "auto" | "always" | "never";
}

/**
 * Format minor units the way the CaribPay UI shows money:
 * `formatAmount(482050, "XCD")` -> "EC$4,820.50".
 *
 * Deliberately avoids Intl: Hermes' Intl.NumberFormat cannot take an exact
 * decimal *string*, and routing money through a JS number would reintroduce
 * float error. Grouping is done on the digit string instead.
 */
export function formatAmount(
  amountMinor: number,
  currency: Currency,
  options: FormatAmountOptions = {},
): string {
  const { symbol = true, sign = "auto" } = options;
  const decimal = fromMinor(amountMinor, currency);
  const negative = decimal.startsWith("-");
  const [whole = "0", frac] = decimal.replace("-", "").split(".");

  let prefix = "";
  if (sign === "always") prefix = negative ? "−" : "+";
  else if (sign === "auto" && negative) prefix = "−";

  const body = group(whole) + (frac === undefined ? "" : `.${frac}`);
  return `${prefix}${symbol ? CURRENCY_SYMBOLS[currency] : ""}${body}`;
}

/**
 * Split an amount for the hero balance card, which renders the symbol and the
 * cents smaller than the dollars: "EC$" / "10,415" / ".60".
 */
export function splitAmount(
  amountMinor: number,
  currency: Currency,
): { symbol: string; whole: string; fraction: string } {
  const decimal = fromMinor(Math.abs(amountMinor), currency);
  const [whole = "0", frac] = decimal.split(".");
  return {
    symbol: CURRENCY_SYMBOLS[currency],
    whole: group(whole),
    fraction: frac === undefined ? "" : `.${frac}`,
  };
}

/**
 * Human-readable FX rate line, e.g. "1 EC$ = 57.78 J$". Rates arrive as 8-dp
 * decimal strings; we trim to `precision` significant decimals for display
 * without ever parsing them as floats.
 */
export function formatRate(rate: string, from: Currency, to: Currency, precision = 2): string {
  const [whole = "0", frac = ""] = rate.split(".");
  // A sub-unit rate (e.g. XCD->USD at 0.37) needs more decimals to stay useful.
  const digits = whole === "0" ? Math.max(precision, 4) : precision;
  // Pad rather than trim, so a pegged rate reads "2.70" and not "2.7".
  const shown = frac.slice(0, digits).padEnd(digits, "0");
  const value = digits === 0 ? group(whole) : `${group(whole)}.${shown}`;
  return `1 ${CURRENCY_SYMBOLS[from]} = ${value} ${CURRENCY_SYMBOLS[to]}`;
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
