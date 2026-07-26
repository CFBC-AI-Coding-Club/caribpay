import { z } from "zod";
import { PSP_STATUSES, SUPPORTED_CURRENCIES } from "../constants";

/**
 * A member institution. One table serves both roles: the suffix of a VPA
 * (`@ncb`) and an entry in the account-linking picker. An institution is both.
 */
export const institutionSchema = z.object({
  id: z.uuid(),
  legalName: z.string(),
  displayName: z.string(),
  countryCode: z.string().length(2),
  currency: z.enum(SUPPORTED_CURRENCIES),
  /** Null until an institution is onboarded as a PSP. Unique when set. */
  pspHandle: z.string().nullable(),
  pspStatus: z.enum(PSP_STATUSES),
  supportsAccountLinking: z.boolean(),
  sortOrder: z.number().int(),
});
export type Institution = z.infer<typeof institutionSchema>;

export const institutionsResponseSchema = z.object({
  institutions: z.array(institutionSchema),
});
export type InstitutionsResponse = z.infer<typeof institutionsResponseSchema>;
