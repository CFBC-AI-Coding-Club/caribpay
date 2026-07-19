import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import path from "node:path";

export const MIGRATIONS_FOLDER = path.join(import.meta.dir, "migrations");

export async function runMigrations(databaseUrl: string): Promise<void> {
  const client = new SQL(databaseUrl, { max: 1 });
  try {
    await migrate(drizzle({ client }), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.close();
  }
}

if (import.meta.main) {
  const { databaseUrl } = await import("./client");
  await runMigrations(databaseUrl);
  console.log("migrations applied");
  process.exit(0);
}
