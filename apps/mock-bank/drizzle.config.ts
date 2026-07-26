import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.BANK_DATABASE_URL ??
      "postgresql://caribpay:caribpay@localhost:5432/caribpay_bank",
  },
});
