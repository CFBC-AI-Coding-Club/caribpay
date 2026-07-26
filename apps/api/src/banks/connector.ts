import type {
  BankBalanceResponse,
  ConfirmDebitResponse,
  CreditResponse,
  Currency,
  HoldResponse,
  OutstandingHold,
  VerifyAccountResponse,
} from "@caribpay/shared";

/**
 * The switch's view of a member bank.
 *
 * This interface is the conceptual inversion at the heart of the architecture:
 * it points *outward at banks*. What used to be external — settlement — is now
 * us; what is external is the institutions that hold the money.
 *
 * Adding a real bank later means adding one implementation of this, not editing
 * the transfer service.
 */
export interface BankConnector {
  verifyAccount(accountRef: string): Promise<VerifyAccountResponse>;
  getBalance(accountRef: string): Promise<BankBalanceResponse>;

  /** Reserve funds. `idempotencyKey` must be derived, never generated. */
  placeHold(
    input: {
      accountRef: string;
      amountMinor: number;
      currency: Currency;
      reference: string;
    },
    idempotencyKey: string,
  ): Promise<HoldResponse>;

  confirmDebit(holdRef: string, idempotencyKey: string): Promise<ConfirmDebitResponse>;
  releaseHold(holdRef: string, idempotencyKey: string): Promise<{ released: true }>;

  postCredit(
    input: {
      accountRef: string;
      amountMinor: number;
      currency: Currency;
      reference: string;
    },
    idempotencyKey: string,
  ): Promise<CreditResponse>;

  /** For `reconcile`: funds still reserved with nothing driving them. */
  listOutstandingHolds(): Promise<OutstandingHold[]>;
}

/**
 * The bank definitively declined. Safe to act on: nothing happened, so the
 * reversal path may run.
 */
export class BankRefusedError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BankRefusedError";
  }
}

/**
 * We do not know what the bank did.
 *
 * A timeout, a dropped connection, a 5xx, or an instruction still executing.
 * **This must never trigger a reversal.** A credit whose outcome is unknown may
 * well have landed, and releasing the payer's hold on that assumption leaves the
 * switch short. The caller re-sends the identical instruction under the
 * identical key instead: replay makes that both the question and, if it never
 * arrived, the fix.
 */
export class BankUnknownError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "BankUnknownError";
  }
}
