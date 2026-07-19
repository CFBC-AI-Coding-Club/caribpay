/**
 * Structural checks against Bun.sql's PostgresError (errno = SQLSTATE,
 * constraint = violated constraint name), walking the cause chain because
 * drizzle wraps driver errors.
 */
function findPgError(
  error: unknown,
  sqlstate: string,
  constraint?: string,
): boolean {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    const candidate = e as { errno?: unknown; constraint?: unknown };
    if (
      String(candidate.errno) === sqlstate &&
      (constraint === undefined || candidate.constraint === constraint)
    ) {
      return true;
    }
  }
  return false;
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  return findPgError(error, "23505", constraint);
}

export function isCheckViolation(error: unknown, constraint?: string): boolean {
  return findPgError(error, "23514", constraint);
}
