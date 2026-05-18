"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Archive,
  Crown,
  LogIn,
  Puzzle,
  Settings,
  Swords,
  Trophy,
  User,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { AuthModal } from "@/components/auth/auth-modal";
import { cn } from "@/lib/utils";
import { isSidebarItemActive } from "@/lib/navigation/sidebar";
import { useAuthStore } from "@/stores/auth-store";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  requiresAuth?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/play", label: "Играть", icon: <Swords className="h-5 w-5" /> },
  { href: "/tasks", label: "Задачи", icon: <Puzzle className="h-5 w-5" /> },
  { href: "/archive", label: "Архив партий", icon: <Archive className="h-5 w-5" /> },
  { href: "/leaderboard", label: "Лидерборд", icon: <Trophy className="h-5 w-5" /> },
];

export function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const username = useAuthStore((s) => s.username);
  const search = searchParams.toString();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <aside className="hidden w-[200px] shrink-0 flex-col border-r border-[color:var(--border-base)] bg-[color:var(--bg-surface)] md:flex">
      {/* Logo — signed-in users land on /play (the actual product); the
          marketing landing at "/" is for first-time visitors who don't have
          a session yet. Mirrors chess.com's behaviour: the logo means
          "take me home", and "home" depends on who you are. */}
      <Link
        href={username ? "/play" : "/"}
        className="flex h-14 items-center gap-2 border-b border-[color:var(--border-base)] px-4"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--accent)] font-display text-sm font-bold text-[#1A1408]">
          D
        </span>
        <span className="font-display text-base font-semibold tracking-tight text-[color:var(--text-primary)]">
          DamaDojo
        </span>
      </Link>

      {/* Nav links */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {NAV_ITEMS.map((item) => {
          if (item.requiresAuth && !username) return null;
          const active = isSidebarItemActive(item.href, pathname, search);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-[color:var(--accent-muted)] text-[color:var(--accent)]"
                  : "text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-elevated)] hover:text-[color:var(--text-primary)]"
              )}
            >
              <span className={active ? "text-[color:var(--accent)]" : "opacity-70"}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Pro + User */}
      <div className="mt-auto space-y-1 border-t border-[color:var(--border-base)] px-2 py-3">
        <Link
          href="/pro"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-yellow-400 transition-colors hover:bg-yellow-500/10"
        >
          <Crown className="h-5 w-5" />
          Pro
        </Link>
        <div className="relative">
          {!username && (
            <button
              type="button"
              onClick={() => setAuthOpen(true)}
              className="mb-1 flex w-full items-center gap-3 rounded-lg bg-[color:var(--accent-muted)] px-3 py-2.5 text-sm font-semibold text-[color:var(--accent)] transition hover:bg-[color:var(--accent-muted)]/80"
            >
              <LogIn className="h-5 w-5" />
              Войти
            </button>
          )}
          <button
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[color:var(--text-secondary)] transition hover:bg-[color:var(--bg-elevated)] hover:text-[color:var(--text-primary)]"
          >
            <User className="h-5 w-5 opacity-70" />
            <span className="truncate">{username || "Гость"}</span>
            <Settings className="ml-auto h-4 w-4 opacity-60" />
          </button>
          {settingsOpen && (
            <div className="absolute bottom-full left-2 mb-2 w-[184px] overflow-hidden rounded-lg border border-[color:var(--border-base)] bg-[#211f1b] shadow-2xl">
              <div className="border-b border-[color:var(--border-base)] px-3 py-2">
                <p className="text-xs font-semibold text-[color:var(--text-primary)]">
                  Настройки
                </p>
                <p className="truncate text-[11px] text-[color:var(--text-muted)]">
                  {username || "Гость"}
                </p>
              </div>
              {["Профиль", "Звуки", "Тема доски"].map((label) => (
                <button
                  key={label}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-xs text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-elevated)] hover:text-[color:var(--text-primary)]"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </aside>
  );
}
