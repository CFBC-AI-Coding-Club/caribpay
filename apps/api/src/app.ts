import { Hono } from "hono";
import { requestId } from "./middleware/request-id";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { authRoutes } from "./routes/auth";
import { meRoutes } from "./routes/me";
import { healthRoutes } from "./routes/health";
import { accountRoutes, institutionRoutes } from "./routes/accounts";
import { directoryRoutes } from "./routes/directory";
import { fxRoutes } from "./routes/fx";
import { transferRoutes } from "./routes/transfers";
import { transactionRoutes } from "./routes/transactions";
import { contactRoutes } from "./routes/contacts";
import { notificationRoutes } from "./routes/notifications";
import { settlementRoutes } from "./routes/settlement";
import { qrRoutes } from "./routes/qr";
import type { AppEnv } from "./app-env";

export function buildApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use(requestId);
  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  app.route("/api/v1/auth", authRoutes);
  app.route("/api/v1", meRoutes);
  app.route("/api/v1", healthRoutes);
  app.route("/api/v1/institutions", institutionRoutes);
  app.route("/api/v1/accounts", accountRoutes);
  app.route("/api/v1/directory", directoryRoutes);
  app.route("/api/v1/fx", fxRoutes);
  app.route("/api/v1/transfers", transferRoutes);
  app.route("/api/v1/transactions", transactionRoutes);
  app.route("/api/v1/contacts", contactRoutes);
  app.route("/api/v1/notifications", notificationRoutes);
  app.route("/api/v1/settlement", settlementRoutes);
  app.route("/api/v1/qr", qrRoutes);
  return app;
}
