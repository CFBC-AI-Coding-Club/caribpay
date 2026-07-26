import {
  bankBalanceResponseSchema,
  confirmDebitResponseSchema,
  creditResponseSchema,
  holdResponseSchema,
  isBankRefusal,
  outstandingHoldsResponseSchema,
  verifyAccountResponseSchema,
  type Currency,
} from "@caribpay/shared";
import { z } from "zod";
import { env } from "../env";
import { BankRefusedError, BankUnknownError, type BankConnector } from "./connector";

const errorBodySchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

/**
 * Talks to a member bank over HTTP.
 *
 * `apps/api` has no credentials for the bank's database, so this is the only
 * path to customer money. That is the whole point of the boundary — it makes
 * "the switch holds no funds" inspectable rather than asserted.
 */
export class HttpBankConnector implements BankConnector {
  constructor(
    private readonly baseUrl: string = env.bankBaseUrl,
    private readonly timeoutMs: number = env.bankTimeoutMs,
  ) {}

  private async call<T>(
    path: string,
    schema: z.ZodType<T>,
    init: { method?: string; body?: unknown; idempotencyKey?: string } = {},
  ): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (init.idempotencyKey !== undefined) {
      headers["Idempotency-Key"] = init.idempotencyKey;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: init.method ?? "GET",
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
      });
    } catch (error) {
      // No response at all. The instruction may or may not have been carried
      // out, and the caller must resolve that by re-sending — never by assuming.
      throw new BankUnknownError("The bank did not respond", error);
    } finally {
      clearTimeout(timer);
    }

    if (res.ok) {
      return schema.parse(await res.json());
    }

    let code = "BANK_ERROR";
    let message = `Bank responded ${res.status}`;
    try {
      const parsed = errorBodySchema.parse(await res.json());
      code = parsed.error.code;
      message = parsed.error.message;
    } catch {
      // Non-envelope body; keep the generic message.
    }

    // Only an explicit refusal is safe to act on. Everything else — 5xx,
    // INSTRUCTION_IN_FLIGHT, an unrecognised code — leaves the outcome unknown.
    if (isBankRefusal(code)) {
      throw new BankRefusedError(code, message);
    }
    throw new BankUnknownError(`${code}: ${message}`);
  }

  async verifyAccount(accountRef: string) {
    return await this.call("/accounts/verify", verifyAccountResponseSchema, {
      method: "POST",
      body: { accountRef },
    });
  }

  async getBalance(accountRef: string) {
    return await this.call(
      `/accounts/${encodeURIComponent(accountRef)}/balance`,
      bankBalanceResponseSchema,
    );
  }

  async placeHold(
    input: { accountRef: string; amountMinor: number; currency: Currency; reference: string },
    idempotencyKey: string,
  ) {
    return await this.call("/debits/hold", holdResponseSchema, {
      method: "POST",
      body: input,
      idempotencyKey,
    });
  }

  async confirmDebit(holdRef: string, idempotencyKey: string) {
    return await this.call(
      `/debits/${encodeURIComponent(holdRef)}/confirm`,
      confirmDebitResponseSchema,
      { method: "POST", idempotencyKey },
    );
  }

  async releaseHold(holdRef: string, idempotencyKey: string) {
    const schema = z.object({ holdRef: z.string(), released: z.literal(true) });
    const result = await this.call(
      `/debits/${encodeURIComponent(holdRef)}/release`,
      schema,
      { method: "POST", idempotencyKey },
    );
    return { released: result.released };
  }

  async postCredit(
    input: { accountRef: string; amountMinor: number; currency: Currency; reference: string },
    idempotencyKey: string,
  ) {
    return await this.call("/credits", creditResponseSchema, {
      method: "POST",
      body: input,
      idempotencyKey,
    });
  }

  async listOutstandingHolds() {
    const { holds } = await this.call(
      "/holds?status=outstanding",
      outstandingHoldsResponseSchema,
    );
    return holds;
  }
}

/**
 * One connector per member bank. Today every institution is simulated by the
 * same service, so they share a base URL; a real bank arrives as a different
 * implementation keyed by the same handle.
 */
export function connectorForInstitution(_pspHandle: string | null): BankConnector {
  return new HttpBankConnector();
}
