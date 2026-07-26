import { create } from "zustand";
import type { Currency, FxQuote, ResolveResponse } from "@caribpay/shared";
import { randomId } from "@/lib/id";

/**
 * Who the money is going to, as the directory reported them — narrowed to
 * someone who can actually be paid.
 *
 * The confirm screen is the only way into the amount screen and it only lets a
 * payable recipient through, so the currency and institution are known from
 * here on. Encoding that in the type keeps every downstream screen from
 * re-checking a condition that cannot be false.
 */
export type DraftRecipient = ResolveResponse & {
  payable: true;
  currency: Currency;
  institutionDisplayName: string;
};

/** Narrow a resolution to a payable recipient, or null. */
export function asPayable(resolved: ResolveResponse): DraftRecipient | null {
  if (!resolved.payable || resolved.currency === null || resolved.institutionDisplayName === null) {
    return null;
  }
  return resolved as DraftRecipient;
}

interface DraftState {
  recipient: DraftRecipient | null;
  /** Which of the payer's accounts funds this. Never inferred by the server. */
  sourceAccountId: string | null;
  sourceCurrency: Currency | null;
  /** Amount as typed, in major units (e.g. "250.50"). Never a float. */
  amount: string;
  note: string;
  /** The quote the user reviewed, so we can send its id and detect drift. */
  quote: FxQuote | null;
  /**
   * Idempotency key for this draft, minted here rather than at request time so a
   * retry after a network failure replays the same request instead of posting a
   * second transfer. Re-minted whenever the payload changes, and on reset, so a
   * deliberate second send of the same amount is not mistaken for a retry.
   */
  idempotencyKey: string;

  setRecipient: (recipient: DraftRecipient | null) => void;
  setSourceAccount: (accountId: string, currency: Currency) => void;
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
    sourceAccountId: null,
    sourceCurrency: null,
    amount: "0",
    note: "",
    quote: null,
    idempotencyKey: randomId(),
  };
}

/**
 * The in-flight send draft. Lives in a store rather than route params so
 * Recipient → Confirm → Amount → Review can hand off a typed object, and so
 * backing out returns to a screen that still has everything filled in.
 */
export const useDraftStore = create<DraftState>((set) => ({
  ...emptyDraft(),
  setRecipient: (recipient) => set({ recipient, ...repriced() }),
  setSourceAccount: (sourceAccountId, sourceCurrency) =>
    set({ sourceAccountId, sourceCurrency, ...repriced() }),
  setAmount: (amount) => set({ amount, ...repriced() }),
  setNote: (note) => set({ note }),
  setQuote: (quote) => set({ quote }),
  reset: () => set({ ...emptyDraft() }),
}));
