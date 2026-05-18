"use client";

import { useRouter } from "next/navigation";
import {
  BarChart3,
  Bot,
  CheckCircle2,
  Infinity as InfinityIcon,
  ShieldOff,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import type { ReactNode } from "react";

// Note: paywall is a UI stub for the grant submission — no real billing.
// The CTA routes to /pro (landing page) so the user sees the value props in
// full. We intentionally do NOT flip the local PRO flag here: a stray click
// during demo testing would silently unlock everything for the rest of the
// session, which would mask the daily quota gate everywhere else.

interface PaywallModalProps {
  open: boolean;
  onClose: () => void;
  /** Triggered by the action that hit a quota wall, e.g. "review". */
  reason?: "review" | "bots" | "tasks" | "ads";
}

const REASON_TITLES: Record<NonNullable<PaywallModalProps["reason"]>, string> = {
  review: "Безлимитные отчёты о партиях",
  bots: "Все боты — Айгерим, Талгат и другие",
  tasks: "Безлимитные тренировочные задачи",
  ads: "Без рекламы — играй без отвлечений",
};

const REASON_BLURBS: Record<NonNullable<PaywallModalProps["reason"]>, string> = {
  review: "Бесплатно — один разбор партии в сутки. С PRO — сколько хочешь, когда хочешь. Кто чаще смотрит свои партии, растёт в 2.7 раза быстрее.",
  bots: "PRO открывает топ-ботов с уникальным голосом и сильнее движком. Каждый — со своим характером.",
  tasks: "Решай шашечные задачи без лимитов. От простых разменов до многоходовых комбинаций.",
  ads: "Никаких баннеров. Только доска и ты.",
};

interface BenefitRow {
  icon: ReactNode;
  title: string;
  desc: string;
}

const BENEFITS: BenefitRow[] = [
  {
    icon: <InfinityIcon className="h-4 w-4" strokeWidth={2.2} />,
    title: "Безлимитные отчёты о партиях",
    desc: "AI-разбор каждой партии — без дневного лимита",
  },
  {
    icon: <Bot className="h-4 w-4" strokeWidth={2.2} />,
    title: "Все боты с характером",
    desc: "Айгерим, Талгат и редкие соперники с топ-ELO",
  },
  {
    icon: <BarChart3 className="h-4 w-4" strokeWidth={2.2} />,
    title: "Сильнее движок в анализе",
    desc: "Глубокий поиск, точные оценки, лучшие ходы",
  },
  {
    icon: <ShieldOff className="h-4 w-4" strokeWidth={2.2} />,
    title: "Без рекламы",
    desc: "Никаких баннеров и отвлечений",
  },
  {
    icon: <Sparkles className="h-4 w-4" strokeWidth={2.2} />,
    title: "Безлимитные задачи",
    desc: "Тренировка без счётчика — учись сколько хочешь",
  },
];

export function PaywallModal({ open, onClose, reason = "review" }: PaywallModalProps) {
  const router = useRouter();
  if (!open) return null;

  function goPro() {
    // The CTA routes to the /pro landing page — it does NOT flip any local
    // PRO flag. Real billing wires through Stripe later (out of scope for
    // the grant). Keeping this side-effect-free means the daily quota gate
    // keeps working even after the user explored the paywall.
    onClose();
    router.push("/pro");
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-headline"
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-emerald-500/20 bg-[#1a1b1d] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full text-[#8f887f] transition hover:bg-white/5 hover:text-white"
          aria-label="Закрыть"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="px-7 pb-7 pt-8">
          {/* Tiny green pill — quota reason */}
          <span className="inline-flex items-center rounded-md border border-emerald-500/40 bg-emerald-500/12 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">
            Максимальное количество на сегодня
          </span>

          {/* Headline — bold and large, like chess.com */}
          <h2
            id="paywall-headline"
            className="mt-4 font-display text-[34px] font-extrabold leading-[1.05] tracking-tight text-white"
          >
            Пользоваться отчётом о партии&nbsp;<span className="whitespace-nowrap">без ограничений</span>
          </h2>

          {/* Big hero badge: 2.7x */}
          <div className="relative mt-6 overflow-hidden rounded-xl bg-gradient-to-br from-[#0f1f15] to-[#0a1310] p-6">
            <div className="absolute -right-8 -top-6 h-40 w-40 rounded-full bg-emerald-500/15 blur-3xl" />
            <div className="relative flex items-center gap-5">
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-bold leading-tight text-emerald-300">
                  Улучшить
                </p>
                <p className="font-display text-[64px] font-black leading-none tracking-tight text-emerald-300">
                  2.7x
                </p>
                <p className="font-display text-lg font-bold leading-tight text-emerald-300">
                  Быстрее
                </p>
              </div>
              {/* The badge cluster on the right — mirrors chess.com lockup */}
              <div className="relative flex h-[100px] w-[100px] shrink-0 items-center justify-center">
                <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-emerald-400 shadow-[0_10px_30px_-6px_rgba(52,211,153,0.55)]">
                  <span className="font-display text-3xl font-black text-[#0a1310]">!!</span>
                </div>
                <span className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#0a1310] bg-emerald-200 text-[#0a1310]">
                  <Star className="h-3.5 w-3.5 fill-current" />
                </span>
                <span className="absolute -bottom-1 right-3 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#0a1310] bg-sky-300 text-[#0a1310]">
                  <span className="text-xs font-black">!</span>
                </span>
              </div>
            </div>
          </div>

          <p className="mt-5 text-center text-[13px] leading-relaxed text-[#c8c2b8]">
            Тот, кто часто пользуется отчётом о партии,
            <br />
            совершенствуется в&nbsp;<span className="font-bold text-white">2.7 раза быстрее</span>
          </p>

          {/* CTA — big blue button, chess.com style. We lead with the
              trial because that's the lowest-friction conversion path:
              users hate committing money but happily pay if the product
              proves itself in a week. */}
          <button
            type="button"
            onClick={goPro}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#3392e6] to-[#1f7ccc] py-4 text-base font-bold text-white shadow-[0_10px_30px_-10px_rgba(51,146,230,0.65)] transition hover:from-[#4aa1ef] hover:to-[#2b88d8] active:scale-[0.985]"
          >
            Начать 7 дней бесплатно
          </button>

          {/* Trust line under the CTA */}
          <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-[#8f887f]">
            <span>7 дней бесплатно</span>
            <span aria-hidden>·</span>
            <span>990&nbsp;₸ / мес</span>
            <span aria-hidden>·</span>
            <span>Отмена в один клик</span>
          </div>

          {/* What you also get — collapsed list, smaller, secondary */}
          <details className="group mt-5 rounded-lg border border-[#2a2926]">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#aaa49a] transition hover:text-white">
              Что ещё открывает Pro
              <span className="ml-2 transition group-open:rotate-180">▾</span>
            </summary>
            <ul className="space-y-1.5 border-t border-[#2a2926] px-4 py-3">
              {BENEFITS.map((b) => (
                <li key={b.title} className="flex items-center gap-2 text-[12px] text-[#c8c2b8]">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  <span>{b.title}</span>
                </li>
              ))}
            </ul>
          </details>

          <button
            type="button"
            onClick={onClose}
            className="mt-4 w-full text-center text-[12px] font-medium text-[#7a7468] transition hover:text-[#c8c2b8]"
          >
            Не сейчас — вернусь завтра
          </button>
        </div>
      </div>
    </div>
  );
}
