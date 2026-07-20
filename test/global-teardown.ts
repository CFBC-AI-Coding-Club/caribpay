import { afterAll } from "bun:test";

// Runs once after the whole test run: closes the api app's global db pool and
// redis connection so the process can exit. Individual test files must not
// close these — files share one process and later files still need them.
afterAll(async () => {
  try {
    const { closeDb } = await import("../apps/api/src/db/client");
    await closeDb();
  } catch {
    // App db module never loaded (e.g. shared-only run) — nothing to close.
  }
  try {
    const { closeRedis } = await import("../apps/api/src/lib/redis");
    await closeRedis();
  } catch {
    // Redis module never loaded — nothing to close.
  }
  try {
    const { closeQueue } = await import("../apps/api/src/lib/queue");
    await closeQueue();
  } catch {
    // Queue module never loaded — nothing to close.
  }
});
