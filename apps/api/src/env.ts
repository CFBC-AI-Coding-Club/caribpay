function intFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return value !== undefined && value !== "" && Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  port: intFromEnv(process.env.PORT, 3000),
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? "dev-only-access-secret-not-for-production",
  accessTokenTtlSeconds: intFromEnv(process.env.ACCESS_TOKEN_TTL_SECONDS, 900),
  refreshTokenTtlDays: intFromEnv(process.env.REFRESH_TOKEN_TTL_DAYS, 30),
  qrHmacSecret: process.env.QR_HMAC_SECRET ?? "dev-only-qr-secret-not-for-production",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  /** The mock member-bank service. The only route to customer accounts. */
  bankBaseUrl: process.env.BANK_BASE_URL ?? "http://localhost:3100",
  /**
   * How long to wait for a bank. Past this the outcome is unknown, which is a
   * different thing from a failure — see BankUnknownError.
   */
  bankTimeoutMs: intFromEnv(process.env.BANK_TIMEOUT_MS, 10000),
  /** Dev runs the settlement worker inside the api process; pm2 runs it separately. */
  workerInProcess: process.env.WORKER_IN_PROCESS !== "false",
};
