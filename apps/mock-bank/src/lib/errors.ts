import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * A bank's answer when it declines an instruction. The `code` matters as much as
 * the status: the switch treats the codes in `BANK_REFUSAL_CODES` as definitive
 * ("this did not happen") and everything else as unknown.
 */
export class BankError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
