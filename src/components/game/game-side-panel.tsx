"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import { Bot, Flag, Lightbulb, Undo2 } from "lucide-react";

import { MoveList } from "@/components/game/move-list";
import { ReplayControls } from "@/components/game/replay-controls";
import type { Move } from "@/lib/engine";
import type { Character } from "@/lib/coach/characters";
import { cn } from "@/lib/utils";
import { TypewriterLine } from "@/components/bot/typewriter-line";

interface GameSidePanelProps {
  bot: Character;
  title?: string;
  comment: string;
  comments?: readonly string[];
  moves: readonly Move[];
  onSurrender: () => void;
  onTakeback: () => void;
  onHint: () => void;
  hintDisabled?: boolean;
  takebackDisabled?: boolean;
}

export function GameSidePanel({
  bot,
  title = "Боты",
  comment,
  comments = [],
  moves,
  onSurrender,
  onTakeback,
  onHint,
  hintDisabled = false,
  takebackDisabled = false,
}: GameSidePanelProps) {
  const [resignOpen, setResignOpen] = useState(false);

  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-none bg-[#262520] text-[#f4f1ec] lg:w-[430px]">
      {/* Header */}
      <div className="flex h-[86px] shrink-0 items-center justify-center gap-3 border-b border-[#37342f] bg-[#1f1e1a]">
        <Bot className="h-9 w-9 text-[#9dc8ff]" strokeWidth={2.2} />
        <h2 className="text-3xl font-extrabold tracking-tight text-white">
          {title}
        </h2>
      </div>

      {/* Bot avatar + speech bubble */}
      <section className="flex min-h-[38%] shrink-0 items-start px-5 py-6">
        <div className="flex w-full items-start gap-0">
          <div className="relative z-10 mt-2 h-[104px] w-[104px] shrink-0 overflow-hidden rounded-md">
            <Image
              src={bot.avatar}
              alt={bot.name}
              width={104}
              height={104}
              className="h-full w-full object-cover"
              unoptimized
            />
          </div>
          <div className="ml-3 flex min-h-[104px] flex-1 flex-col gap-2">
            {comment && (
              <div className="relative rounded-2xl bg-white px-5 py-4 text-[22px] font-semibold leading-snug text-[#312d28] shadow-sm">
                <span
                  aria-hidden
                  className="absolute top-7 -left-[7px] h-3.5 w-3.5 rotate-45 bg-white"
                />
                <TypewriterLine text={comment} speedMs={16} />
              </div>
            )}
            {comments.length > 0 && (
              <div className="flex max-h-[132px] flex-col gap-2 overflow-y-auto pr-1">
                {[...comments].reverse().map((line, index) => (
                  <div
                    key={`${line}-${index}`}
                    className="rounded-xl bg-white/82 px-4 py-2 text-sm font-semibold leading-snug text-[#4d473f] shadow-sm"
                  >
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Move list */}
      <section className="min-h-0 flex-1 border-y border-[#37342f]">
        <MoveList
          history={moves}
          className="h-full rounded-none border-0 bg-transparent"
        />
      </section>

      {/* Replay scrub: ⇤ ← → ⇥ + хоткеи стрелок + звук на каждый шаг */}
      <section className="shrink-0 border-b border-[#37342f] bg-[#1f1e1a] px-3 py-3">
        <ReplayControls className="border-none bg-transparent p-0" />
      </section>

      {/* Action buttons */}
      <section className="shrink-0 bg-[#1f1e1a] px-5 py-5">
        {resignOpen && (
          <div className="mb-4 rounded-xl bg-[#33322d] p-5">
            <p className="mb-4 text-center text-lg font-bold text-white">
              Вы действительно хотите сдаться?
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setResignOpen(false)}
                className="h-12 rounded-lg bg-[#44413b] text-base font-bold text-[#d4d0c8] transition hover:bg-[#555049]"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  setResignOpen(false);
                  onSurrender();
                }}
                className="h-12 rounded-lg bg-[#d04040] text-base font-bold text-white transition hover:bg-[#e04545]"
              >
                Сдался
              </button>
            </div>
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          <IconControl label="Сдаться" onClick={() => setResignOpen(true)}>
            <Flag className="h-8 w-8" />
          </IconControl>
          <IconControl
            label="Отменить ход"
            onClick={onTakeback}
            disabled={takebackDisabled}
          >
            <Undo2 className="h-8 w-8" />
          </IconControl>
          <IconControl
            label="Показать подсказку"
            onClick={onHint}
            disabled={hintDisabled}
          >
            <Lightbulb className="h-8 w-8" />
          </IconControl>
        </div>
      </section>
    </aside>
  );
}

function IconControl({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "group relative flex h-20 items-center justify-center rounded-xl bg-[linear-gradient(#3c3a36,#2d2c28)] text-[#d5d1c8] shadow-[inset_0_-3px_0_rgba(0,0,0,0.25)] transition hover:text-white disabled:cursor-not-allowed disabled:opacity-45",
      )}
    >
      {children}
      <span className="pointer-events-none absolute -top-11 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black px-3 py-2 text-sm font-bold text-white shadow-xl group-hover:block">
        {label}
      </span>
    </button>
  );
}
