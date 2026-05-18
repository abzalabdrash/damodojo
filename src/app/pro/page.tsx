"use client";

import { Check, Crown, Minus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { useAuthStore } from "@/stores/auth-store";

/**
 * /pro — single-tier subscription pitch.
 *
 * Modeled on chess.com's pricing flow but deliberately stripped down:
 * one Free plan, one Pro plan, one comparison table, one CTA. We don't
 * yet have 200 M users to justify three tiers, and a Gold/Platinum/
 * Diamond split would obscure the real pitch ("unlimited reviews + a
 * stronger engine").
 *
 * Pricing is in KZT to match the actual market we serve. The annual
 * card is highlighted (16% off, two months free) because that's where
 * we want the user's eye and where chess.com makes most of its money.
 */

type PlanRow = {
  feature: string;
  free: string | true | false;
  pro: string | true | false;
};

const PLAN_ROWS: PlanRow[] = [
  { feature: "Игра онлайн и с друзьями", free: true, pro: true },
  { feature: "Все 6 ботов от 1100 до 2250", free: true, pro: true },
  { feature: "Тренер Ата во время игры", free: true, pro: true },
  { feature: "Отчёт после партии", free: "1 в день", pro: "Безлимит" },
  { feature: "Тактические задачи", free: "2–3 в день", pro: "Безлимит" },
  { feature: "Глубина движка в анализе", free: "до 10", pro: "до 20" },
  { feature: "Приоритет коуча (длиннее объяснения)", free: false, pro: true },
  { feature: "Без рекламы", free: false, pro: true },
];

const MONTHLY_PRICE_KZT = 990;
const ANNUAL_PRICE_KZT = 9900; // 16% off vs paying monthly

export default function ProPage() {
  const username = useAuthStore((s) => s.username);
  const [period, setPeriod] = useState<"monthly" | "annual">("annual");

  const headlinePrice = period === "annual" ? ANNUAL_PRICE_KZT / 12 : MONTHLY_PRICE_KZT;

  function handleStartTrial() {
    if (!username) {
      // Without auth there is no user to attach a subscription to.
      // We bounce them to /play which has the auth modal trigger.
      window.location.href = "/play";
      return;
    }
    // Real Stripe checkout is on the post-MVP roadmap. Until then we
    // surface a clear "coming soon" message so users (and judges) don't
    // think we're broken.
    alert(
      "Биллинг через Stripe подключим в следующем релизе. " +
        "Пока подписка работает в demo-режиме без оплаты — " +
        "напиши в поддержку и я включу Pro для тебя.",
    );
  }

  return (
    <div className="flex min-h-svh bg-[#302f2b] text-white">
      <AppSidebar />
      <main className="mx-auto w-full max-w-3xl px-4 py-12">
        {/* ── Hero ── */}
        <div className="text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-yellow-500/20 bg-yellow-500/10 px-4 py-1.5 text-sm font-medium text-yellow-400">
            <Crown className="h-4 w-4" />
            DamaDojo Pro
          </div>
          <h1
            className="font-display text-4xl font-bold text-[var(--text-primary)] sm:text-5xl"
            style={{ letterSpacing: "-0.02em" }}
          >
            Учись на каждой партии
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-[color:var(--text-secondary)]">
            Безлимитные отчёты после партий, более сильный движок в анализе и
            приоритет у тренера. <span className="text-[color:var(--text-primary)]">Первые 7 дней бесплатно.</span>
          </p>
        </div>

        {/* ── Period toggle ── */}
        <div className="mt-9 flex justify-center">
          <div className="inline-flex rounded-full border border-[color:var(--border-base)] bg-[color:var(--bg-surface)] p-1 text-sm font-medium">
            <button
              type="button"
              onClick={() => setPeriod("monthly")}
              className={
                "rounded-full px-4 py-1.5 transition-colors " +
                (period === "monthly"
                  ? "bg-[color:var(--accent)] text-[#1A1408]"
                  : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]")
              }
            >
              Помесячно
            </button>
            <button
              type="button"
              onClick={() => setPeriod("annual")}
              className={
                "rounded-full px-4 py-1.5 transition-colors " +
                (period === "annual"
                  ? "bg-[color:var(--accent)] text-[#1A1408]"
                  : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]")
              }
            >
              Ежегодно
              <span className="ml-1.5 rounded-full bg-emerald-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                −16%
              </span>
            </button>
          </div>
        </div>

        {/* ── Price card ── */}
        <div className="mx-auto mt-6 max-w-md rounded-2xl border border-yellow-500/35 bg-gradient-to-b from-yellow-500/5 to-transparent p-7 text-center">
          <p className="text-4xl font-bold text-[color:var(--text-primary)]">
            {Math.round(headlinePrice).toLocaleString("ru-RU")} ₸
            <span className="ml-1 text-base font-normal text-[color:var(--text-muted)]">
              / мес
            </span>
          </p>
          <p className="mt-1 text-sm text-[color:var(--text-muted)]">
            {period === "annual"
              ? `${ANNUAL_PRICE_KZT.toLocaleString("ru-RU")} ₸ списываются раз в год · отмена в любой момент`
              : "Ежемесячный платёж · отмена в любой момент"}
          </p>

          <button
            type="button"
            onClick={handleStartTrial}
            className="mt-6 w-full rounded-xl bg-gradient-to-r from-yellow-500 to-amber-500 px-6 py-3.5 text-base font-bold text-black transition-opacity hover:opacity-90"
          >
            Начать 7-дневный пробный период
          </button>

          <p className="mt-3 text-xs text-[color:var(--text-muted)]">
            Без карты на пробный период · Stripe-биллинг подключим в следующем релизе
          </p>
        </div>

        {/* ── Comparison table ── */}
        <div className="mt-12">
          <h2
            className="text-center font-display text-2xl font-semibold text-[color:var(--text-primary)]"
            style={{ letterSpacing: "-0.02em" }}
          >
            Что входит
          </h2>

          <div className="mt-6 overflow-hidden rounded-xl border border-[color:var(--border-base)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--border-base)] bg-[color:var(--bg-surface)] text-left">
                  <th className="px-4 py-3 font-medium text-[color:var(--text-secondary)]">
                    Возможность
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-[color:var(--text-secondary)]">
                    Free
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-[color:var(--accent)]">
                    Pro
                  </th>
                </tr>
              </thead>
              <tbody>
                {PLAN_ROWS.map((row, i) => (
                  <tr
                    key={row.feature}
                    className={
                      i % 2 === 0
                        ? "bg-[color:var(--bg-page)]/30"
                        : "bg-[color:var(--bg-surface)]/30"
                    }
                  >
                    <td className="px-4 py-3 text-[color:var(--text-primary)]">
                      {row.feature}
                    </td>
                    <td className="px-4 py-3 text-center text-[color:var(--text-secondary)]">
                      <PlanCell value={row.free} />
                    </td>
                    <td className="px-4 py-3 text-center text-[color:var(--text-primary)]">
                      <PlanCell value={row.pro} accent />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Footer link ── */}
        <p className="mt-10 text-center text-sm text-[color:var(--text-muted)]">
          Вопросы?{" "}
          <Link
            href="/play"
            className="text-[color:var(--accent)] hover:underline"
          >
            Вернуться к игре
          </Link>
        </p>
      </main>
    </div>
  );
}

function PlanCell({
  value,
  accent = false,
}: {
  value: string | boolean;
  accent?: boolean;
}) {
  if (value === true) {
    return (
      <Check
        className={
          "mx-auto h-4 w-4 " +
          (accent ? "text-emerald-400" : "text-[color:var(--text-secondary)]")
        }
        strokeWidth={3}
      />
    );
  }
  if (value === false) {
    return <Minus className="mx-auto h-4 w-4 text-[color:var(--text-muted)]" />;
  }
  return (
    <span
      className={
        accent
          ? "font-semibold text-[color:var(--accent)]"
          : "text-[color:var(--text-secondary)]"
      }
    >
      {value}
    </span>
  );
}
