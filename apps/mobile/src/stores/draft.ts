import { create } from "zustand";
import type { Currency, FxQuote } from "@caribpay/shared";
import { randomId } from "@/lib/id";

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
  /**
   * Idempotency key for this draft, minted here rather than at request time so a
   * retry after a network failure replays the same request instead of posting a
   * second transfer. It is re-minted whenever the payload changes — a different
   * recipient, wallet, or amount is a different transfer — and on reset, so a
   * deliberate second send of the same amount is not mistaken for a retry.
   */
  idempotencyKey: string;

  setRecipient: (recipient: DraftRecipient | null) => void;
  setSourceCurrency: (currency: Currency) => void;
  setAmount: (amount: string) => void;
  setNote: (note: string) => void;
  setQuote: (quote: FxQuote | null) => void;
  reset: () => void;
}

/** A change to what would be sent voids both the quote and the key. */
function repriced() {
  return { quote: null, idempotencyKey: randomId() };
}

function emptyDraft() {
  return {
    recipient: null,
    sourceCurrency: null,
    amount: "0",
    note: "",
    quote: null,
    idempotencyKey: randomId(),
  };
}

/**
 * The in-flight send draft. Lives in a store rather than route params so
 * Compose → Review → Status can hand off a typed object, and so backing out of
 * Review returns to a Compose screen that still has everything filled in.
 */
export const useDraftStore = create<DraftState>((set) => ({
  ...emptyDraft(),
  setRecipient: (recipient) => set({ recipient, ...repriced() }),
  setSourceCurrency: (sourceCurrency) => set({ sourceCurrency, ...repriced() }),
  setAmount: (amount) => set({ amount, ...repriced() }),
  setNote: (note) => set({ note }),
  setQuote: (quote) => set({ quote }),
  reset: () => set({ ...emptyDraft() }),
}));
