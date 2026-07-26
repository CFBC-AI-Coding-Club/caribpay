import { useEffect } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  accountBalanceResponseSchema,
  accountsResponseSchema,
  authResponseSchema,
  availabilityResponseSchema,
  claimKeyResponseSchema,
  contactsResponseSchema,
  createContactResponseSchema,
  directoryKeysResponseSchema,
  fxQuoteResponseSchema,
  institutionsResponseSchema,
  linkAccountResponseSchema,
  meResponseSchema,
  notificationsPageSchema,
  qrReceiveResponseSchema,
  qrResolveResponseSchema,
  resolveResponseSchema,
  transactionsPageSchema,
  transferResponseSchema,
  unreadCountResponseSchema,
  type AccountsResponse,
  type Contact,
  type Currency,
  type FxQuote,
  type Institution,
  type LinkAccountRequest,
  type LoginRequest,
  type RegisterRequest,
  type ResolveResponse,
  type Transaction,
} from "@caribpay/shared";
import { z } from "zod";
import { apiRequest } from "./client";
import { useAuthStore } from "@/stores/auth";
import { isTerminalStatus } from "@/components/ui/Badge";

export const queryKeys = {
  me: ["me"] as const,
  accounts: ["accounts"] as const,
  accountBalance: (id: string) => ["account-balance", id] as const,
  institutions: ["institutions"] as const,
  transactions: ["transactions"] as const,
  transfer: (id: string) => ["transfer", id] as const,
  contacts: ["contacts"] as const,
  directoryKeys: ["directory-keys"] as const,
  resolve: (key: string) => ["directory-resolve", key] as const,
  availability: (vpa: string) => ["vpa-available", vpa] as const,
  qrReceive: ["qr", "receive"] as const,
  notifications: ["notifications"] as const,
  unreadCount: ["notifications", "unread"] as const,
  positions: ["settlement", "positions"] as const,
  fxQuote: (from: string, to: string, amountMinor: number) =>
    ["fx", from, to, amountMinor] as const,
};

const PAGE_SIZE = 20;

// ── Accounts ────────────────────────────────────────────────────────────────

export function useAccounts(): UseQueryResult<AccountsResponse> {
  return useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () => apiRequest("/accounts", { schema: accountsResponseSchema }),
  });
}

/**
 * A balance read live from the bank, per account.
 *
 * Deliberately one query per account rather than one for all of them: each bank
 * answers at its own speed, so each card resolves on its own instead of the
 * screen waiting for the slowest. Nothing is cached beyond the session — the
 * switch has no opinion about what someone holds, it asks.
 */
export function useAccountBalance(accountId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.accountBalance(accountId ?? ""),
    enabled: accountId !== undefined,
    queryFn: () =>
      apiRequest(`/accounts/${accountId}/balance`, { schema: accountBalanceResponseSchema }),
    select: (data) => data.balance,
    staleTime: 0,
    retry: 1,
  });
}

export function useInstitutions(): UseQueryResult<Institution[]> {
  return useQuery({
    queryKey: queryKeys.institutions,
    queryFn: () => apiRequest("/institutions", { schema: institutionsResponseSchema }),
    select: (data) => data.institutions,
    staleTime: 60 * 60 * 1000,
  });
}

export function useLinkAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LinkAccountRequest) =>
      apiRequest("/accounts", {
        method: "POST",
        body: input,
        schema: linkAccountResponseSchema,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
      void queryClient.invalidateQueries({ queryKey: queryKeys.qrReceive });
    },
  });
}

// ── Directory ───────────────────────────────────────────────────────────────

/** Confirm who you are about to pay, before any amount is entered. */
export function useResolveKey(key: string, enabled: boolean): UseQueryResult<ResolveResponse> {
  return useQuery({
    queryKey: queryKeys.resolve(key),
    enabled: enabled && key.trim().length >= 3,
    queryFn: () =>
      apiRequest(`/directory/resolve?key=${encodeURIComponent(key.trim())}`, {
        schema: resolveResponseSchema,
      }),
    retry: false,
  });
}

