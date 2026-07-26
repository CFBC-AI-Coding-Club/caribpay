import { describe, expect, test } from "bun:test";
import { shortReference } from "../src/reference";

describe("shortReference", () => {
  test("renders a transaction id as a grouped CP- reference", () => {
    expect(shortReference("7c104ccd-9f2b-4a1e-8d3f-2b6c1a0e5f47")).toMatch(
      /^CP-[0-9A-Z]{4}-[0-9A-Z]{4}$/,
    );
  });

  test("is deterministic, so support can recompute it from the id", () => {
    const id = "7c104ccd-9f2b-4a1e-8d3f-2b6c1a0e5f47";
    expect(shortReference(id)).toBe(shortReference(id));
  });

  test("ignores the dashes, so an unhyphenated id gives the same reference", () => {
    expect(shortReference("7c104ccd9f2b4a1e8d3f2b6c1a0e5f47")).toBe(
      shortReference("7c104ccd-9f2b-4a1e-8d3f-2b6c1a0e5f47"),
    );
  });

  test("distinguishes ids that differ inside the first 40 bits", () => {
    const a = shortReference("7c104ccd-9f2b-4a1e-8d3f-2b6c1a0e5f47");
    const b = shortReference("7c104cce-9f2b-4a1e-8d3f-2b6c1a0e5f47");
    expect(a).not.toBe(b);
  });

  test("never emits the letters that get misread down a phone line", () => {
    // Crockford base32: no I, L, O or U. A reference read aloud has to survive
    // the trip, and these are the four characters that reliably do not.
    for (let i = 0; i < 200; i++) {
      const id = i.toString(16).padStart(32, "f");
      expect(shortReference(id)).not.toMatch(/[ILOU]/);
    }
  });

  test("handles an id shorter than the slice it reads", () => {
    expect(shortReference("7c10")).toMatch(/^CP-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  });
});
