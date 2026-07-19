import { buildApp } from "./app";
import { env } from "./env";

const app = buildApp();

console.log(`caribpay-api listening on :${env.port}`);

export default {
  port: env.port,
  fetch: app.fetch,
};
