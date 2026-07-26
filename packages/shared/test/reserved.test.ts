import { describe, expect, test } from "bun:test";
import { BASE_RESERVED_LOCAL_PARTS, buildReservedSkeletons, isReservedLocalPart } from "../src/reserved";
import { vpaSkeleton } from "../src/vpa";

const INSTITUTIONS = [
  {
    displayName: "Republic Bank (EC) Ltd",
    pspHandle: "republicec",
    reservedAliases: ["republic", "republicbank"],
  },
  {
    displayName: "National Commercial Bank Jamaica",
    pspHandle: "ncb",
    reservedAliases: ["ncbjamaica", "ncbja"],
  },
  {
    displayName: "Scotiabank Jamaica",
    pspHandle: "scotiajm",
    reservedAliases: ["scotiabank", "scotia"],
  },
  { displayName: "CaribPay", pspHandle: "caribpay", reservedAliases: [] },
];

const reserved = buildReservedSkeletons(INSTITUTIONS);

describe("buildReservedSkeletons", () => {
  test("reserves every PSP handle", () => {
    for (const institution of INSTITUTIONS) {
      expect(reserved.has(vpaSkeleton(institution.pspHandle))).toBe(true);
    }
  });

  test("reserves the display name with separators stripped", () => {
    expect(reserved.has(vpaSkeleton("republicbankecltd"))).toBe(true);
    expect(reserved.has(vpaSkeleton("nationalcommercialbankjamaica"))).toBe(true);
  });

  test("reserves each hand-curated alias", () => {
    expect(reserved.has(vpaSkeleton("scotiabank"))).toBe(true);
    expect(reserved.has(vpaSkeleton("ncbjamaica"))).toBe(true);
  });

  test("includes the base list", () => {
    for (const word of BASE_RESERVED_LOCAL_PARTS) {
      expect(reserved.has(vpaSkeleton(word))).toBe(true);
    }
  });
});

describe("isReservedLocalPart", () => {
  test("blocks an exact institution handle", () => {
    expect(isReservedLocalPart("ncb", reserved)).toBe(true);
    expect(isReservedLocalPart("caribpay", reserved)).toBe(true);
  });

  test("blocks a curated alias", () => {
    expect(isReservedLocalPart("scotiabank", reserved)).toBe(true);
  });

  test("blocks confusable spellings of a reserved word", () => {
    // The registration guard: skeletons, not literals.
    expect(isReservedLocalPart("repub1ic", reserved)).toBe(true);
    expect(isReservedLocalPart("sc0tiabank", reserved)).toBe(true);
    expect(isReservedLocalPart("n-c-b", reserved)).toBe(true);
    expect(isReservedLocalPart("c-a-r-i-b-p-a-y", reserved)).toBe(true);
  });

  test("blocks support and governance terms from the base list", () => {
    expect(isReservedLocalPart("support", reserved)).toBe(true);
    expect(isReservedLocalPart("admin", reserved)).toBe(true);
    expect(isReservedLocalPart("eccb", reserved)).toBe(true);
    expect(isReservedLocalPart("official", reserved)).toBe(true);
  });

  test("matches exactly, so ordinary handles containing a reserved word are allowed", () => {
    // "exact matches only" — we are not blocking substrings, which would deny
    // a great many legitimate names.
    expect(isReservedLocalPart("ncbryan", reserved)).toBe(false);
    expect(isReservedLocalPart("helpful.amara", reserved)).toBe(false);
    expect(isReservedLocalPart("republica", reserved)).toBe(false);
  });

  test("allows ordinary personal handles", () => {
    expect(isReservedLocalPart("fraimer", reserved)).toBe(false);
    expect(isReservedLocalPart("amara.liburd", reserved)).toBe(false);
    expect(isReservedLocalPart("devon-c", reserved)).toBe(false);
  });
});
