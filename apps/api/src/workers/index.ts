// Standalone settlement worker entry for production (pm2: caribpay-worker).
import { createSettlementWorker } from "./settlement";

const worker = createSettlementWorker();
console.log("caribpay settlement worker started");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void worker.close().then(() => process.exit(0));
  });
}
