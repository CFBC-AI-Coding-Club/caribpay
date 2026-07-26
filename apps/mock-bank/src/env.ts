function intFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return value !== undefined && value !== "" && Number.isFinite(parsed) ? parsed : fallback;
}

function floatFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return value !== undefined && value !== "" && Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  port: intFromEnv(process.env.BANK_PORT, 3100),
  /**
   * Simulated processing time, so the switch's saga is exercised against a rail
   * that does not answer instantly. Set both to 0 in tests.
   */
  latencyMinMs: intFromEnv(process.env.MOCK_BANK_LATENCY_MIN_MS, 300),
  latencyMaxMs: intFromEnv(process.env.MOCK_BANK_LATENCY_MAX_MS, 1200),
  /** Probability in [0,1] that a mutating call fails. Off for demos. */
  failureRate: floatFromEnv(process.env.MOCK_BANK_FAILURE_RATE, 0),
  /** How long a hold survives without confirmation before the bank releases it. */
  holdTtlSeconds: intFromEnv(process.env.MOCK_BANK_HOLD_TTL_SECONDS, 300),
};
