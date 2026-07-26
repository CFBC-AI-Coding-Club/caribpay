import { describe, expect, test } from "bun:test";
import { BANK_STEPS, bankStepKey } from "../src/idempotency";

const TX = "7f1c9a2e-4b6d-4f0a-9c3e-1d2b8a5f6e01";

describe("bankStepKey", () => {
  test("is derived only from the transaction and the step", () => {
    expect(bankStepKey(TX, "hold")).toBe(`${TX}:hold`);
    expect(bankStepKey(TX, "credit")).toBe(`${TX}:credit`);
  });

  test("is stable across calls — the property the whole design rests on", () => {
    // A retry after a timeout must reuse the key, or the bank sees a second
    // instruction and the payer is debited twice.
    const attempts = Array.from({ length: 100 }, () => bankStepKey(TX, "hold"));
    expect(new Set(attempts).size).toBe(1);
  });

  test("separates the steps of one transfer", () => {
    const keys = BANK_STEPS.map((step) => bankStepKey(TX, step));
    expect(new Set(keys).size).toBe(BANK_STEPS.length);
  });

  test("separates two transfers taking the same step", () => {
    const other = "0a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d";
    expect(bankStepKey(TX, "hold")).not.toBe(bankStepKey(other, "hold"));
  });

  test("rejects a transaction id that is not a uuid", () => {
    // A caller passing something unstable (a Date, a random string) would
    // silently reintroduce non-determinism, so refuse it loudly.
    expect(() => bankStepKey("", "hold")).toThrow();
    expect(() => bankStepKey("not-a-uuid", "hold")).toThrow();
  });
});
