import type { MiddlewareHandler } from "hono";
import { verify } from "hono/jwt";
import { ApiError } from "../lib/errors";
import { env } from "../env";
import type { AppEnv } from "../app-env";

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header("Authorization");
  if (header === undefined || !header.startsWith("Bearer ")) {
    throw new ApiError(401, "UNAUTHORIZED", "Missing bearer token");
  }
  let sub: unknown;
  try {
    ({ sub } = await verify(header.slice("Bearer ".length), env.jwtAccessSecret, "HS256"));
  } catch {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid or expired token");
  }
  if (typeof sub !== "string" || sub === "") {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid token subject");
  }
  c.set("userId", sub);
  await next();
};
