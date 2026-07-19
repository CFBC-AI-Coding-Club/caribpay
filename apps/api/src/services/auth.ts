import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { sign } from "hono/jwt";
import {
  homeCurrencyFor,
  type AuthTokens,
  type LoginRequest,
  type RegisterRequest,
  type User,
} from "@caribpay/shared";
import type { DbHandle } from "../db/client";
import { refreshTokens, users } from "../db/schema";
import { ApiError } from "../lib/errors";
import { isUniqueViolation } from "../lib/pg-errors";
import { env } from "../env";
import { createWalletForUser } from "./wallets";

type UserRow = typeof users.$inferSelect;

function toPublicUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    countryCode: row.countryCode,
    kycStatus: row.kycStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueTokens(dbh: DbHandle, userId: string): Promise<AuthTokens> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const accessToken = await sign(
    { sub: userId, iat: nowSeconds, exp: nowSeconds + env.accessTokenTtlSeconds },
    env.jwtAccessSecret,
  );
  const refreshToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + env.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
  await dbh
    .insert(refreshTokens)
    .values({ userId, tokenHash: hashRefreshToken(refreshToken), expiresAt });
  return { accessToken, refreshToken, accessTokenExpiresIn: env.accessTokenTtlSeconds };
}

export async function registerUser(
  dbh: DbHandle,
  input: RegisterRequest,
): Promise<{ user: User; tokens: AuthTokens }> {
  const passwordHash = await Bun.password.hash(input.password, { algorithm: "argon2id" });
  let userRow: UserRow;
  try {
    userRow = await dbh.transaction(async (tx) => {
      const [row] = await tx
        .insert(users)
        .values({
          email: input.email.toLowerCase(),
          passwordHash,
          fullName: input.fullName,
          countryCode: input.countryCode,
          // Prototype: KYC is auto-verified at signup; the field exists for the real flow.
          kycStatus: "verified",
        })
        .returning();
      await createWalletForUser(tx, row!.id, homeCurrencyFor(input.countryCode));
      return row!;
    });
  } catch (error) {
    if (isUniqueViolation(error, "users_email_unique")) {
      throw new ApiError(409, "EMAIL_TAKEN", "An account with this email already exists");
    }
    throw error;
  }
  const tokens = await issueTokens(dbh, userRow.id);
  return { user: toPublicUser(userRow), tokens };
}

export async function loginUser(
  dbh: DbHandle,
  input: LoginRequest,
): Promise<{ user: User; tokens: AuthTokens }> {
  const [userRow] = await dbh
    .select()
    .from(users)
    .where(eq(users.email, input.email.toLowerCase()));
  const passwordOk =
    userRow !== undefined && (await Bun.password.verify(input.password, userRow.passwordHash));
  if (!passwordOk) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
  }
  const tokens = await issueTokens(dbh, userRow!.id);
  return { user: toPublicUser(userRow!), tokens };
}

/**
 * Rotate a refresh token: revoke the presented one and issue a fresh pair.
 * Presenting an already-revoked token is treated as theft — every live
 * session for that user is revoked.
 */
export async function rotateRefreshToken(dbh: DbHandle, refreshToken: string): Promise<AuthTokens> {
  const tokenHash = hashRefreshToken(refreshToken);
  // The transaction returns an outcome instead of throwing: a thrown ApiError
  // would roll back the family revocation that reuse detection must persist.
  const outcome = await dbh.transaction(
    async (
      tx,
    ): Promise<
      | { kind: "invalid" | "reused" | "expired" }
      | { kind: "rotated"; tokens: AuthTokens }
    > => {
      const [row] = await tx
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, tokenHash))
        .for("update");
      if (row === undefined) {
        return { kind: "invalid" };
      }
      if (row.revokedAt !== null) {
        await tx
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(and(eq(refreshTokens.userId, row.userId), isNull(refreshTokens.revokedAt)));
        return { kind: "reused" };
      }
      if (row.expiresAt.getTime() <= Date.now()) {
        return { kind: "expired" };
      }
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.id, row.id));
      return { kind: "rotated", tokens: await issueTokens(tx, row.userId) };
    },
  );

  switch (outcome.kind) {
    case "invalid":
      throw new ApiError(401, "INVALID_REFRESH_TOKEN", "Refresh token not recognized");
    case "reused":
      throw new ApiError(401, "REFRESH_TOKEN_REUSED", "Session revoked due to token reuse");
    case "expired":
      throw new ApiError(401, "REFRESH_TOKEN_EXPIRED", "Refresh token has expired");
    case "rotated":
      return outcome.tokens;
  }
}

/** Revoke one refresh token. Idempotent: revoking an unknown token is a no-op. */
export async function revokeRefreshToken(
  dbh: DbHandle,
  userId: string,
  refreshToken: string,
): Promise<void> {
  await dbh
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokens.tokenHash, hashRefreshToken(refreshToken)),
        eq(refreshTokens.userId, userId),
        isNull(refreshTokens.revokedAt),
      ),
    );
}

export async function getPublicUser(dbh: DbHandle, userId: string): Promise<User> {
  const [row] = await dbh.select().from(users).where(eq(users.id, userId));
  if (row === undefined) {
    throw new ApiError(401, "UNAUTHORIZED", "Account no longer exists");
  }
  return toPublicUser(row);
}
