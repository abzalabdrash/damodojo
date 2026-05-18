"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Crown, LogOut, User } from "lucide-react";
import { useTranslations } from "next-intl";

import { LocaleSwitcher } from "./locale-switcher";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "./ui/button";
import { AuthModal } from "./auth/auth-modal";
import { useAuthStore } from "@/stores/auth-store";

export function SiteHeader() {
  const t = useTranslations("nav");
  const username = useAuthStore((s) => s.username);
  const hydrate = useAuthStore((s) => s.hydrate);
  const logout = useAuthStore((s) => s.logout);
  const [authOpen, setAuthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[color:var(--border-base)]/60 bg-[color:var(--bg-page)]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          {/* Same auth-aware home destination as the sidebar logo. */}
          <Link
            href={username ? "/play" : "/"}
            className="font-display text-xl font-medium tracking-tight text-[color:var(--text-primary)]"
            style={{ letterSpacing: "-0.02em" }}
          >
            DamaDojo
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            <Link
              href="/play"
              className="rounded-md px-3 py-2 text-sm text-[color:var(--text-secondary)] transition-colors hover:bg-[color:var(--bg-surface)] hover:text-[color:var(--text-primary)]"
            >
              {t("play")}
            </Link>
            <Link
              href="/puzzle"
              className="rounded-md px-3 py-2 text-sm text-[color:var(--text-secondary)] transition-colors hover:bg-[color:var(--bg-surface)] hover:text-[color:var(--text-primary)]"
            >
              {t("puzzle")}
            </Link>
            <Link
              href="/leaderboard"
              className="rounded-md px-3 py-2 text-sm text-[color:var(--text-secondary)] transition-colors hover:bg-[color:var(--bg-surface)] hover:text-[color:var(--text-primary)]"
            >
              {t("leaderboard")}
            </Link>
            {username && (
              <Link
                href="/archive"
                className="rounded-md px-3 py-2 text-sm text-[color:var(--text-secondary)] transition-colors hover:bg-[color:var(--bg-surface)] hover:text-[color:var(--text-primary)]"
              >
                Архив
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/pro"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border border-yellow-500/30 text-yellow-400 hover:from-yellow-500/30 hover:to-amber-500/30 transition-all"
            >
              <Crown className="h-3.5 w-3.5" />
              Pro
            </Link>
            <LocaleSwitcher />
            <ThemeToggle />
            {username ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
                  className="hidden items-center gap-2 rounded-md border border-[color:var(--border-base)] bg-[color:var(--bg-surface)] px-3 py-1.5 text-sm font-medium text-[color:var(--text-primary)] transition-colors hover:bg-[color:var(--bg-elevated)] sm:inline-flex"
                >
                  <User className="h-4 w-4" />
                  {username}
                </button>
                {menuOpen && (
                  <div className="absolute right-0 mt-1.5 w-44 rounded-md border border-[color:var(--border-base)] bg-[color:var(--bg-surface)] py-1 shadow-xl">
                    <Link
                      href="/archive"
                      className="block px-3 py-2 text-sm text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-elevated)] hover:text-[color:var(--text-primary)]"
                    >
                      Архив партий
                    </Link>
                    <Link
                      href="/puzzle"
                      className="block px-3 py-2 text-sm text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-elevated)] hover:text-[color:var(--text-primary)]"
                    >
                      Мои задачи
                    </Link>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        logout();
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-elevated)] hover:text-red-400"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Выйти
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                className="hidden sm:inline-flex"
                onClick={() => setAuthOpen(true)}
              >
                {t("login")}
              </Button>
            )}
          </div>
        </div>
      </header>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}
