import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../app-env";

export const requestId: MiddlewareHandler<AppEnv> = async (c, next) => {
  const id = c.req.header("X-Request-Id") ?? crypto.randomUUID();
  c.set("requestId", id);
  c.header("X-Request-Id", id);
  await next();
};
