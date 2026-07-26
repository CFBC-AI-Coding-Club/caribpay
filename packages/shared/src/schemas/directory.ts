import { z } from "zod";
import { DIRECTORY_KEY_TYPES, SUPPORTED_CURRENCIES } from "../constants";
import { VPA_LOCAL_MAX, VPA_LOCAL_MIN } from "../vpa";

export const directoryKeySchema = z.object({
  id: z.uuid(),
  type: z.enum(DIRECTORY_KEY_TYPES),
  /** Normalised form — what the directory actually matches on. */
  value: z.string(),
  isPrimary: z.boolean(),
  /** Null until the OTP step completes. VPAs are verified on creation. */
  verifiedAt: z.string().nullable(),
  /** Null means "route to my default account", as UPI does. */
  linkedAccountId: z.uuid().nullable(),
  createdAt: z.string(),
});
export type DirectoryKey = z.infer<typeof directoryKeySchema>;

export const directoryKeysResponseSchema = z.object({
  keys: z.array(directoryKeySchema),
});
export type DirectoryKeysResponse = z.infer<typeof directoryKeysResponseSchema>;

export const claimKeyRequestSchema = z.object({
  type: z.enum(DIRECTORY_KEY_TYPES),
  /** Raw as typed; the server normalises and validates it. */
  value: z.string().trim().min(1).max(254),
  linkedAccountId: z.uuid().optional(),
  makePrimary: z.boolean().default(false),
});
export type ClaimKeyRequest = z.infer<typeof claimKeyRequestSchema>;

export const claimKeyResponseSchema = z.object({
  key: directoryKeySchema,
  /** True when an OTP step is pending — phone and email keys. */
  verificationRequired: z.boolean(),
});
export type ClaimKeyResponse = z.infer<typeof claimKeyResponseSchema>;

export const verifyKeyRequestSchema = z.object({
  code: z.string().trim().min(4).max(8),
});
export type VerifyKeyRequest = z.infer<typeof verifyKeyRequestSchema>;

export const verifyKeyResponseSchema = z.object({
  key: directoryKeySchema,
});
export type VerifyKeyResponse = z.infer<typeof verifyKeyResponseSchema>;

export const availabilityQuerySchema = z.object({
  vpa: z.string().trim().min(VPA_LOCAL_MIN).max(VPA_LOCAL_MAX + 64),
});
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

/** Why a handle cannot be claimed. The UI says which, so the user can fix it. */
export const VPA_UNAVAILABLE_REASONS = [
  "taken",
  "confusable",
  "reserved",
  "malformed",
  "psp_not_active",
] as const;

export const availabilityResponseSchema = z.object({
  vpa: z.string(),
  available: z.boolean(),
  reason: z.enum(VPA_UNAVAILABLE_REASONS).nullable(),
});
export type AvailabilityResponse = z.infer<typeof availabilityResponseSchema>;

export const resolveQuerySchema = z.object({
  /** A VPA, a phone number, or an email address. */
  key: z.string().trim().min(3).max(254),
});
export type ResolveQuery = z.infer<typeof resolveQuerySchema>;

/**
 * What the directory will say about someone you are about to pay.
 *
 * Deliberately narrow. This endpoint is a lookup oracle over phone numbers and
 * handles, so it returns a masked name and the one account the key routes to —
 * never the account reference, the account number, the user's id, or any other
 * key or account they hold.
 */
export const resolveResponseSchema = z.object({
  /** Echoed back normalised, so the client shows what it actually resolved. */
  key: z.string(),
  maskedName: z.string(),
  /** The payee's primary VPA, for display and for saving as a contact. */
  primaryVpa: z.string(),
  /** The currency of the account this key routes to. */
  currency: z.enum(SUPPORTED_CURRENCIES),
  institutionDisplayName: z.string(),
  countryCode: z.string().length(2),
});
export type ResolveResponse = z.infer<typeof resolveResponseSchema>;
