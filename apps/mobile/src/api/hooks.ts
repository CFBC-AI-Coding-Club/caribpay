import { useEffect } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  addressLookupResponseSchema,
  authResponseSchema,
  contactsResponseSchema,
  createContactResponseSchema,
  createWalletResponseSchema,
  fxQuoteResponseSchema,
  meResponseSchema,
  qrReceiveResponseSchema,
  qrResolveResponseSchema,
  transactionsPageSchema,
  transferResponseSchema,
  walletsResponseSchema,
  type AddressLookupResponse,
  type Contact,
  type Currency,
  type FxQuote,
  type LoginRequest,
  type RegisterRequest,
  type Transaction,
  type WalletsResponse,
  WALLET_ADDRESS_PATTERN,
} from "@caribpay/shared";
import { apiRequest } from "./client";
import { useAuthStore } from "@/stores/auth";
import { randomId } from "@/lib/id";

export const queryKeys = {
  me: ["me"] as const,
  wallets: ["wallets"] as const,
  transactions: ["transactions"] as const,
  walletTransactions: (walletId: string) => ["wallet-transactions", walletId] as const,
  transfer: (id: string) => ["transfer", id] as const,
  contacts: ["contacts"] as const,
  addressLookup: (address: string) => ["address-lookup", address] as const,
  qrReceive: (currency?: string) => ["qr", "receive", currency ?? "home"] as const,
  fxQuote: (from: string, to: string, amountMinor: number) =>
    ["fx", from, to, amountMinor] as const,
};

const PAGE_SIZE = 20;

const TERMINAL_STATUSES: ReadonlySet<Transaction["status"]> = new Set(["settled", "failed"]);

export function useWallets(): UseQueryResult<WalletsResponse> {
  return useQuery({
    queryKey: queryKeys.wallets,
    queryFn: () => apiRequest("/wallets", { schema: walletsResponseSchema }),
  });
}

/** Cursor-paginated feed across every wallet. Powers the Transfers tab. */
export function useTransactions() {
  return useInfiniteQuery({
    queryKey: queryKeys.transactions,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiRequest(
        `/transactions?limit=${PAGE_SIZE}${pageParam === undefined ? "" : `&cursor=${pageParam}`}`,
        { schema: transactionsPageSchema },
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    select: (data) => data.pages.flatMap((page) => page.items),
  });
}

/** Same feed, scoped to one wallet — includes `walletDeltaMinor` per row. */
export function useWalletTransactions(walletId: string | undefined) {
  return useInfiniteQuery({
    queryKey: queryKeys.walletTransactions(walletId ?? ""),
    enabled: walletId !== undefined && walletId !== "",
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiRequest(
        `/wallets/${walletId}/transactions?limit=${PAGE_SIZE}${
          pageParam === undefined ? "" : `&cursor=${pageParam}`
        }`,
        { schema: transactionsPageSchema },
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    select: (data) => data.pages.flatMap((page) => page.items),
  });
}

/** Transfer detail. While the transfer is non-terminal, poll every 2s. */
export function useTransfer(id: string): UseQueryResult<Transaction> {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.transfer(id),
    queryFn: async () => {
      const { transaction } = await apiRequest(`/transfers/${id}`, {
        schema: transferResponseSchema,
      });
      return transaction;
    },
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status !== undefined && TERMINAL_STATUSES.has(status) ? false : 2000;
    },
  });

  // Settlement posts the credit leg, so balances and the feed are both stale the
  // moment this transfer reaches a terminal state.
  const status = query.data?.status;
  const settled = status !== undefined && TERMINAL_STATUSES.has(status);
  useEffect(() => {
    if (!settled) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.wallets });
    void queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
  }, [settled, queryClient]);

  return query;
}

export function useContacts(): UseQueryResult<Contact[]> {
  return useQuery({
    queryKey: queryKeys.contacts,
    queryFn: async () => {
      const { contacts } = await apiRequest("/contacts", { schema: contactsResponseSchema });
      return contacts;
    },
  });
}

