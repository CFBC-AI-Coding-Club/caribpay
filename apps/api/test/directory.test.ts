import { afterAll, beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import type { AppEnv } from "../src/app-env";
import { directoryKeys } from "../src/db/schema";
import {
  TEST_DATABASE_URL,
  createTestUser,
  seedWorld,
  setupTestDb,
  truncateAll,
  type TestDb,
  type TestUser,
} from "./helpers";

setDefaultTimeout(30000);

let t: TestDb;
let app: Hono<AppEnv>;
let amara: TestUser;
let devon: TestUser;

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.WORKER_IN_PROCESS = "false";
  t = await setupTestDb();
  const { buildApp } = await import("../src/app");
  app = buildApp();
});

afterAll(async () => {
  await t.client.close();
});

beforeEach(async () => {
  await truncateAll(t.client);
  await seedWorld(t.db);
  amara = await createTestUser(t.db, {
    email: "amara@test.local",
    fullName: "Amara Liburd",
    countryCode: "KN",
    institutionHandle: "sknanb",
    accountRef: "SKNANB-ACCT-4001",
    vpa: "amara@caribpay",
  });
  devon = await createTestUser(t.db, {
    email: "devon@test.local",
    fullName: "Devon Campbell",
    countryCode: "JM",
    institutionHandle: "ncb",
    accountRef: "NCB-ACCT-4001",
    vpa: "devon@caribpay",
  });
  const { redis } = await import("../src/lib/redis");
  const keys = await redis.keys("caribpay:rl:*");
  if (keys.length > 0) await redis.del(...keys);
});

async function token(email: string): Promise<string> {
  const res = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "demo1234" }),
  });
  const body = (await res.json()) as { tokens: { accessToken: string } };
  return body.tokens.accessToken;
}

