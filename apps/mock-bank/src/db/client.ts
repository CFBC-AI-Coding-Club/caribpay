import { SQL } from "bun";
import { drizzle, type BunSQLDatabase, type BunSQLQueryResultHKT } from "drizzle-orm/bun-sql";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/**
 * A database the switch has no credentials for. `apps/api` reaching customer
 * balances by SQL is the thing this whole service exists to make impossible, so
 * the separation is enforced by connection configuration, not convention.
 */
export const DEFAULT_BANK_DATABASE_URL =
  "postgresql://caribpay:caribpay@localhost:5432/caribpay_bank";

export const bankDatabaseUrl = process.env.BANK_DATABASE_URL ?? DEFAULT_BANK_DATABASE_URL;

export const sqlClient = new SQL(bankDatabaseUrl);
export const db: BunSQLDatabase<typeof schema> = drizzle({ client: sqlClient, schema });

export type DbHandle = PgDatabase<BunSQLQueryResultHKT, typeof schema>;

export async function closeDb(): Promise<void> {
  await sqlClient.close();
}