export function useQrReceive(currency?: Currency) {
  return useQuery({
    queryKey: queryKeys.qrReceive(currency),
    queryFn: () =>
      apiRequest(currency === undefined ? "/qr/receive" : `/qr/receive?currency=${currency}`, {
        schema: qrReceiveResponseSchema,
      }),
  });
}

/** Live FX quote; disabled until a positive amount and two distinct currencies. */
export function useFxQuote(
  from: Currency,
  to: Currency,
  amountMinor: number,
): UseQueryResult<FxQuote> {
  return useQuery({
    queryKey: queryKeys.fxQuote(from, to, amountMinor),
    enabled: amountMinor > 0 && from !== to,
    queryFn: async () => {
      const { quote } = await apiRequest(
        `/fx/quote?from=${from}&to=${to}&amountMinor=${amountMinor}`,
        { schema: fxQuoteResponseSchema },
      );
      return quote;
    },
  });
}

export function useRegister() {
  const signIn = useAuthStore((s) => s.signIn);
  return useMutation({
    mutationFn: (body: RegisterRequest) =>
      apiRequest("/auth/register", { method: "POST", body, auth: false, schema: authResponseSchema }),
    onSuccess: async ({ user, tokens }) => {
      await signIn(user, tokens);
    },
  });
}

export function useLogin() {
  const signIn = useAuthStore((s) => s.signIn);
  return useMutation({
    mutationFn: (body: LoginRequest) =>
      apiRequest("/auth/login", { method: "POST", body, auth: false, schema: authResponseSchema }),
    onSuccess: async ({ user, tokens }) => {
      await signIn(user, tokens);
    },
  });
}

export function useLogout() {
  const { signOut, tokens } = useAuthStore.getState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (tokens !== null) {
        // Best-effort revoke; local sign-out proceeds regardless.
        await apiRequest("/auth/logout", {
          method: "POST",
          body: { refreshToken: tokens.refreshToken },
        }).catch(() => undefined);
      }
    },
    onSuccess: async () => {
      await signOut();
      queryClient.clear();
    },
  });
}

export interface CreateTransferInput {
  recipientAddress: string;
  sourceCurrency: Currency;
  destCurrency: Currency;
  sourceAmountMinor: number;
  note?: string;
  quoteId?: string;
}

export function useCreateTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTransferInput) => {
      const { transaction } = await apiRequest("/transfers", {
        method: "POST",
        body: input,
        idempotencyKey: randomId(),
        schema: transferResponseSchema,
      });
      return transaction;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallets });
      void queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
    },
  });
}

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiRequest("/me", { schema: meResponseSchema }),
  });
}

/** Open a wallet in an additional currency. */
export function useCreateWallet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (currency: Currency) => {
      const { wallet } = await apiRequest("/wallets", {
        method: "POST",
        body: { currency },
        schema: createWalletResponseSchema,
      });
      return wallet;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallets });
    },
  });
}

/**
 * Who owns a wallet address. Enabled only for well-formed addresses so we don't
 * fire a request on every keystroke of a partially typed one.
 */
export function useAddressLookup(
  address: string,
  enabled = true,
): UseQueryResult<AddressLookupResponse> {
  const complete = WALLET_ADDRESS_PATTERN.test(address);
  return useQuery({
    queryKey: queryKeys.addressLookup(address),
    enabled: enabled && complete,
    retry: false,
    queryFn: () =>
      apiRequest(`/wallets/lookup?address=${encodeURIComponent(address)}`, {
        schema: addressLookupResponseSchema,
      }),
  });
}

/** Verify a scanned `caribpay://pay?...` payload's signature and resolve it. */
export function useResolveQr() {
  return useMutation({
    mutationFn: (payload: string) =>
      apiRequest(`/qr/resolve?payload=${encodeURIComponent(payload)}`, {
        schema: qrResolveResponseSchema,
      }),
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { walletAddress: string; displayName: string; pinned: boolean }) =>
      apiRequest("/contacts", {
        method: "POST",
        body: input,
        schema: createContactResponseSchema,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.contacts });
    },
  });
}
