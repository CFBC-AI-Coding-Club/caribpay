import { buildApp } from "./app";
import { env } from "./env";
import { createSettlementWorker } from "./workers/settlement";

const app = buildApp();

if (env.workerInProcess) {
  createSettlementWorker();
  console.log("settlement worker running in-process");
}

console.log(`caribpay-api listening on :${env.port}`);

export default {
  port: env.port,
  fetch: app.fetch,
};
