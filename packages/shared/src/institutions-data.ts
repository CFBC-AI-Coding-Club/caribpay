/**
 * The member institutions CaribPay models.
 *
 * ⚠️  EVERY INSTITUTION HERE IS SIMULATED. These are real, named financial
 * institutions and we have **no relationship with any of them**. Nothing in this
 * repository connects to a real bank.
 *
 * The app deliberately carries no in-app disclaimer — it was repeated on five
 * screens and read as a defect rather than a disclosure. The obligation moved to
 * the people presenting: say it out loud, and see the note at the top of
 * `DEMO.md`.
 *
 * Only `caribpay` is an active PSP — the only suffix a user can register a VPA
 * against. Every bank is `planned`, which is what makes the multi-PSP
 * architecture demonstrable without implying an onboarding that has not happened.
 *
 * This list lives in `packages/shared` rather than either service's seed folder
 * because both `apps/api` and `apps/mock-bank` seed from it, and it must be a
 * one-file change as we verify each market.
 *
 * `reservedAliases` is hand-curated: the handles someone would plausibly try in
 * order to impersonate the institution. It is not a list of every substring —
 * matching is exact on skeletons, so over-listing only denies real names.
 */
import type { Currency } from "./constants";
import type { PspStatus } from "./constants";

export interface InstitutionSeed {
  legalName: string;
  displayName: string;
  countryCode: string;
  currency: Currency;
  pspHandle: string;
  pspStatus: PspStatus;
  supportsAccountLinking: boolean;
  reservedAliases: readonly string[];
}

