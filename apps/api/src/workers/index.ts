import { createTransferWorker } from "./transfer";
import { startRecoverySweeper } from "./recovery";

createTransferWorker();
startRecoverySweeper();
console.log("caribpay transfer worker + recovery sweeper running");
