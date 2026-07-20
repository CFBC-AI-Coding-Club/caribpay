import { create } from "zustand";
import type { AuthTokens, User } from "@caribpay/shared";
import { clearTokens, loadTokens, saveTokens, type StoredTokens } from "@/api/storage";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  status: AuthStatus;
  tokens: StoredTokens | null;
  user: User | null;
  /** Restore tokens from secure storage on app launch. */
  hydrate: () => Promise<void>;
  signIn: (user: User, tokens: AuthTokens) => Promise<void>;
  /** Persist rotated tokens after a refresh, without touching the session user. */
  setTokens: (tokens: StoredTokens) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "loading",
  tokens: null,
  user: null,

  hydrate: async () => {
    const tokens = await loadTokens();
    set({ tokens, status: tokens === null ? "unauthenticated" : "authenticated" });
  },

  signIn: async (user, tokens) => {
    const stored: StoredTokens = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
    await saveTokens(stored);
    set({ user, tokens: stored, status: "authenticated" });
  },

  setTokens: async (tokens) => {
    await saveTokens(tokens);
    set({ tokens });
  },

  signOut: async () => {
    await clearTokens();
    set({ user: null, tokens: null, status: "unauthenticated" });
  },
}));
