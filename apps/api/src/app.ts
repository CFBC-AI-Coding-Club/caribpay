import { Hono } from "hono";
import { requestId } from "./middleware/request-id";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { authRoutes } from "./routes/auth";
import { meRoutes } from "./routes/me";
import { healthRoutes } from "./routes/health";
import { walletRoutes } from "./routes/wallets";
import { fxRoutes } from "./routes/fx";
import type { AppEnv } from "./app-env";

export function buildApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use(requestId);
  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  app.route("/api/v1/auth", authRoutes);
  app.route("/api/v1", meRoutes);
  app.route("/api/v1", healthRoutes);
  app.route("/api/v1/wallets", walletRoutes);
  app.route("/api/v1/fx", fxRoutes);
  return app;
}
