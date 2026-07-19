import { z } from "zod";
import { KYC_STATUSES } from "../constants";

export const userSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  fullName: z.string(),
  countryCode: z.string().length(2),
  kycStatus: z.enum(KYC_STATUSES),
  createdAt: z.string(),
});
export type User = z.infer<typeof userSchema>;

export const meResponseSchema = z.object({
  user: userSchema,
});
export type MeResponse = z.infer<typeof meResponseSchema>;
