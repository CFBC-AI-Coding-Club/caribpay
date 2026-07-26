import { Hono } from "hono";
import { requestId } from "./middleware/request-id";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { simulateRail } from "./middleware/simulation";
import { accountRoutes } from "./routes/accounts";
import { creditRoutes } from "./routes/credits";
import { debitRoutes } from "./routes/debits";
import { healthRoutes } from "./routes/health";
import { holdRoutes } from "./routes/holds";
import type { BankAppEnv } from "./app-env";

/**
 * The mock member-bank service.
 *
 * It exists to put a network boundary between CaribPay and customer money. The
 * switch may only reach account data through these endpoints — it has no
 * credentials for this database, which is what makes "we never hold funds"
 * a property a judge can inspect rather than a claim.
 */
export function buildBankApp(): Hono<BankAppEnv> {
  const app = new Hono<BankAppEnv>();
  app.use(requestId);
  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  app.route("/", healthRoutes);
  app.use("/accounts/*", simulateRail);
  app.use("/debits/*", simulateRail);
  app.use("/credits/*", simulateRail);
  app.route("/accounts", accountRoutes);
  app.route("/debits", debitRoutes);
  app.route("/credits", creditRoutes);
  app.route("/holds", holdRoutes);
  return app;
}
