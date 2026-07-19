import { SQL } from "bun";
import { drizzle, type BunSQLDatabase, type BunSQLQueryResultHKT } from "drizzle-orm/bun-sql";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "./schema";

// Fallback matches docker-compose.yml so a fresh clone works without a .env.
export const DEFAULT_DATABASE_URL = "postgresql://caribpay:caribpay@localhost:5432/caribpay";

export const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

export const sqlClient = new SQL(databaseUrl);
export const db: BunSQLDatabase<typeof schema> = drizzle({ client: sqlClient, schema });

/** Accepts either the root db or a transaction handle, so services compose into atomic units. */
export type DbHandle = PgDatabase<BunSQLQueryResultHKT, typeof schema>;
