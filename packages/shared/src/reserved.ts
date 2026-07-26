/**
 * Handles nobody may register as a personal VPA.
 *
 * Matching is **exact, on skeletons** — `vpaSkeleton(candidate)` against a set of
 * reserved skeletons. Substring matching was considered and rejected: it would
 * deny `ncbryan` and `helpful.amara`, which are ordinary names, to no benefit.
 * Impersonation needs the whole handle to be convincing.
 */
import { vpaSkeleton } from "./vpa";

/** Institution fields this module needs. Real data lives in the API's seed file. */
export interface ReservableInstitution {
  displayName: string;
  pspHandle: string | null;
  /** Hand-curated: the names people would actually try, not every substring. */
  reservedAliases: readonly string[];
}

/**
 * Our own names, support impersonation, and regional financial governance.
 * Institution names come from the seed and are not repeated here.
 */
export const BASE_RESERVED_LOCAL_PARTS = [
  // The product itself
  "caribpay",
  "caribpayofficial",
  "caribpaysupport",
  // Support impersonation — the classic attack on a directory of this shape
  "support",
  "helpdesk",
  "help",
  "admin",
  "administrator",
  "root",
  "system",
  "security",
  "billing",
  "payments",
  "refund",
  "refunds",
  "verify",
  "verification",
  "official",
  "noreply",
  "postmaster",
  "abuse",
  // Regional financial governance
  "eccb",
  "centralbank",
  "government",
  "treasury",
  "customs",
  "inlandrevenue",
  "canto",
] as const;

/**
 * Every skeleton that may not be registered: the base list, plus each
 * institution's handle, its display name with separators stripped, and its
 * curated aliases.
 */
export function buildReservedSkeletons(
  institutions: readonly ReservableInstitution[],
): ReadonlySet<string> {
  const skeletons = new Set<string>();
  const add = (value: string) => {
    const skeleton = vpaSkeleton(value);
    if (skeleton !== "") skeletons.add(skeleton);
  };

  for (const word of BASE_RESERVED_LOCAL_PARTS) add(word);

  for (const institution of institutions) {
    if (institution.pspHandle !== null) add(institution.pspHandle);
    // "Republic Bank (EC) Ltd" -> "republicbankecltd"
    add(institution.displayName.replace(/[^\p{L}\p{N}]/gu, ""));
    for (const alias of institution.reservedAliases) add(alias);
  }

  return skeletons;
}

export function isReservedLocalPart(
  local: string,
  reservedSkeletons: ReadonlySet<string>,
): boolean {
  return reservedSkeletons.has(vpaSkeleton(local));
}
