"use client";

import {
  Bot,
  Clock3,
  GraduationCap,
  Link as LinkIcon,
  Loader2,
  Monitor,
  Search,
  Timer,
  Users,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import NextLink from "next/link";

import { BotAvatar } from "@/components/bot/bot-avatar";
import { playSound } from "@/lib/sounds";
import { cn } from "@/lib/utils";
import { useGameStore } from "@/stores/game-store";
import { useMatchmaking } from "@/hooks/use-matchmaking";
import type { PlayModeId } from "@/lib/play-modes";
import { useEffect } from "react";

interface ModeItem {
  id: PlayModeId;
  title: string;
  subtitle: string;
  icon: ReactNode;
  primary?: boolean;
}

const modes: readonly ModeItem[] = [
  {
    id: "online",
    title: "Играть по сети",
    subtitle: "Соперник твоего уровня и рабочий таймер",
    icon: <Zap className="h-6 w-6" strokeWidth={2.1} />,
    primary: true,
  },
  {
    id: "bot",
    title: "Боты",
    subtitle: "Соперники с характером и репликами",
    icon: <Bot className="h-6 w-6" strokeWidth={1.9} />,
  },
  {
    id: "coach",
    title: "Играть с тренером",
    subtitle: "Ата помогает и объясняет идеи",
    icon: <GraduationCap className="h-6 w-6" strokeWidth={1.9} />,
  },
  {
    id: "friend",
    title: "Играть с другом",
    subtitle: "Пригласить по ссылке или играть локально",
    icon: <Users className="h-6 w-6" strokeWidth={1.9} />,
  },
];

interface TimeOption {
  id: string;
  label: string;
  sub: string;
}

const TIME_OPTIONS: readonly TimeOption[] = [
  { id: "3+0", label: "3+0", sub: "Блиц" },
  { id: "5+3", label: "5+3", sub: "Блиц" },
  { id: "10+0", label: "10+0", sub: "Рапид" },
];

const DEFAULT_TIME_CONTROL = "3+0";

export function PlayHubPanel() {
  const setMode = useGameStore((s) => s.setMode);
  const reset = useGameStore((s) => s.reset);
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  // Local highlight only: we deliberately do NOT read `activeMode` from the
  // game store here. The store keeps the LAST played mode (so a user coming
  // back from a coach game would see "С тренером" highlighted on the hub
  // even though they didn't pick anything yet). The hub only lights up a
  // card right after the user clicks it in this session.
  const [selectedMode, setSelectedMode] = useState<PlayModeId | null>(null);
  // Selected time control flows to BOTH "Найти" (matchmaking) and
  // "Пригласить" (room creation) so the same picker controls every online
  // entry point. Default 3+0 keeps the long-time default behaviour.
  const [selectedTc, setSelectedTc] = useState<string>(DEFAULT_TIME_CONTROL);
  const matchmaking = useMatchmaking();

  // Auto-navigate when matched. Carry the matched time control as a query
  // param so the game room can seed its clock from the first hello.
  useEffect(() => {
    if (matchmaking.status === "matched" && matchmaking.matchedRoomId) {
      const tc = matchmaking.matchedTimeControl ?? selectedTc;
      const tcParam = tc ? `?tc=${encodeURIComponent(tc)}` : "";
      router.push(`/r/${matchmaking.matchedRoomId}${tcParam}`);
    }
  }, [
    matchmaking.status,
    matchmaking.matchedRoomId,
    matchmaking.matchedTimeControl,
    router,
    selectedTc,
  ]);

  function chooseMode(mode: PlayModeId) {
    setSelectedMode(mode);
    setMode(mode);
    playSound("game-start");
  }

  function goToBots() {
    setSelectedMode("bot");
    // Wipe board state so the new bot game starts from scratch; without this
    // the user sees the previous game's pieces still on the board until they
    // click "Играть".
    reset();
    playSound("game-start");
    router.push("/play/bots");
  }

  function goToCoach() {
    setSelectedMode("coach");
    reset();
    playSound("game-start");
    router.push("/play?coach=ata");
  }

  async function createRoom() {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeControl: selectedTc }),
      });
      const data = await res.json() as { roomId: string };
      // Encode tc into the room URL so it travels with the share link.
      const tcParam = `?tc=${encodeURIComponent(selectedTc)}`;
      router.push(`/r/${data.roomId}${tcParam}`);
    } finally {
      setCreating(false);
    }
  }

  function findMatch() {
    if (matchmaking.status === "searching") {
      matchmaking.cancel();
    } else {
      matchmaking.find(selectedTc);
    }
  }

  return (
    // The panel grows to match the board's column height. We use a flex
    // column with `flex-1` on the body so the modes / time / friend rows
    // expand and breathe instead of clumping at the top of a short card.
    <section className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-[color:var(--border-base)] bg-[color:var(--bg-surface)] shadow-[0_24px_60px_-34px_rgba(0,0,0,0.85)]">
      <div className="border-b border-[color:var(--border-base)] bg-[#181713] px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-3xl font-extrabold tracking-tight text-white">
              Играть в шашки
            </h2>
            <p className="mt-1 text-sm text-[#aaa49a]">Выбери режим партии</p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[color:var(--accent-muted)] text-[color:var(--accent)]">
            <Clock3 className="h-6 w-6" strokeWidth={2.2} />
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 flex-col gap-2.5 overflow-y-auto p-4">
        {modes.map((mode) => {
          const onClick =
            mode.id === "online"
              ? findMatch
              : mode.id === "bot"
                ? goToBots
                : mode.id === "coach"
                  ? goToCoach
                  : mode.id === "friend"
                    ? createRoom
                    : () => chooseMode(mode.id);
          return (
            <ModeButton
              key={mode.id}
              mode={mode.id}
              title={mode.title}
              subtitle={mode.subtitle}
              icon={mode.id === "online" && creating ? <Loader2 className="h-6 w-6 animate-spin" /> : mode.icon}
              active={selectedMode === mode.id || (mode.id === "online" && matchmaking.status === "searching")}
              primary={mode.primary}
              onClick={onClick}
            />
          );
        })}

        <div className="rounded-lg border border-[color:var(--border-base)] bg-[color:var(--bg-page)]/35 p-2">
          <div className="flex items-center gap-2 px-1 pb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
            <Timer className="h-3.5 w-3.5" strokeWidth={1.8} />
            Контроль времени
          </div>
          <div
            role="radiogroup"
            aria-label="Контроль времени"
            className="grid grid-cols-3 gap-1.5"
          >
            {TIME_OPTIONS.map((opt) => {
              const active = selectedTc === opt.id;
              const disabled = matchmaking.status === "searching" || creating;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={disabled}
                  onClick={() => setSelectedTc(opt.id)}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-0.5 rounded-md border text-xs font-semibold transition-all duration-150 active:scale-[0.97]",
                    active
                      ? "border-[color:var(--accent)] bg-[color:var(--accent-muted)] text-[color:var(--text-primary)] shadow-[inset_0_0_0_1px_var(--accent)]"
                      : "border-[color:var(--border-base)] bg-[color:var(--bg-elevated)]/55 text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]",
                    disabled && !active && "opacity-50",
                  )}
                >
                  <span className="font-display text-base font-extrabold leading-none">
                    {opt.label}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--text-muted)]">
                    {opt.sub}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-[color:var(--border-base)] bg-[color:var(--bg-page)]/35 p-2">
          <div className="flex items-center gap-2 px-1 pb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
            <Users className="h-3.5 w-3.5" strokeWidth={1.8} />
            Быстрые варианты для друга
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <FriendAction
              icon={creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" strokeWidth={2} />}
              label="Пригласить"
              active={selectedMode === "friend" || creating}
              onClick={createRoom}
            />
            <FriendAction
              icon={
                matchmaking.status === "searching" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" strokeWidth={2} />
                )
              }
              label={
                matchmaking.status === "searching"
                  ? matchmaking.position > 0
                    ? `В очереди #${matchmaking.position}`
                    : `Поиск ${selectedTc}…`
                  : `Найти ${selectedTc}`
              }
              active={matchmaking.status === "searching"}
              onClick={findMatch}
            />
            <FriendAction
              icon={<Monitor className="h-4 w-4" strokeWidth={2} />}
              label="Локально"
              active={selectedMode === "local"}
              onClick={() => chooseMode("local")}
            />
          </div>
        </div>
        <div className="flex items-center justify-center gap-8 pt-2 text-xs font-semibold text-[#d4d0c8]">
          <NextLink href="/archive" className="hover:text-white">Архив партий</NextLink>
          <NextLink href="/leaderboard" className="hover:text-white">Таблица лидеров</NextLink>
        </div>
      </div>
    </section>
  );
}

