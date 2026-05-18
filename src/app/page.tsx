import { SiteHeader } from "@/components/site-header";
import { Hero } from "@/components/landing/hero";
import { BotsPreview } from "@/components/landing/bots-preview";

export default function HomePage() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <BotsPreview />
      </main>
      <footer className="border-t border-[color:var(--border-base)]/60 py-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 text-xs text-[color:var(--text-muted)]">
          <span className="font-display tracking-tight">DamaDojo</span>
          <span>nFactorial Incubator 2026 · Almaty</span>
        </div>
      </footer>
    </div>
  );
}