export const INSTITUTION_SEEDS: readonly InstitutionSeed[] = [
  {
    legalName: "CaribPay Regional Payments Ltd",
    displayName: "CaribPay",
    countryCode: "KN",
    currency: "XCD",
    pspHandle: "caribpay",
    pspStatus: "active",
    // The switch itself is not a bank; you cannot hold an account here.
    supportsAccountLinking: false,
    reservedAliases: ["caribbeanpay", "carib"],
  },

  // ── St. Kitts and Nevis · XCD ──────────────────────────────────────────────
  {
    legalName: "St. Kitts-Nevis-Anguilla National Bank Ltd",
    displayName: "St. Kitts-Nevis-Anguilla National Bank",
    countryCode: "KN",
    currency: "XCD",
    pspHandle: "sknanb",
    pspStatus: "planned",
    supportsAccountLinking: true,
    reservedAliases: ["nationalbank", "sknanationalbank", "sknab"],
  },
  {
    legalName: "The Bank of Nevis Ltd",
    displayName: "Bank of Nevis",
    countryCode: "KN",
    currency: "XCD",
    pspHandle: "bon",
    pspStatus: "planned",
    supportsAccountLinking: true,
    reservedAliases: ["bankofnevis", "nevisbank"],
  },
  {
    legalName: "Republic Bank (EC) Ltd",
    displayName: "Republic Bank (EC)",
    countryCode: "KN",
    currency: "XCD",
    pspHandle: "republicec",
    pspStatus: "planned",
    supportsAccountLinking: true,
    reservedAliases: ["republic", "republicbank"],
  },
  {
    legalName: "CIBC Caribbean (St. Kitts)",
    displayName: "CIBC Caribbean (St. Kitts)",
    countryCode: "KN",
    currency: "XCD",
    pspHandle: "cibckn",
    pspStatus: "planned",
    supportsAccountLinking: true,
    reservedAliases: ["cibc", "cibccaribbean", "firstcaribbean"],
  },
  {
    legalName: "St. Kitts Co-operative Credit Union Ltd",
    displayName: "St. Kitts Co-operative Credit Union",
    countryCode: "KN",
    currency: "XCD",
    pspHandle: "skccu",
    pspStatus: "planned",
    supportsAccountLinking: true,
    reservedAliases: ["stkittscreditunion", "creditunion"],
  },
  {
    legalName: "Nevis Co-operative Credit Union Ltd",
    displayName: "Nevis Co-operative Credit Union",
    countryCode: "KN",
    currency: "XCD",
    pspHandle: "nccu",
    pspStatus: "planned",
    supportsAccountLinking: true,
    reservedAliases: ["neviscreditunion"],
  },

  // ── Jamaica · JMD ──────────────────────────────────────────────────────────
  {
    legalName: "National Commercial Bank Jamaica Ltd",
    displayName: "National Commercial Bank Jamaica",
    countryCode: "JM",
    currency: "JMD",
    pspHandle: "ncb",
    pspStatus: "planned",
    supportsAccountLinking: true,
    reservedAliases: ["ncbjamaica", "ncbja", "nationalcommercial"],
  },
  {
    legalName: "Sagicor Bank Jamaica Ltd",
    displayName: "Sagicor Bank Jamaica",
    countryCode: "JM",
    currency: "JMD",
    pspHandle: "sagicor",
    pspStatus: "planned",
    supportsAccountLinking: true,
    reservedAliases: ["sagicorbank"],
  },
  {
    legalName: "JN Bank Ltd",
    displayName: "JN Bank",
    countryCode: "JM",
    currency: "JMD",
    pspHandle: "jn",
    pspStatus: "planned",
    supportsAccountLinking: true,
    reservedAliases: ["jnbank", "jamaicanational"],
  },
  {
    legalName: "Scotiabank Jamaica Ltd",
    displayName: "Scotiabank Jamaica",
    countryCode: "JM",
    currency: "JMD",
    pspHandle: "scotiajm",
    pspStatus: "planned",
    supportsAccountLinking: true,
    reservedAliases: ["scotiabank", "scotia", "novascotia"],
  },
  {
    legalName: "First Global Bank Ltd",
    displayName: "First Global Bank",
    countryCode: "JM",
    currency: "JMD",
    pspHandle: "fgb",
    pspStatus: "planned",
    supportsAccountLinking: true,
    reservedAliases: ["firstglobal", "firstglobalbank"],
  },
  {
    legalName: "CIBC Caribbean (Jamaica)",
    displayName: "CIBC Caribbean (Jamaica)",
    countryCode: "JM",
    currency: "JMD",
    pspHandle: "cibcjm",
    pspStatus: "planned",
    supportsAccountLinking: true,
    reservedAliases: [],
  },

  // ── Barbados · BBD ─────────────────────────────────────────────────────────
  {
    legalName: "Republic Bank (Barbados) Ltd",
    displayName: "Republic Bank (Barbados)",
    countryCode: "BB",
    currency: "BBD",
    pspHandle: "republicbb",
    pspStatus: "planned",
    supportsAccountLinking: true,
    reservedAliases: [],
  },
  {
    legalName: "CIBC Caribbean (Barbados)",
    displayName: "CIBC Caribbean (Barbados)",
    countryCode: "BB",
    currency: "BBD",
    pspHandle: "cibcbb",
    pspStatus: "planned",
    supportsAccountLinking: true,
    reservedAliases: [],
  },
  {
    legalName: "Scotiabank Barbados Ltd",
    displayName: "Scotiabank Barbados",
    countryCode: "BB",
    currency: "BBD",
    pspHandle: "scotiabb",
    pspStatus: "planned",
    supportsAccountLinking: true,
    reservedAliases: [],
  },
  {
    legalName: "First Citizens Bank (Barbados) Ltd",
    displayName: "First Citizens Bank (Barbados)",
    countryCode: "BB",
    currency: "BBD",
    pspHandle: "fcbbb",
    pspStatus: "planned",
    supportsAccountLinking: true,
    reservedAliases: [],
  },

  // ── Trinidad and Tobago · TTD ──────────────────────────────────────────────
  {
    legalName: "Republic Bank Ltd",
    displayName: "Republic Bank",
    countryCode: "TT",
    currency: "TTD",
    pspHandle: "republictt",
    pspStatus: "planned",
    supportsAccountLinking: true,
    reservedAliases: [],
  },
  {
    legalName: "First Citizens Bank Ltd",
    displayName: "First Citizens Bank",
    countryCode: "TT",
    currency: "TTD",
    pspHandle: "fcb",
    pspStatus: "planned",
    supportsAccountLinking: true,
    reservedAliases: ["firstcitizens", "firstcitizensbank"],
  },
  {
    legalName: "Scotiabank Trinidad and Tobago Ltd",
    displayName: "Scotiabank Trinidad and Tobago",
    countryCode: "TT",
    currency: "TTD",
    pspHandle: "scotiatt",
    pspStatus: "planned",
    supportsAccountLinking: true,
    reservedAliases: [],
  },
  {
    legalName: "RBC Royal Bank (Trinidad and Tobago) Ltd",
    displayName: "RBC Royal Bank (Trinidad and Tobago)",
    countryCode: "TT",
    currency: "TTD",
    pspHandle: "rbc",
    pspStatus: "planned",
    supportsAccountLinking: true,
    reservedAliases: ["royalbank", "rbcroyalbank"],
  },
  {
    legalName: "JMMB Bank (T&T) Ltd",
    displayName: "JMMB Bank (T&T)",
    countryCode: "TT",
    currency: "TTD",
    pspHandle: "jmmb",
    pspStatus: "planned",
    supportsAccountLinking: true,
    reservedAliases: ["jmmbbank"],
  },
] as const;

/** Institutions a user can hold an account at, in picker order. */
export const LINKABLE_INSTITUTION_SEEDS = INSTITUTION_SEEDS.filter(
  (institution) => institution.supportsAccountLinking,
);

export function institutionSeedByHandle(handle: string): InstitutionSeed | undefined {
  return INSTITUTION_SEEDS.find((institution) => institution.pspHandle === handle);
}