interface ModeButtonProps {
  mode: PlayModeId;
  title: string;
  subtitle: string;
  icon: ReactNode;
  active: boolean;
  primary?: boolean;
  onClick: () => void;
}

function ModeButton({
  mode,
  title,
  subtitle,
  icon,
  active,
  primary,
  onClick,
}: ModeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex min-h-[92px] w-full items-center gap-4 rounded-lg border p-4 text-left transition-all duration-200 active:scale-[0.985]",
        primary
          ? "border-[color:var(--accent)]/35 bg-[linear-gradient(180deg,#3b382f,#282621)]"
          : "border-[color:var(--border-base)] bg-[linear-gradient(180deg,#34322e,#25231f)]",
        active
          ? "border-[color:var(--accent)] shadow-[inset_0_0_0_2px_var(--accent),0_0_28px_-6px_var(--accent)]"
          // Stronger hover state: accent border, warm fill, lift + glow.
          // The eye expects motion when a primary action is hovered — without
          // it the card felt dead.
          : "hover:-translate-y-0.5 hover:scale-[1.01] hover:border-[color:var(--accent)]/70 hover:bg-[linear-gradient(180deg,#403d36,#2b2925)] hover:shadow-[0_12px_28px_-12px_rgba(252,211,77,0.35)]"
      )}
    >
      <span
        className={cn(
          "flex h-14 w-14 shrink-0 items-center justify-center rounded-lg",
          primary
            ? "bg-[color:var(--accent)] text-[#1A1408]"
            : "bg-[color:var(--bg-page)] text-[color:var(--accent)]"
        )}
      >
        {mode === "coach" ? <BotAvatar bot="ata" size={34} /> : icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 text-xl font-extrabold text-white">
          {title}
          {active && (
            <span className="rounded-full bg-[color:var(--accent-muted)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-[color:var(--accent)]">
              выбрано
            </span>
          )}
        </span>
        <span className="mt-1 block text-sm leading-snug text-[#c8c2b8]">
          {subtitle}
        </span>
      </span>
    </button>
  );
}

interface FriendActionProps {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

function FriendAction({ icon, label, active, onClick }: FriendActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-16 flex-col items-center justify-center gap-1 rounded-md border text-[11px] font-semibold transition-all duration-150 active:scale-[0.97]",
        active
          ? "border-[color:var(--accent)] bg-[color:var(--accent-muted)] text-[color:var(--text-primary)] shadow-[inset_0_0_0_1px_var(--accent)]"
          : "border-[color:var(--border-base)] bg-[color:var(--bg-elevated)]/55 text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
      )}
    >
      <span className="text-[color:var(--accent)]">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
