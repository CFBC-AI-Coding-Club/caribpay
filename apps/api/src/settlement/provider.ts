import type { Currency } from "@caribpay/shared";

export interface SettlementRequest {
  transactionId: string;
  sourceCurrency: Currency;
  destCurrency: Currency;
  sourceAmountMinor: number;
  destAmountMinor: number;
}

export interface SettlementProvider {
  /** Submit a transfer for inter-institution settlement. Resolves when accepted, not settled. */
  submit(tx: SettlementRequest): Promise<{ providerRef: string }>;
  /** Called by the worker to check/complete settlement. */
  poll(providerRef: string): Promise<"pending" | "settled" | "failed">;
}
