import { describe, expect, test } from "bun:test";
import {
  isValidVpaLocalPart,
  maskName,
  normalizeE164,
  normalizeVpa,
  parseDirectoryKey,
  splitVpa,
  vpaSkeleton,
} from "../src/vpa";

describe("normalizeVpa", () => {
  test("lowercases and trims", () => {
    expect(normalizeVpa("  Fraimer@CaribPay ")).toBe("fraimer@caribpay");
  });

  test("NFKC-normalises so lookalike unicode forms collapse", () => {
    // Fullwidth latin letters normalise to plain ASCII under NFKC.
    expect(normalizeVpa("ｆｒａｉｍｅｒ@caribpay")).toBe("fraimer@caribpay");
  });

  test("leaves an already-normal address unchanged", () => {
    expect(normalizeVpa("fraimer@caribpay")).toBe("fraimer@caribpay");
  });
});

describe("splitVpa", () => {
  test("splits on the last @", () => {
    expect(splitVpa("fraimer@caribpay")).toEqual({ local: "fraimer", psp: "caribpay" });
  });

  test("returns null when there is no suffix", () => {
    expect(splitVpa("fraimer")).toBeNull();
    expect(splitVpa("fraimer@")).toBeNull();
    expect(splitVpa("@caribpay")).toBeNull();
  });
});

describe("isValidVpaLocalPart", () => {
  test("accepts the documented charset", () => {
    expect(isValidVpaLocalPart("fraimer")).toBe(true);
    expect(isValidVpaLocalPart("amara.liburd")).toBe(true);
    expect(isValidVpaLocalPart("devon-c")).toBe(true);
    expect(isValidVpaLocalPart("ravi_m2")).toBe(true);
  });

  test("requires 3 to 20 characters", () => {
    expect(isValidVpaLocalPart("ab")).toBe(false);
    expect(isValidVpaLocalPart("abc")).toBe(true);
    expect(isValidVpaLocalPart("a".repeat(20))).toBe(true);
    expect(isValidVpaLocalPart("a".repeat(21))).toBe(false);
  });

  test("must start with a letter, which also rules out all-numeric handles", () => {
    expect(isValidVpaLocalPart("1fraimer")).toBe(false);
    expect(isValidVpaLocalPart("18697654321")).toBe(false);
    expect(isValidVpaLocalPart(".fraimer")).toBe(false);
    expect(isValidVpaLocalPart("-fraimer")).toBe(false);
  });

  test("rejects consecutive dots and a trailing dot", () => {
    expect(isValidVpaLocalPart("frai..mer")).toBe(false);
    expect(isValidVpaLocalPart("fraimer.")).toBe(false);
    expect(isValidVpaLocalPart("frai.mer")).toBe(true);
  });

  test("rejects characters outside the charset", () => {
    expect(isValidVpaLocalPart("fraimer!")).toBe(false);
    expect(isValidVpaLocalPart("fra imer")).toBe(false);
    expect(isValidVpaLocalPart("fraimer@x")).toBe(false);
    expect(isValidVpaLocalPart("fraïmer")).toBe(false);
  });
});

