import { buildBankApp } from "./app";
import { env } from "./env";

const app = buildBankApp();

console.log(`caribpay-mock-bank listening on :${env.port}`);

export default {
  port: env.port,
  fetch: app.fetch,
};
