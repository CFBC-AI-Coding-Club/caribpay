import { and, count, eq, isNull, sql } from "drizzle-orm";
import {
  MAX_ACTIVE_DIRECTORY_KEYS,
  buildReservedSkeletons,
  isReservedLocalPart,
  isValidVpaLocalPart,
  maskName,
  normalizeE164,
  normalizeVpa,
  parseDirectoryKey,
  splitVpa,
  vpaSkeleton,
  type AvailabilityResponse,
  type DirectoryKey,
  type ResolveResponse,
} from "@caribpay/shared";
import type { DbHandle } from "../db/client";
import { directoryKeys, institutions, linkedAccounts, users } from "../db/schema";
import { ApiError } from "../lib/errors";
import { isUniqueViolation } from "../lib/pg-errors";

type KeyRow = typeof directoryKeys.$inferSelect;

export function toPublicKey(row: KeyRow): DirectoryKey {
  return {
    id: row.id,
    type: row.type,
    value: row.valueNormalized,
    isPrimary: row.isPrimary,
    verifiedAt: row.verifiedAt === null ? null : row.verifiedAt.toISOString(),
    linkedAccountId: row.linkedAccountId,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Skeletons nobody may register, rebuilt from the institutions table.
 *
 * Cached for the process lifetime: the institution list changes only when we
 * deploy a new seed, and rebuilding it per keystroke of an availability check
 * would be a query per character typed.
 */
let reservedCache: ReadonlySet<string> | null = null;

export async function reservedSkeletons(dbh: DbHandle): Promise<ReadonlySet<string>> {
  if (reservedCache !== null) return reservedCache;
  const rows = await dbh
    .select({
      displayName: institutions.displayName,
      pspHandle: institutions.pspHandle,
      reservedAliases: institutions.reservedAliases,
    })
    .from(institutions);
  reservedCache = buildReservedSkeletons(rows);
  return reservedCache;
}

/** Tests reseed institutions between cases, so the cache has to be droppable. */
export function clearReservedCache(): void {
  reservedCache = null;
}

async function activeKeyCount(dbh: DbHandle, userId: string): Promise<number> {
  const [row] = await dbh
    .select({ n: count() })
    .from(directoryKeys)
    .where(and(eq(directoryKeys.userId, userId), isNull(directoryKeys.releasedAt)));
  return row?.n ?? 0;
}

/**
 * Why a VPA cannot be claimed, or null if it can.
 *
 * Released keys still occupy the namespace — uniqueness on value and skeleton is
 * global, not partial — so a handle is spent once and never recycled.
 */
export async function checkVpaAvailability(
  dbh: DbHandle,
  candidate: string,
): Promise<AvailabilityResponse> {
  const normalized = normalizeVpa(candidate);
  const parts = splitVpa(normalized);
  const unavailable = (reason: AvailabilityResponse["reason"]): AvailabilityResponse => ({
    vpa: normalized,
    available: false,
    reason,
  });

  if (parts === null || !isValidVpaLocalPart(parts.local)) {
    return unavailable("malformed");
  }

  const [institution] = await dbh
    .select({ pspStatus: institutions.pspStatus })
    .from(institutions)
    .where(eq(institutions.pspHandle, parts.psp));
  if (institution === undefined || institution.pspStatus !== "active") {
    // Every real bank is seeded `planned`, so nobody can register
    // `someone@sknanb` and imply a relationship we do not have.
    return unavailable("psp_not_active");
  }

  if (isReservedLocalPart(parts.local, await reservedSkeletons(dbh))) {
    return unavailable("reserved");
  }

  const [taken] = await dbh
    .select({ id: directoryKeys.id })
    .from(directoryKeys)
    .where(eq(directoryKeys.valueNormalized, normalized));
  if (taken !== undefined) return unavailable("taken");

  const skeleton = vpaSkeleton(parts.local);
  const [confusable] = await dbh
    .select({ id: directoryKeys.id })
    .from(directoryKeys)
    .where(eq(directoryKeys.skeleton, skeleton));
  if (confusable !== undefined) return unavailable("confusable");

  return { vpa: normalized, available: true, reason: null };
}

export interface ClaimInput {
  type: "vpa" | "phone" | "email";
  value: string;
  linkedAccountId?: string;
  makePrimary?: boolean;
}

export async function claimKey(
  dbh: DbHandle,
  userId: string,
  input: ClaimInput,
): Promise<{ key: DirectoryKey; verificationRequired: boolean }> {
  if ((await activeKeyCount(dbh, userId)) >= MAX_ACTIVE_DIRECTORY_KEYS) {
    throw new ApiError(
      422,
      "TOO_MANY_KEYS",
      `You can hold at most ${MAX_ACTIVE_DIRECTORY_KEYS} addresses`,
    );
  }

  if (input.linkedAccountId !== undefined) {
    const [owned] = await dbh
      .select({ id: linkedAccounts.id })
      .from(linkedAccounts)
      .where(
        and(eq(linkedAccounts.id, input.linkedAccountId), eq(linkedAccounts.userId, userId)),
      );
    if (owned === undefined) {
      throw new ApiError(404, "ACCOUNT_NOT_FOUND", "That is not one of your accounts");
    }
  }

  let normalized: string;
  let skeleton: string | null = null;
  let institutionId: string | null = null;
  // VPAs are self-evidently yours the moment you claim one. A phone number or an
  // email address belongs to someone, so it has to be proved.
  let verificationRequired = false;

  if (input.type === "vpa") {
    const availability = await checkVpaAvailability(dbh, input.value);
    if (!availability.available) {
      throw new ApiError(422, `VPA_${availability.reason?.toUpperCase()}`, vpaRefusal(availability));
    }
    normalized = availability.vpa;
    const parts = splitVpa(normalized)!;
    skeleton = vpaSkeleton(parts.local);
    const [institution] = await dbh
      .select({ id: institutions.id })
      .from(institutions)
      .where(eq(institutions.pspHandle, parts.psp));
    institutionId = institution?.id ?? null;
  } else if (input.type === "phone") {
    const phone = normalizeE164(input.value);
    if (phone === null) {
      throw new ApiError(
        422,
        "PHONE_INVALID",
        "Give the full international number, starting with +",
      );
    }
    normalized = phone;
    verificationRequired = true;
  } else {
    const parsed = parseDirectoryKey(input.value);
    if (parsed === null || parsed.type !== "email") {
      throw new ApiError(422, "EMAIL_INVALID", "That is not a valid email address");
    }
    normalized = parsed.value;
    verificationRequired = true;
  }

  const makePrimary = input.makePrimary === true && !verificationRequired;

  try {
    return await dbh.transaction(async (tx) => {
      if (makePrimary) {
        await tx
          .update(directoryKeys)
          .set({ isPrimary: false })
          .where(and(eq(directoryKeys.userId, userId), eq(directoryKeys.isPrimary, true)));
      }
      const [row] = await tx
        .insert(directoryKeys)
        .values({
          userId,
          type: input.type,
          valueRaw: input.value.trim(),
          valueNormalized: normalized,
          skeleton,
          institutionId,
          linkedAccountId: input.linkedAccountId ?? null,
          isPrimary: makePrimary,
          verifiedAt: verificationRequired ? null : new Date(),
          // TODO(prod): deliver a real one-time code. The prototype accepts any
          // code, but the flow exists so the question has an answer.
          verificationCode: verificationRequired ? "000000" : null,
          verificationExpiresAt: verificationRequired
            ? new Date(Date.now() + 10 * 60 * 1000)
            : null,
        })
        .returning();
      return { key: toPublicKey(row!), verificationRequired };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(409, "KEY_TAKEN", "That address is already in use");
    }
    throw error;
  }
}

function vpaRefusal(availability: AvailabilityResponse): string {
  switch (availability.reason) {
    case "taken":
      return "That address is already in use";
    case "confusable":
      return "That address is too easily confused with one already in use";
    case "reserved":
      return "That address is reserved";
    case "psp_not_active":
      return "That provider is not accepting addresses yet";
    default:
      return "Addresses are 3–20 characters, start with a letter, and use a–z, 0–9, . _ -";
  }
}

export async function verifyKey(
  dbh: DbHandle,
  userId: string,
  keyId: string,
): Promise<DirectoryKey> {
  const [row] = await dbh
    .select()
    .from(directoryKeys)
    .where(and(eq(directoryKeys.id, keyId), eq(directoryKeys.userId, userId)));
  if (row === undefined || row.releasedAt !== null) {
    throw new ApiError(404, "KEY_NOT_FOUND", "No such address");
  }
  // TODO(prod): compare against a delivered code and enforce the expiry. The
  // prototype auto-approves, exactly as signup auto-verifies KYC.
  const [updated] = await dbh
    .update(directoryKeys)
    .set({ verifiedAt: new Date(), verificationCode: null, verificationExpiresAt: null })
    .where(eq(directoryKeys.id, keyId))
    .returning();
  return toPublicKey(updated!);
}

export async function listKeys(dbh: DbHandle, userId: string): Promise<DirectoryKey[]> {
  const rows = await dbh
    .select()
    .from(directoryKeys)
    .where(and(eq(directoryKeys.userId, userId), isNull(directoryKeys.releasedAt)))
    .orderBy(sql`${directoryKeys.isPrimary} DESC`, directoryKeys.createdAt);
  return rows.map(toPublicKey);
}

/**
 * Give up an address. Soft-deleted and never recycled: the unique indexes cover
 * released rows too, so the name is spent for good. In an instant, irreversible
 * system a recycled handle means money reaching a stranger.
 */
export async function releaseKey(dbh: DbHandle, userId: string, keyId: string): Promise<void> {
  const [row] = await dbh
    .select()
    .from(directoryKeys)
    .where(and(eq(directoryKeys.id, keyId), eq(directoryKeys.userId, userId)));
  if (row === undefined || row.releasedAt !== null) {
    throw new ApiError(404, "KEY_NOT_FOUND", "No such address");
  }

  const remaining = await dbh
    .select({ id: directoryKeys.id })
    .from(directoryKeys)
    .where(
      and(
        eq(directoryKeys.userId, userId),
        eq(directoryKeys.type, "vpa"),
        isNull(directoryKeys.releasedAt),
      ),
    );
  if (row.type === "vpa" && remaining.length <= 1) {
    throw new ApiError(
      422,
      "LAST_VPA",
      "That is your only payment address — claim another before releasing this one",
    );
  }

  await dbh
    .update(directoryKeys)
    .set({ releasedAt: new Date(), isPrimary: false })
    .where(eq(directoryKeys.id, keyId));
}

/**
 * Turn what the payer typed into who they are paying.
 *
 * Deliberately narrow: a masked name, the currency of the account this key
 * routes to, and the institution. Never the account reference, never the user
 * id, never their other keys or accounts. This endpoint is a lookup oracle over
 * phone numbers and handles, so what it does not say matters as much as what it
 * does.
 */
export async function resolveKey(
  dbh: DbHandle,
  viewerUserId: string,
  rawKey: string,
): Promise<ResolveResponse & { userId: string; accountId: string }> {
  const parsed = parseDirectoryKey(rawKey);
  if (parsed === null) {
    throw new ApiError(422, "KEY_MALFORMED", "That is not an address, phone number, or email");
  }

  const [row] = await dbh
    .select({
      keyValue: directoryKeys.valueNormalized,
      keyUserId: directoryKeys.userId,
      linkedAccountId: directoryKeys.linkedAccountId,
      fullName: users.fullName,
      countryCode: users.countryCode,
    })
    .from(directoryKeys)
    .innerJoin(users, eq(users.id, directoryKeys.userId))
    .where(
      and(eq(directoryKeys.valueNormalized, parsed.value), isNull(directoryKeys.releasedAt)),
    );
  if (row === undefined) {
    throw new ApiError(404, "KEY_NOT_FOUND", "Nobody is using that address");
  }
  if (row.keyUserId === viewerUserId) {
    throw new ApiError(422, "OWN_KEY", "That is your own address");
  }

  const account = await accountForKey(dbh, row.keyUserId, row.linkedAccountId);
  const [institution] = await dbh
    .select({ displayName: institutions.displayName })
    .from(institutions)
    .where(eq(institutions.id, account.institutionId));
  const primary = await primaryVpaFor(dbh, row.keyUserId);

  return {
    key: row.keyValue,
    maskedName: maskName(row.fullName),
    primaryVpa: primary ?? row.keyValue,
    currency: account.currency,
    institutionDisplayName: institution?.displayName ?? "Unknown institution",
    countryCode: row.countryCode,
    userId: row.keyUserId,
    accountId: account.id,
  };
}

/** The account a key routes to: its own, or the owner's default. */
async function accountForKey(dbh: DbHandle, userId: string, linkedAccountId: string | null) {
  if (linkedAccountId !== null) {
    const [row] = await dbh
      .select()
      .from(linkedAccounts)
      .where(and(eq(linkedAccounts.id, linkedAccountId), eq(linkedAccounts.status, "active")));
    if (row !== undefined) return row;
  }
  const [fallback] = await dbh
    .select()
    .from(linkedAccounts)
    .where(
      and(
        eq(linkedAccounts.userId, userId),
        eq(linkedAccounts.isDefault, true),
        eq(linkedAccounts.status, "active"),
      ),
    );
  if (fallback === undefined) {
    // Inherent to the model: an address is only payable once its owner has
    // linked a bank account. Distinct code so the UI can say so plainly.
    throw new ApiError(
      422,
      "KEY_NOT_PAYABLE",
      "That person has not connected a bank account yet",
    );
  }
  return fallback;
}

export async function primaryVpaFor(dbh: DbHandle, userId: string): Promise<string | null> {
  const [row] = await dbh
    .select({ value: directoryKeys.valueNormalized })
    .from(directoryKeys)
    .where(
      and(
        eq(directoryKeys.userId, userId),
        eq(directoryKeys.type, "vpa"),
        isNull(directoryKeys.releasedAt),
      ),
    )
    .orderBy(sql`${directoryKeys.isPrimary} DESC`, directoryKeys.createdAt)
    .limit(1);
  return row?.value ?? null;
}

const MINT_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/**
 * Give every new user a working address at signup.
 *
 * Must be infallible: it runs inside the registration transaction, and a
 * collision or a reserved-word hit must not cost someone their account. Hence a
 * neutral, high-entropy handle and a bounded retry — the memorable one is
 * claimed later, deliberately.
 */
export async function mintDefaultVpa(dbh: DbHandle, userId: string): Promise<string> {
  const [psp] = await dbh
    .select({ id: institutions.id, handle: institutions.pspHandle })
    .from(institutions)
    .where(eq(institutions.pspStatus, "active"))
    .limit(1);
  if (psp === undefined || psp.handle === null) {
    throw new Error("No active PSP is seeded; cannot mint a default address");
  }

  for (let attempt = 0; attempt < 6; attempt++) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const local = `cp-${[...bytes].map((b) => MINT_ALPHABET[b % MINT_ALPHABET.length]).join("")}`;
    const value = `${local}@${psp.handle}`;
    try {
      await dbh.insert(directoryKeys).values({
        userId,
        type: "vpa",
        valueRaw: value,
        valueNormalized: value,
        skeleton: vpaSkeleton(local),
        institutionId: psp.id,
        isPrimary: true,
        verifiedAt: new Date(),
      });
      return value;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw new Error("Could not mint a unique default address after 6 attempts");
}
