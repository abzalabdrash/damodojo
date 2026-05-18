"use client";

import { useState } from "react";
import { Loader2, UserPlus, LogIn, X } from "lucide-react";
import { useAuthStore, isSupabaseEnabled } from "@/stores/auth-store";
import { cn } from "@/lib/utils";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  /** Optional initial mode. Default: "login". */
  initialMode?: "login" | "signup";
}

export function AuthModal({ open, onClose, initialMode = "login" }: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const signup = useAuthStore((s) => s.signup);
  const login = useAuthStore((s) => s.login);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const clearError = useAuthStore((s) => s.clearError);
  const googleEnabled = isSupabaseEnabled();

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const fn = mode === "login" ? login : signup;
    const ok = await fn(username.trim(), password);
    if (ok) {
      setUsername("");
      setPassword("");
      onClose();
    }
  }

  function switchMode(next: "login" | "signup") {
    setMode(next);
    clearError();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-[color:var(--border-base)] bg-[color:var(--bg-surface)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-[color:var(--text-primary)]">
            {mode === "login" ? "Войти в DamaDojo" : "Создать аккаунт"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-xs text-[color:var(--text-muted)]">
          Гости играют как есть. Аккаунт нужен для архива партий, личных задач и отчёта.
        </p>

        {googleEnabled && (
          <>
            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={loading}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-md border border-[color:var(--border-base)] bg-[color:var(--bg-elevated)] px-4 py-2.5 text-sm font-medium text-[color:var(--text-primary)] transition-colors hover:bg-[color:var(--bg-page)] disabled:opacity-60"
            >
              <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden>
                <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
                <path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
                <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
                <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
              </svg>
              Войти с Google
            </button>
            <div className="mb-3 flex items-center gap-3">
              <div className="h-px flex-1 bg-[color:var(--border-base)]" />
              <span className="text-[10px] uppercase tracking-wider text-[color:var(--text-muted)]">
                или
              </span>
              <div className="h-px flex-1 bg-[color:var(--border-base)]" />
            </div>
          </>
        )}

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[color:var(--text-muted)]">
              Юзернейм
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete={mode === "login" ? "username" : "username"}
              required
              minLength={3}
              maxLength={20}
              pattern="[a-zA-Z0-9_]{3,20}"
              placeholder="dama_master"
              className="w-full rounded-md border border-[color:var(--border-base)] bg-[color:var(--bg-elevated)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[color:var(--text-muted)]">
              Пароль
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={6}
              placeholder="минимум 6 символов"
              className="w-full rounded-md border border-[color:var(--border-base)] bg-[color:var(--bg-elevated)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
            />
          </div>

          {error && (
            <div className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-md bg-[color:var(--accent)] px-4 py-2.5 text-sm font-semibold text-[#1A1408] transition-colors hover:bg-[color:var(--accent)]/90 disabled:opacity-60",
            )}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === "login" ? (
              <LogIn className="h-4 w-4" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            {mode === "login" ? "Войти" : "Создать аккаунт"}
          </button>
        </form>

        <div className="mt-4 text-center text-xs text-[color:var(--text-muted)]">
          {mode === "login" ? (
            <>
              Нет аккаунта?{" "}
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className="text-[color:var(--accent)] underline-offset-2 hover:underline"
              >
                Зарегистрироваться
              </button>
            </>
          ) : (
            <>
              Уже есть аккаунт?{" "}
              <button
                type="button"
                onClick={() => switchMode("login")}
                className="text-[color:var(--accent)] underline-offset-2 hover:underline"
              >
                Войти
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
