import { create } from "zustand";
import type { Currency, FxQuote } from "@caribpay/shared";

/** Who the money is going to. Resolved from a contact, a typed address, or a QR scan. */
export interface DraftRecipient {
  address: string;
  displayName: string;
  countryCode: string;
  /**
   * The recipient wallet's currency. The API requires the transfer's
   * destCurrency to match it, so this — not a user choice — decides what they
   * receive.
   */
  currency: Currency;
}

interface DraftState {
  recipient: DraftRecipient | null;
  sourceCurrency: Currency | null;
  /** Amount as typed, in major units (e.g. "250.50"). Never a float. */
  amount: string;
  note: string;
  /** The quote the user reviewed, so we can send its id and detect drift. */
  quote: FxQuote | null;

  setRecipient: (recipient: DraftRecipient | null) => void;
  setSourceCurrency: (currency: Currency) => void;
  setAmount: (amount: string) => void;
  setNote: (note: string) => void;
  setQuote: (quote: FxQuote | null) => void;
  reset: () => void;
}

const EMPTY = {
  recipient: null,
  sourceCurrency: null,
  amount: "0",
  note: "",
  quote: null,
} as const;

/**
 * The in-flight send draft. Lives in a store rather than route params so
 * Compose → Review → Status can hand off a typed object, and so backing out of
 * Review returns to a Compose screen that still has everything filled in.
 */
export const useDraftStore = create<DraftState>((set) => ({
  ...EMPTY,
  setRecipient: (recipient) => set({ recipient, quote: null }),
  setSourceCurrency: (sourceCurrency) => set({ sourceCurrency, quote: null }),
  setAmount: (amount) => set({ amount, quote: null }),
  setNote: (note) => set({ note }),
  setQuote: (quote) => set({ quote }),
  reset: () => set({ ...EMPTY }),
}));
