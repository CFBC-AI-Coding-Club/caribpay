import { buildApp } from "./app";
import { env } from "./env";
import { createTransferWorker } from "./workers/transfer";
import { startRecoverySweeper } from "./workers/recovery";

const app = buildApp();

if (env.workerInProcess) {
  createTransferWorker();
  startRecoverySweeper();
  console.log("transfer worker + recovery sweeper running in-process");
}

console.log(`caribpay-api listening on :${env.port}`);

export default {
  port: env.port,
  fetch: app.fetch,
};
