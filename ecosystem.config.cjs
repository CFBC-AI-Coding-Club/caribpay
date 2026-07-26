// pm2 process definitions for the CaribPay VPS.
// The API and the settlement worker run as separate processes: the API sets
// WORKER_IN_PROCESS=false so it does not also spin up an in-process worker.
//
// pm2 runs each script through Bun via `interpreter`. Bun must be on the deploy
// user's PATH (installed at ~/.bun/bin/bun); adjust the interpreter path if not.
const BUN = process.env.BUN_PATH || `${process.env.HOME}/.bun/bin/bun`;

module.exports = {
  apps: [
    {
      // The simulated member banks. The API reaches customer accounts only
      // over HTTP through this service, and has no credentials for its
      // database — that boundary is the claim that we hold no funds.
      name: "caribpay-mock-bank",
      script: "apps/mock-bank/src/index.ts",
      interpreter: BUN,
      env: {
        NODE_ENV: "production",
        BANK_PORT: "3100",
      },
      max_restarts: 10,
      restart_delay: 2000,
    },
    {
      name: "caribpay-api",
      script: "apps/api/src/index.ts",
      interpreter: BUN,
      env: {
        NODE_ENV: "production",
        WORKER_IN_PROCESS: "false",
      },
      max_restarts: 10,
      restart_delay: 2000,
    },
    {
      name: "caribpay-worker",
      script: "apps/api/src/workers/index.ts",
      interpreter: BUN,
      env: {
        NODE_ENV: "production",
      },
      max_restarts: 10,
      restart_delay: 2000,
    },
  ],
};
