import { z } from "zod";
import { userSchema } from "./user";

export const registerRequestSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(8).max(128),
  fullName: z.string().trim().min(1).max(120),
  countryCode: z
    .string()
    .regex(/^[A-Za-z]{2}$/, "Must be a 2-letter ISO country code")
    .transform((s) => s.toUpperCase()),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  accessTokenExpiresIn: z.number().int(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

export const authResponseSchema = z.object({
  user: userSchema,
  tokens: authTokensSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const loginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const refreshResponseSchema = z.object({
  tokens: authTokensSchema,
});
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;

export const logoutRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type LogoutRequest = z.infer<typeof logoutRequestSchema>;
