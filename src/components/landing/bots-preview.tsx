import { BotAvatar } from "@/components/bot/bot-avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BOT_DIALOGUE_PROFILES } from "@/lib/coach/bot-dialogue";

// Pull the opponent line-up straight from the dialogue profiles so the
// landing page can never drift from what's actually playable. We append
// the trainer (Ata) at the top of the list because she's modelled as a
// "trainer" role rather than a "bot" and lives outside BOT_DIALOGUE_PROFILES.
const TRAINER_CARD = {
  id: "ata" as const,
  name: "Ата",
  elo: 2250,
  role: "Главный тренер",
  bio: "Старший мастер, разбирает позиции по ходу партии и подсказывает план. Подходит для разбора и роста силы.",
  hue: "#C9A227",
};

const BOT_CARDS = BOT_DIALOGUE_PROFILES
  .slice()
  .sort((a, b) => b.elo - a.elo)
  .map((bot) => ({
    id: bot.id,
    name: bot.name,
    elo: bot.elo,
    role: bot.role,
    bio: bot.shortIdentity,
    hue: bot.visualColor,
  }));

const ROSTER = [TRAINER_CARD, ...BOT_CARDS];

export function BotsPreview() {
  return (
    <section className="relative border-t border-[color:var(--border-base)]/60">
      <div className="mx-auto max-w-7xl px-6 py-20">
        <div className="mb-10 flex flex-col gap-3">
          <span className="text-[11px] font-medium uppercase tracking-[0.15em] text-[color:var(--text-muted)]">
            Семья Дама · The Dama family
          </span>
          <h2
            className="font-display font-medium text-[color:var(--text-primary)]"
            style={{
              fontSize: "clamp(1.9rem, 3.5vw, 2.6rem)",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
            }}
          >
            Шесть характеров. От новичка до мастера.
          </h2>
          <p className="max-w-2xl text-[color:var(--text-secondary)]">
            Каждый бот думает своим движком и говорит своим голосом. Подбор по
            Elo — играй с тем, кто ровно по уровню.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {ROSTER.map((bot) => (
            <Card
              key={bot.id}
              className="group relative overflow-hidden transition-transform duration-300 ease-[var(--ease-premium,cubic-bezier(0.16,1,0.3,1))] hover:-translate-y-1"
            >
              <div
                className="relative flex h-48 items-center justify-center overflow-hidden"
                style={{
                  background: `linear-gradient(155deg, ${bot.hue}1f 0%, ${bot.hue}08 55%, transparent 100%)`,
                }}
              >
                <BotAvatar bot={bot.id} size={120} glow />
                <div className="absolute right-4 top-4 rounded-full border border-[color:var(--border-base)] bg-[color:var(--bg-page)]/80 px-2.5 py-1 font-mono text-[11px] font-medium text-[color:var(--text-secondary)] backdrop-blur">
                  {bot.elo}
                </div>
              </div>

              <CardHeader>
                <CardTitle className="text-xl">{bot.name}</CardTitle>
                <CardDescription className="text-[color:var(--text-muted)]">
                  {bot.role}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p
                  className="text-sm text-[color:var(--text-secondary)]"
                  style={{ lineHeight: 1.55 }}
                >
                  {bot.bio}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-5 w-full justify-center"
                >
                  Сыграть
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
