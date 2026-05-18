import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { MiniBoard } from "@/components/board/mini-board";
import { Button } from "@/components/ui/button";

export async function Hero() {
  const t = await getTranslations("hero");

  return (
    <section className="relative overflow-hidden">
      {/* warm radial backdrop */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 50% at 50% -10%, rgba(201,162,39,0.08), transparent 70%), radial-gradient(40% 35% at 90% 110%, rgba(184,92,80,0.05), transparent 70%)",
        }}
      />

      <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-20 md:grid-cols-[1.05fr_1fr] md:py-28 lg:py-32">
        <div className="flex flex-col gap-7">
          <span
            className="inline-flex w-fit items-center gap-2 rounded-full border border-[color:var(--border-base)] bg-[color:var(--bg-surface)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.15em] text-[color:var(--text-secondary)]"
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--accent)" }}
            />
            Premium checkers · 2026
          </span>

          <h1
            className="font-display font-medium text-[color:var(--text-primary)]"
            style={{
              fontSize: "clamp(2.6rem, 6vw, 4.6rem)",
              lineHeight: 1.02,
              letterSpacing: "-0.02em",
            }}
          >
            <span className="block">{t("title_line_1")}</span>
            <span
              className="block italic"
              style={{ color: "var(--accent)" }}
            >
              {t("title_line_2")}
            </span>
          </h1>

          <p
            className="max-w-xl text-[color:var(--text-secondary)]"
            style={{ fontSize: "1.0625rem", lineHeight: 1.6 }}
          >
            {t("subtitle")}
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link href="/play">
              <Button size="lg" variant="primary" className="group">
                {t("cta_primary")}
                <ArrowRight
                  className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                  strokeWidth={1.75}
                />
              </Button>
            </Link>
            <Button size="lg" variant="ghost">
              {t("cta_secondary")}
            </Button>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[480px]">
          <MiniBoard />
          {/* subtle pedestal */}
          <div
            className="absolute -inset-x-6 -bottom-6 -z-10 h-12 rounded-full blur-2xl opacity-50"
            style={{ background: "var(--accent)" }}
          />
        </div>
      </div>
    </section>
  );
}
