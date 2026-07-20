import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  authResponseSchema,
  contactsResponseSchema,
  createContactResponseSchema,
  fxQuoteResponseSchema,
  meResponseSchema,
  qrReceiveResponseSchema,
  transactionsPageSchema,
  transferResponseSchema,
  walletsResponseSchema,
  type Contact,
  type Currency,
  type FxQuote,
  type LoginRequest,
  type RegisterRequest,
  type Transaction,
  type TransactionsPage,
  type WalletsResponse,
} from "@caribpay/shared";
import { apiRequest } from "./client";
import { useAuthStore } from "@/stores/auth";
import { randomId } from "@/lib/id";

export const queryKeys = {
  wallets: ["wallets"] as const,
  transactions: ["transactions"] as const,
  transfer: (id: string) => ["transfer", id] as const,
  contacts: ["contacts"] as const,
  qrReceive: (currency?: string) => ["qr", "receive", currency ?? "home"] as const,
  fxQuote: (from: string, to: string, amountMinor: number) =>
    ["fx", from, to, amountMinor] as const,
};

const TERMINAL_STATUSES: ReadonlySet<Transaction["status"]> = new Set(["settled", "failed"]);

export function useWallets(): UseQueryResult<WalletsResponse> {
  return useQuery({
    queryKey: queryKeys.wallets,
    queryFn: () => apiRequest("/wallets", { schema: walletsResponseSchema }),
  });
}

export function useTransactions(): UseQueryResult<TransactionsPage> {
  return useQuery({
    queryKey: queryKeys.transactions,
    queryFn: () => apiRequest("/transactions?limit=20", { schema: transactionsPageSchema }),
  });
}

/** Transfer detail. While the transfer is non-terminal, poll every 2s. */
export function useTransfer(id: string): UseQueryResult<Transaction> {
  return useQuery({
    queryKey: queryKeys.transfer(id),
    queryFn: async () => {
      const { transaction } = await apiRequest(`/transfers/${id}`, {
        schema: transferResponseSchema,
      });
      return transaction;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status !== undefined && TERMINAL_STATUSES.has(status) ? false : 2000;
    },
  });
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
    queryKey: ["me"] as const,
    queryFn: () => apiRequest("/me", { schema: meResponseSchema }),
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { walletAddress: string; displayName: string }) =>
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