export function useVpaAvailability(vpa: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.availability(vpa),
    enabled: enabled && vpa.trim().length >= 3,
    queryFn: () =>
      apiRequest(`/directory/available?vpa=${encodeURIComponent(vpa.trim())}`, {
        schema: availabilityResponseSchema,
      }),
    retry: false,
  });
}

export function useDirectoryKeys() {
  return useQuery({
    queryKey: queryKeys.directoryKeys,
    queryFn: () => apiRequest("/directory/keys", { schema: directoryKeysResponseSchema }),
    select: (data) => data.keys,
  });
}

export function useClaimKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { type: "vpa" | "phone" | "email"; value: string; makePrimary?: boolean }) =>
      apiRequest("/directory/keys", {
        method: "POST",
        body: input,
        schema: claimKeyResponseSchema,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.directoryKeys });
      void queryClient.invalidateQueries({ queryKey: queryKeys.qrReceive });
    },
  });
}

export function useVerifyKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, code }: { id: string; code: string }) =>
      apiRequest<void>(`/directory/keys/${id}/verify`, { method: "POST", body: { code } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.directoryKeys });
    },
  });
}

export function useReleaseKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<void>(`/directory/keys/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.directoryKeys });
      void queryClient.invalidateQueries({ queryKey: queryKeys.qrReceive });
    },
  });
}

// ── Transfers ───────────────────────────────────────────────────────────────

export function useTransactions() {
  const query = useInfiniteQuery({
    queryKey: queryKeys.transactions,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiRequest(
        `/transactions?limit=${PAGE_SIZE}${pageParam === undefined ? "" : `&cursor=${pageParam}`}`,
        { schema: transactionsPageSchema },
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  return {
    ...query,
    items: query.data?.pages.flatMap((page) => page.items) ?? [],
  };
}

/** Polls until the saga reaches a terminal state, then stops. */
export function useTransfer(id: string): UseQueryResult<Transaction> {
  return useQuery({
    queryKey: queryKeys.transfer(id),
    queryFn: () =>
      apiRequest(`/transfers/${id}`, { schema: transferResponseSchema }),
    select: (data) => data.transaction,
    refetchInterval: (q) => {
      const status = q.state.data?.transaction.status;
      return status !== undefined && isTerminalStatus(status) ? false : 1500;
    },
  });
}

export interface CreateTransferInput {
  toKey: string;
  sourceAccountId: string;
  sourceCurrency: Currency;
  destCurrency: Currency;
  sourceAmountMinor: number;
  note?: string;
  quoteId?: string;
  /**
   * Supplied by the caller, not minted here: a key generated inside the
   * mutation would be different on every retry, so a retry after a network
   * failure would post a second transfer instead of replaying the first.
   */
  idempotencyKey: string;
}

export function useCreateTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ idempotencyKey, ...body }: CreateTransferInput) => {
      const { transaction } = await apiRequest("/transfers", {
        method: "POST",
        body,
        idempotencyKey,
        schema: transferResponseSchema,
      });
      return transaction;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
      void queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
    },
  });
}

// ── Notifications ───────────────────────────────────────────────────────────

/**
 * Poll the unread count while the app is foregrounded.
 *
 * Only the *count* is polled: invalidating balances on every tick would have
 * the whole app hammering the banks. An actual arrival is what triggers a
 * refresh, in `useArrivalWatcher`.
 */
export function useUnreadCount(enabled = true) {
  return useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn: () =>
      apiRequest("/notifications/unread-count", { schema: unreadCountResponseSchema }),
    select: (data) => data.unread,
    refetchInterval: enabled ? 5000 : false,
    enabled,
  });
}

export function useNotifications() {
  const query = useInfiniteQuery({
    queryKey: queryKeys.notifications,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiRequest(
        `/notifications?limit=${PAGE_SIZE}${pageParam === undefined ? "" : `&cursor=${pageParam}`}`,
        { schema: notificationsPageSchema },
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  return { ...query, items: query.data?.pages.flatMap((p) => p.items) ?? [] };
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<void>("/notifications/read-all", { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.unreadCount });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
    },
  });
}

/**
 * When the unread count rises, money has probably arrived: refresh the things
 * that would have changed, exactly once, rather than on every poll.
 */
export function useArrivalWatcher(unread: number | undefined): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (unread === undefined || unread === 0) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
    void queryClient.invalidateQueries({ queryKey: ["account-balance"] });
  }, [unread, queryClient]);
}

// ── Settlement ──────────────────────────────────────────────────────────────

const positionsResponseSchema = z.object({
  positions: z.array(
    z.object({
      institutionId: z.string(),
      institutionDisplayName: z.string(),
      pspHandle: z.string().nullable(),
      currency: z.string(),
      positionMinor: z.number().int(),
      debitCapMinor: z.number().int().nullable(),
    }),
  ),
  fxBook: z.array(z.object({ currency: z.string(), positionMinor: z.number().int() })),
});

export function usePositions() {
  return useQuery({
    queryKey: queryKeys.positions,
    queryFn: () => apiRequest("/settlement/positions", { schema: positionsResponseSchema }),
  });
}

// ── Contacts, QR, FX, auth ──────────────────────────────────────────────────

export function useContacts(): UseQueryResult<Contact[]> {
  return useQuery({
    queryKey: queryKeys.contacts,
    queryFn: () => apiRequest("/contacts", { schema: contactsResponseSchema }),
    select: (data) => data.contacts,
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { key: string; displayName: string; pinned?: boolean }) =>
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

export function useQrReceive() {
  return useQuery({
    queryKey: queryKeys.qrReceive,
    queryFn: () => apiRequest("/qr/receive", { schema: qrReceiveResponseSchema }),
    retry: false,
  });
}

export function useResolveQr() {
  return useMutation({
    mutationFn: (payload: string) =>
      apiRequest(`/qr/resolve?payload=${encodeURIComponent(payload)}`, {
        schema: qrResolveResponseSchema,
      }),
  });
}

export function useFxQuote(
  from: Currency,
  to: Currency,
  amountMinor: number,
): UseQueryResult<FxQuote> {
  return useQuery({
    queryKey: queryKeys.fxQuote(from, to, amountMinor),
    enabled: from !== to && amountMinor > 0,
    queryFn: () =>
      apiRequest(`/fx/quote?from=${from}&to=${to}&amountMinor=${amountMinor}`, {
        schema: fxQuoteResponseSchema,
      }),
    select: (data) => data.quote,
  });
}

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiRequest("/me", { schema: meResponseSchema }),
  });
}

export function useRegister() {
  const signIn = useAuthStore((s) => s.signIn);
  return useMutation({
    mutationFn: (input: RegisterRequest) =>
      apiRequest("/auth/register", {
        method: "POST",
        body: input,
        auth: false,
        schema: authResponseSchema,
      }),
    onSuccess: async (data) => {
      await signIn(data.user, data.tokens);
    },
  });
}

export function useLogin() {
  const signIn = useAuthStore((s) => s.signIn);
  return useMutation({
    mutationFn: (input: LoginRequest) =>
      apiRequest("/auth/login", {
        method: "POST",
        body: input,
        auth: false,
        schema: authResponseSchema,
      }),
    onSuccess: async (data) => {
      await signIn(data.user, data.tokens);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const signOut = useAuthStore((s) => s.signOut);
  const tokens = useAuthStore((s) => s.tokens);
  return useMutation({
    mutationFn: async () => {
      if (tokens !== null) {
        await apiRequest("/auth/logout", {
          method: "POST",
          body: { refreshToken: tokens.refreshToken },
        }).catch(() => undefined);
      }
    },
    onSettled: async () => {
      await signOut();
      queryClient.clear();
    },
  });
}