async function api(
  path: string,
  init: RequestInit & { token: string } = { token: "" },
): Promise<Response> {
  return await app.request(path, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${init.token}` },
  });
}

async function errorCode(res: Response): Promise<string> {
  const body = (await res.json()) as { error: { code: string } };
  return body.error.code;
}

describe("claiming a VPA", () => {
  test("succeeds for an ordinary handle", async () => {
    const tok = await token("amara@test.local");
    const res = await api("/api/v1/directory/keys", {
      token: tok,
      method: "POST",
      body: JSON.stringify({ type: "vpa", value: "amara.liburd@caribpay" }),
    });
    expect(res.status).toBe(201);
  });

  test("rejects a confusable spelling of a live handle", async () => {
    // The guard the whole skeleton mechanism exists for: `amara` is taken by the
    // fixture, so `arnara` (rn → m) must not be registrable.
    const tok = await token("devon@test.local");
    const res = await api("/api/v1/directory/keys", {
      token: tok,
      method: "POST",
      body: JSON.stringify({ type: "vpa", value: "arnara@caribpay" }),
    });
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe("VPA_CONFUSABLE");
  });

  test("rejects a confusable spelling of a reserved institution alias", async () => {
    const tok = await token("amara@test.local");
    const res = await api("/api/v1/directory/keys", {
      token: tok,
      method: "POST",
      body: JSON.stringify({ type: "vpa", value: "repub1ic@caribpay" }),
    });
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe("VPA_RESERVED");
  });

  test("rejects a reserved word", async () => {
    const tok = await token("amara@test.local");
    for (const value of ["support@caribpay", "eccb@caribpay", "ncb@caribpay"]) {
      const res = await api("/api/v1/directory/keys", {
        token: tok,
        method: "POST",
        body: JSON.stringify({ type: "vpa", value }),
      });
      expect(await errorCode(res)).toBe("VPA_RESERVED");
    }
  });

  test("rejects a suffix whose PSP is only planned", async () => {
    // Every real bank is seeded `planned`, so nobody can imply a relationship
    // with one by registering against its handle.
    const tok = await token("amara@test.local");
    const res = await api("/api/v1/directory/keys", {
      token: tok,
      method: "POST",
      body: JSON.stringify({ type: "vpa", value: "amara2@sknanb" }),
    });
    expect(await errorCode(res)).toBe("VPA_PSP_NOT_ACTIVE");
  });

  test("rejects an all-numeric handle", async () => {
    const tok = await token("amara@test.local");
    const res = await api("/api/v1/directory/keys", {
      token: tok,
      method: "POST",
      body: JSON.stringify({ type: "vpa", value: "18697654321@caribpay" }),
    });
    expect(await errorCode(res)).toBe("VPA_MALFORMED");
  });

  test("caps a user at five active keys", async () => {
    const tok = await token("amara@test.local");
    // One already exists from the fixture.
    for (const n of [1, 2, 3, 4]) {
      const res = await api("/api/v1/directory/keys", {
        token: tok,
        method: "POST",
        body: JSON.stringify({ type: "vpa", value: `amara-alt${n}@caribpay` }),
      });
      expect(res.status).toBe(201);
    }
    const overflow = await api("/api/v1/directory/keys", {
      token: tok,
      method: "POST",
      body: JSON.stringify({ type: "vpa", value: "amara-alt5@caribpay" }),
    });
    expect(await errorCode(overflow)).toBe("TOO_MANY_KEYS");
  });
});

describe("releasing a key", () => {
  test("a released VPA cannot be re-registered by anyone, including its owner", async () => {
    const tok = await token("amara@test.local");
    const created = await api("/api/v1/directory/keys", {
      token: tok,
      method: "POST",
      body: JSON.stringify({ type: "vpa", value: "amara.spare@caribpay" }),
    });
    const { key } = (await created.json()) as { key: { id: string } };

    const released = await api(`/api/v1/directory/keys/${key.id}`, { token: tok, method: "DELETE" });
    expect(released.status).toBe(200);

    // In an instant, irreversible system a recycled handle means money reaching
    // a stranger. The name is spent for good.
    const byOwner = await api("/api/v1/directory/keys", {
      token: tok,
      method: "POST",
      body: JSON.stringify({ type: "vpa", value: "amara.spare@caribpay" }),
    });
    expect(await errorCode(byOwner)).toBe("VPA_TAKEN");

    const otherTok = await token("devon@test.local");
    const byStranger = await api("/api/v1/directory/keys", {
      token: otherTok,
      method: "POST",
      body: JSON.stringify({ type: "vpa", value: "amara.spare@caribpay" }),
    });
    expect(await errorCode(byStranger)).toBe("VPA_TAKEN");
  });

  test("refuses to release your only payment address", async () => {
    const tok = await token("amara@test.local");
    const [only] = await t.db
      .select()
      .from(directoryKeys)
      .where(eq(directoryKeys.userId, amara.userId));
    const res = await api(`/api/v1/directory/keys/${only!.id}`, { token: tok, method: "DELETE" });
    expect(await errorCode(res)).toBe("LAST_VPA");
  });
});

describe("resolving", () => {
  test("returns a masked name and never an account reference", async () => {
    const tok = await token("amara@test.local");
    const res = await api("/api/v1/directory/resolve?key=devon%40caribpay", { token: tok });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.maskedName).toBe("Devon C.");
    expect(body.currency).toBe("JMD");
    expect(body.institutionDisplayName).toBe("National Commercial Bank Jamaica");
    // The directory is a lookup oracle; what it withholds is the point.
    expect(body).not.toHaveProperty("accountId");
    expect(body).not.toHaveProperty("userId");
    expect(body).not.toHaveProperty("accountRef");
    expect(JSON.stringify(body)).not.toContain("NCB-ACCT");
    expect(JSON.stringify(body)).not.toContain("Campbell");
  });

  test("refuses to resolve your own address", async () => {
    const tok = await token("amara@test.local");
    const res = await api("/api/v1/directory/resolve?key=amara%40caribpay", { token: tok });
    expect(await errorCode(res)).toBe("OWN_KEY");
  });

  test("rejects unverified email and phone keys", async () => {
    const devonTok = await token("devon@test.local");
    const amaraTok = await token("amara@test.local");
    const cases = [
      {
        type: "email",
        claimedValue: "devon.pay@example.com",
        lookupValue: "devon.pay@example.com",
      },
      {
        type: "phone",
        claimedValue: "+1 (869) 765-4321",
        lookupValue: "+1 869 765 4321",
      },
    ];

    for (const keyCase of cases) {
      const claimed = await api("/api/v1/directory/keys", {
        token: devonTok,
        method: "POST",
        body: JSON.stringify({ type: keyCase.type, value: keyCase.claimedValue }),
      });
      expect(claimed.status).toBe(201);

      const resolved = await api(
        `/api/v1/directory/resolve?key=${encodeURIComponent(keyCase.lookupValue)}`,
        { token: amaraTok },
      );
      expect(resolved.status).toBe(404);
      expect(await errorCode(resolved)).toBe("KEY_NOT_FOUND");
    }
  });

  test("resolves verified email and phone keys", async () => {
    const devonTok = await token("devon@test.local");
    const amaraTok = await token("amara@test.local");
    const cases = [
      {
        type: "email",
        claimedValue: "devon.verified@example.com",
        lookupValue: "devon.verified@example.com",
        normalizedValue: "devon.verified@example.com",
      },
      {
        type: "phone",
        claimedValue: "+1 (869) 765-4322",
        lookupValue: "+1 869 765 4322",
        normalizedValue: "+18697654322",
      },
    ];

    for (const keyCase of cases) {
      const claimed = await api("/api/v1/directory/keys", {
        token: devonTok,
        method: "POST",
        body: JSON.stringify({ type: keyCase.type, value: keyCase.claimedValue }),
      });
      expect(claimed.status).toBe(201);
      const { key } = (await claimed.json()) as { key: { id: string } };

      const verified = await api(`/api/v1/directory/keys/${key.id}/verify`, {
        token: devonTok,
        method: "POST",
        body: JSON.stringify({ code: "000000" }),
      });
      expect(verified.status).toBe(200);

      const resolved = await api(
        `/api/v1/directory/resolve?key=${encodeURIComponent(keyCase.lookupValue)}`,
        { token: amaraTok },
      );
      expect(resolved.status).toBe(200);
      const body = (await resolved.json()) as Record<string, unknown>;
      expect(body.key).toBe(keyCase.normalizedValue);
      expect(body.payable).toBe(true);
    }
  });

  test("reports an unpayable address rather than failing the lookup", async () => {
    // The payer should learn who this is and why they cannot be paid. Failing
    // the request would show a generic error about a person who exists.
    await t.client`UPDATE linked_accounts SET status = 'closed' WHERE user_id = ${devon.userId}::uuid`;
    const tok = await token("amara@test.local");
    const res = await api("/api/v1/directory/resolve?key=devon%40caribpay", { token: tok });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.payable).toBe(false);
    expect(body.maskedName).toBe("Devon C.");
    expect(body.currency).toBeNull();
    expect(body.institutionDisplayName).toBeNull();
    expect(body.claimedAt).toBeTypeOf("string");
    // Still withholds everything it withholds when payable.
    expect(body).not.toHaveProperty("accountId");
    expect(body).not.toHaveProperty("userId");
  });

  test("is rate limited", async () => {
    const tok = await token("amara@test.local");
    let limited = false;
    for (let i = 0; i < 25; i++) {
      const res = await api("/api/v1/directory/resolve?key=devon%40caribpay", { token: tok });
      if (res.status === 429) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });

  test("requires authentication", async () => {
    const res = await app.request("/api/v1/directory/resolve?key=devon%40caribpay");
    expect(res.status).toBe(401);
  });
});

describe("signup", () => {
  test("mints a working address every time, with no wallet", async () => {
    const res = await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "newcomer@test.local",
        password: "hunter2hunter2",
        fullName: "New Comer",
        countryCode: "KN",
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { user: { id: string } };

    const keys = await t.db
      .select()
      .from(directoryKeys)
      .where(eq(directoryKeys.userId, body.user.id));
    expect(keys).toHaveLength(1);
    expect(keys[0]!.isPrimary).toBe(true);
    expect(keys[0]!.valueNormalized).toMatch(/^cp-[a-z0-9]{8}@caribpay$/);
  });
});