describe("vpaSkeleton", () => {
  test("collapses the documented confusables", () => {
    expect(vpaSkeleton("0")).toBe("o");
    expect(vpaSkeleton("1")).toBe("i");
    expect(vpaSkeleton("l")).toBe("i");
    expect(vpaSkeleton("5")).toBe("s");
  });

  test("collapses rn to m", () => {
    expect(vpaSkeleton("rn")).toBe("m");
    expect(vpaSkeleton("burn")).toBe("bum");
  });

  test("strips separators so punctuation cannot disguise a handle", () => {
    expect(vpaSkeleton("f.r-a_i.m.e.r")).toBe("fraimer");
  });

  test("is case-insensitive", () => {
    expect(vpaSkeleton("FRAIMER")).toBe(vpaSkeleton("fraimer"));
  });

  test("the confusable pairs we actually care about collide", () => {
    // The registration guard this whole mechanism exists for.
    expect(vpaSkeleton("fra1mer")).toBe(vpaSkeleton("fraimer"));
    expect(vpaSkeleton("repub1ic")).toBe(vpaSkeleton("republic"));
    expect(vpaSkeleton("scotiabank")).toBe(vpaSkeleton("sc0tiabank"));
    expect(vpaSkeleton("n-c-b")).toBe(vpaSkeleton("ncb"));
  });

  test("does not collapse unrelated handles into each other", () => {
    expect(vpaSkeleton("amara")).not.toBe(vpaSkeleton("devon"));
    expect(vpaSkeleton("ncb")).not.toBe(vpaSkeleton("jn"));
  });

  test("is idempotent", () => {
    const once = vpaSkeleton("fra1mer.d");
    expect(vpaSkeleton(once)).toBe(once);
  });
});

describe("parseDirectoryKey", () => {
  test("a dotless suffix is a VPA", () => {
    expect(parseDirectoryKey("fraimer@caribpay")).toEqual({
      type: "vpa",
      value: "fraimer@caribpay",
    });
  });

  test("a suffix containing a dot is an email", () => {
    expect(parseDirectoryKey("Fraimer@Gmail.com")).toEqual({
      type: "email",
      value: "fraimer@gmail.com",
    });
  });

  test("a leading + is a phone number, normalised to E.164", () => {
    expect(parseDirectoryKey("+1 (869) 765-4321")).toEqual({
      type: "phone",
      value: "+18697654321",
    });
  });

  test("rejects anything it cannot classify", () => {
    expect(parseDirectoryKey("fraimer")).toBeNull();
    expect(parseDirectoryKey("")).toBeNull();
    expect(parseDirectoryKey("   ")).toBeNull();
    expect(parseDirectoryKey("+123")).toBeNull();
  });

  test("rejects a VPA whose local part is not registrable", () => {
    expect(parseDirectoryKey("ab@caribpay")).toBeNull();
    expect(parseDirectoryKey("18697654321@caribpay")).toBeNull();
  });
});

describe("normalizeE164", () => {
  test("strips formatting", () => {
    expect(normalizeE164("+1 (869) 765-4321")).toBe("+18697654321");
    expect(normalizeE164("+1.876.555.0123")).toBe("+18765550123");
  });

  test("requires an explicit country code", () => {
    // We deliberately do not guess: +1 spans eight of our twelve countries by
    // area code, so a bare national number is ambiguous.
    expect(normalizeE164("8697654321")).toBeNull();
  });

  test("enforces the E.164 length bounds", () => {
    expect(normalizeE164("+1234567")).toBeNull();
    expect(normalizeE164("+" + "1".repeat(16))).toBeNull();
    expect(normalizeE164("+" + "1".repeat(15))).toBe("+" + "1".repeat(15));
  });

  test("rejects a leading zero after the plus", () => {
    expect(normalizeE164("+0123456789")).toBeNull();
  });
});

describe("maskName", () => {
  test("keeps the first name and initialises the last", () => {
    expect(maskName("Fraimer De La Cruz")).toBe("Fraimer C.");
    expect(maskName("Amara Liburd")).toBe("Amara L.");
  });

  test("returns a single-word name unchanged", () => {
    expect(maskName("Amara")).toBe("Amara");
  });

  test("collapses whitespace", () => {
    expect(maskName("  Devon   Campbell  ")).toBe("Devon C.");
  });

  test("is idempotent, so a masked name never gets masked twice", () => {
    expect(maskName("Devon C.")).toBe("Devon C.");
  });

  test("handles non-ASCII initials", () => {
    expect(maskName("Éloise Ölafur")).toBe("Éloise Ö.");
  });

  test("degrades safely on empty input", () => {
    expect(maskName("")).toBe("");
    expect(maskName("   ")).toBe("");
  });
});
