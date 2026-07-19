import { afterAll, beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
  WALLET_ADDRESS_PATTERN,
  authResponseSchema,
  errorResponseSchema,
  meResponseSchema,
  refreshResponseSchema,
} from "@caribpay/shared";
import type { Hono } from "hono";
import type { AppEnv } from "../src/app-env";
import { wallets } from "../src/db/schema";
import { TEST_DATABASE_URL, setupTestDb, truncateAll, type TestDb } from "./helpers";

setDefaultTimeout(30000);

let t: TestDb;
let app: Hono<AppEnv>;
let closeDb: () => Promise<void>;

beforeAll(async () => {
  t = await setupTestDb();
  // The app's global db client must bind to the test database; set the env
  // before the app module graph is imported.
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  const [{ buildApp }, clientModule] = await Promise.all([
    import("../src/app"),
    import("../src/db/client"),
  ]);
  closeDb = clientModule.closeDb;
  app = buildApp();
});

afterAll(async () => {
  await closeDb();
  await t.client.close();
});

beforeEach(async () => {
  await truncateAll(t.client);
});

async function postJson(path: string, body: unknown, token?: string): Promise<Response> {
  return await app.request(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });
}

const REGISTER_BODY = {
  email: "keisha@example.com",
  password: "correct-horse-battery",
  fullName: "Keisha Browne",
  countryCode: "kn",
};

async function registerDefault() {
  const res = await postJson("/api/v1/auth/register", REGISTER_BODY);
  expect(res.status).toBe(201);
  return authResponseSchema.parse(await res.json());
}

describe("register", () => {
  test("creates a verified user with a home-currency wallet and returns tokens", async () => {
    const { user, tokens } = await registerDefault();
    expect(user.email).toBe("keisha@example.com");
    expect(user.countryCode).toBe("KN");
    expect(user.kycStatus).toBe("verified");
    expect(tokens.accessToken.length).toBeGreaterThan(20);
    expect(tokens.accessTokenExpiresIn).toBe(900);

    const rows = await t.db.select().from(wallets).where(eq(wallets.userId, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.currency).toBe("XCD");
    expect(rows[0]!.address).toMatch(WALLET_ADDRESS_PATTERN);
  });

  test("falls back to USD for countries outside the mapped currencies", async () => {
    const res = await postJson("/api/v1/auth/register", {
      ...REGISTER_BODY,
      email: "us-user@example.com",
      countryCode: "US",
    });
    const { user } = authResponseSchema.parse(await res.json());
    const rows = await t.db.select().from(wallets).where(eq(wallets.userId, user.id));
    expect(rows[0]!.currency).toBe("USD");
  });

  test("rejects a duplicate email with 409", async () => {
    await registerDefault();
    const res = await postJson("/api/v1/auth/register", REGISTER_BODY);
    expect(res.status).toBe(409);
    const body = errorResponseSchema.parse(await res.json());
    expect(body.error.code).toBe("EMAIL_TAKEN");
  });

  test("rejects invalid bodies with 400 and the error envelope", async () => {
    const res = await postJson("/api/v1/auth/register", { email: "nope", password: "short" });
    expect(res.status).toBe(400);
    const body = errorResponseSchema.parse(await res.json());
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("login", () => {
  test("returns tokens for valid credentials", async () => {
    await registerDefault();
    const res = await postJson("/api/v1/auth/login", {
      email: REGISTER_BODY.email,
      password: REGISTER_BODY.password,
    });
    expect(res.status).toBe(200);
    authResponseSchema.parse(await res.json());
  });

  test("rejects a wrong password and an unknown email identically", async () => {
    await registerDefault();
    for (const attempt of [
      { email: REGISTER_BODY.email, password: "wrong-password" },
      { email: "ghost@example.com", password: "whatever-here" },
    ]) {
      const res = await postJson("/api/v1/auth/login", attempt);
      expect(res.status).toBe(401);
      const body = errorResponseSchema.parse(await res.json());
      expect(body.error.code).toBe("INVALID_CREDENTIALS");
    }
  });
});

describe("/me", () => {
  test("returns the profile with a valid access token", async () => {
    const { user, tokens } = await registerDefault();
    const res = await app.request("/api/v1/me", {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.status).toBe(200);
    const body = meResponseSchema.parse(await res.json());
    expect(body.user.id).toBe(user.id);
  });

  test("rejects missing and malformed tokens", async () => {
    const bare = await app.request("/api/v1/me");
    expect(bare.status).toBe(401);
    const garbage = await app.request("/api/v1/me", {
      headers: { Authorization: "Bearer not-a-jwt" },
    });
    expect(garbage.status).toBe(401);
  });
});

describe("refresh rotation", () => {
  test("rotates the refresh token and detects reuse by revoking the family", async () => {
    const { tokens: original } = await registerDefault();

    const first = await postJson("/api/v1/auth/refresh", { refreshToken: original.refreshToken });
    expect(first.status).toBe(200);
    const { tokens: rotated } = refreshResponseSchema.parse(await first.json());
    expect(rotated.refreshToken).not.toBe(original.refreshToken);

    // Replaying the original token is reuse: it must fail AND kill the rotated one.
    const replay = await postJson("/api/v1/auth/refresh", { refreshToken: original.refreshToken });
    expect(replay.status).toBe(401);
    expect(errorResponseSchema.parse(await replay.json()).error.code).toBe("REFRESH_TOKEN_REUSED");

    const afterReuse = await postJson("/api/v1/auth/refresh", { refreshToken: rotated.refreshToken });
    expect(afterReuse.status).toBe(401);
  });

  test("rejects unknown refresh tokens", async () => {
    const res = await postJson("/api/v1/auth/refresh", { refreshToken: "made-up-token" });
    expect(res.status).toBe(401);
    expect(errorResponseSchema.parse(await res.json()).error.code).toBe("INVALID_REFRESH_TOKEN");
  });
});

describe("logout", () => {
  test("revokes the refresh token", async () => {
    const { tokens } = await registerDefault();
    const res = await postJson(
      "/api/v1/auth/logout",
      { refreshToken: tokens.refreshToken },
      tokens.accessToken,
    );
    expect(res.status).toBe(204);

    const reuse = await postJson("/api/v1/auth/refresh", { refreshToken: tokens.refreshToken });
    expect(reuse.status).toBe(401);
  });

  test("requires auth", async () => {
    const res = await postJson("/api/v1/auth/logout", { refreshToken: "anything" });
    expect(res.status).toBe(401);
  });
});

describe("health", () => {
  test("is public and reports db up", async () => {
    const res = await app.request("/api/v1/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", db: "up" });
  });
});
