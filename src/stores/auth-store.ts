"use client";

import { create } from "zustand";

import {
  authErrorMessage,
  clearStoredAuth,
  isAuthError,
  loadStoredAuth,
  login as apiLogin,
  logout as apiLogout,
  saveStoredAuth,
  signup as apiSignup,
} from "@/lib/auth/client";
import { getSupabase, isSupabaseEnabled } from "@/lib/supabase/client";

interface AuthStore {
  userId: string | null;
  username: string | null;
  token: string | null;
  /** "password" = PartyKit username/password DO. "google" = Supabase OAuth. */
  provider: "password" | "google" | null;
  loading: boolean;
  error: string | null;
  /** Hydrate from localStorage + Supabase session on app boot. */
  hydrate: () => Promise<void>;
  signup: (username: string, password: string) => Promise<boolean>;
  login: (username: string, password: string) => Promise<boolean>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

function deriveUsernameFromEmail(email: string | undefined): string {
  if (!email) return "user";
  const prefix = email.split("@")[0] ?? "user";
  // Sanitize to username rules (3-20, alnum + _)
  const cleaned = prefix.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 20);
  return cleaned.length >= 3 ? cleaned : `g_${cleaned}`;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  userId: null,
  username: null,
  token: null,
  provider: null,
  loading: false,
  error: null,

  hydrate: async () => {
    // 1. Restore PartyKit username/password session from localStorage.
    const stored = loadStoredAuth();
    if (stored) {
      set({ userId: stored.username, username: stored.username, token: stored.token, provider: "password" });
      return;
    }

    // 2. Otherwise check for a live Supabase OAuth session.
    const supabase = getSupabase();
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (session?.user) {
      const username = deriveUsernameFromEmail(session.user.email ?? undefined);
      set({
        userId: session.user.id,
        username,
        token: session.access_token,
        provider: "google",
      });
    }

    // 3. Subscribe to future Supabase auth state changes.
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        const username = deriveUsernameFromEmail(session.user.email ?? undefined);
        set({
          userId: session.user.id,
          username,
          token: session.access_token,
          provider: "google",
          error: null,
        });
      } else if (event === "SIGNED_OUT") {
        if (get().provider === "google") {
          set({ userId: null, username: null, token: null, provider: null });
        }
      }
    });
  },

  signup: async (username, password) => {
    set({ loading: true, error: null });
    const res = await apiSignup(username, password);
    if (isAuthError(res)) {
      set({ loading: false, error: authErrorMessage(res.error) });
      return false;
    }
    saveStoredAuth({ username: res.username, token: res.token });
    set({ userId: res.username, username: res.username, token: res.token, provider: "password", loading: false, error: null });
    return true;
  },

  login: async (username, password) => {
    set({ loading: true, error: null });
    const res = await apiLogin(username, password);
    if (isAuthError(res)) {
      set({ loading: false, error: authErrorMessage(res.error) });
      return false;
    }
    saveStoredAuth({ username: res.username, token: res.token });
    set({ userId: res.username, username: res.username, token: res.token, provider: "password", loading: false, error: null });
    return true;
  },

  signInWithGoogle: async () => {
    const supabase = getSupabase();
    if (!supabase) {
      set({ error: "Google вход не настроен — добавь Supabase ключи в .env" });
      return;
    }
    set({ loading: true, error: null });
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: typeof window !== "undefined" ? `${window.location.origin}/` : undefined,
      },
    });
    if (error) {
      set({ loading: false, error: `Google: ${error.message}` });
    }
    // On success, Supabase redirects to Google, then back. The hydrate listener picks up.
  },

  logout: async () => {
    const { token, provider } = get();
    if (provider === "password" && token) {
      await apiLogout(token);
      clearStoredAuth();
    } else if (provider === "google") {
      const supabase = getSupabase();
      if (supabase) await supabase.auth.signOut();
    }
    set({ userId: null, username: null, token: null, provider: null, error: null });
  },

  clearError: () => set({ error: null }),
}));

export { isSupabaseEnabled };
