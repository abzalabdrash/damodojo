"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { setLocaleCookie } from "@/i18n/actions";
import {
  locales,
  localeShortLabels,
  type Locale,
} from "@/i18n/config";
import { cn } from "@/lib/utils";

export function LocaleSwitcher() {
  const current = useLocale() as Locale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const change = (next: Locale) => {
    if (next === current) return;
    startTransition(async () => {
      await setLocaleCookie(next);
      router.refresh();
    });
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border border-[color:var(--border-base)] bg-[color:var(--bg-surface)] p-0.5 text-[12px] font-medium",
        pending && "opacity-60"
      )}
    >
      {locales.map((loc) => (
        <button
          key={loc}
          type="button"
          onClick={() => change(loc)}
          aria-pressed={current === loc}
          className={cn(
            "rounded-full px-2.5 py-1 transition-colors duration-150",
            current === loc
              ? "bg-[color:var(--bg-elevated)] text-[color:var(--text-primary)]"
              : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
          )}
        >
          {localeShortLabels[loc]}
        </button>
      ))}
    </div>
  );
}
