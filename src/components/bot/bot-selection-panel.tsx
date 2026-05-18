"use client";

import Image from "next/image";
import { useState } from "react";
import { ChevronDown, Crown, Lock, Play } from "lucide-react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import type { BotSelectionItem, BotSideOptionId } from "@/lib/coach/bot-selection";
import { SIDE_OPTIONS, BOT_PREVIEW_LINES } from "@/lib/coach/bot-selection";
import { SidePickerIcon } from "@/components/bot/side-picker-icon";
import { TypewriterLine } from "@/components/bot/typewriter-line";
import { KzFlag } from "@/components/ui/kz-flag";

interface BotSelectionPanelProps {
  items: BotSelectionItem[];
  selected: BotSelectionItem;
  side: BotSideOptionId;
  onSelect: (item: BotSelectionItem) => void;
  onSideChange: (side: BotSideOptionId) => void;
}

export function BotSelectionPanel({
  items,
  selected,
  side,
  onSelect,
  onSideChange,
}: BotSelectionPanelProps) {
  const router = useRouter();
  const [optionsOpen, setOptionsOpen] = useState(false);

  const previewLine =
    BOT_PREVIEW_LINES[selected.character.id] ??
    "Сыграем спокойно. Ошибки покажут, кто видел дальше.";

  function handlePlay() {
    if (selected.locked) {
      router.push("/pro");
      return;
    }
    router.push(`/play?bot=${selected.character.id}`);
  }

  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#262520] text-[#f4f1ec] lg:w-[430px]">
      {/* Header — bot preview */}
      <div className="shrink-0 border-b border-[#37342f] bg-[#1f1e1a] px-5 py-5">
        <div className="mb-3 flex items-center gap-3">
          <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-md">
            <Image
              src={selected.character.avatar}
              alt={selected.character.name}
              width={72}
              height={72}
              className="h-full w-full object-cover"
              unoptimized
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-white">
                {selected.character.name}
              </span>
              <span className="text-base text-[#c3bdb3]">
                ({selected.character.elo})
              </span>
              <KzFlag size={22} />
            </div>
            <p className="mt-1 text-sm text-[#aaa49a]">
              {selected.character.tagline.ru}
            </p>
          </div>
        </div>

        {/* Speech bubble */}
        <div className="relative rounded-2xl bg-white px-4 py-3 text-base font-semibold leading-snug text-[#312d28] shadow-sm">
          <span
            aria-hidden
            className="absolute -top-[7px] left-8 h-3.5 w-3.5 rotate-45 bg-white"
          />
          <TypewriterLine key={previewLine} text={previewLine} speedMs={20} />
        </div>
      </div>

      {/* Swappable middle: bot grid OR options panel */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {/* Options toggle */}
        <button
          type="button"
          onClick={() => setOptionsOpen(!optionsOpen)}
          className="mb-3 flex w-full items-center justify-between rounded-lg bg-[#33322d] px-4 py-2.5 text-sm font-semibold text-[#d4d0c8] transition hover:bg-[#3e3c37]"
        >
          <span>Настройки</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform duration-200",
              optionsOpen && "rotate-180",
            )}
          />
        </button>

        {optionsOpen ? (
          <BotOptionsSection />
        ) : (
          <div className="rounded-lg bg-[#33322d] p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#aaa49a]">
              Выбери соперника
            </p>
            <div className="grid grid-cols-3 gap-3">
              {items.map((item) => (
                <BotCard
                  key={item.character.id}
                  item={item}
                  active={selected.character.id === item.character.id}
                  onSelect={() => onSelect(item)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom: side picker + play button */}
      <div className="shrink-0 border-t border-[#37342f] bg-[#1f1e1a] px-5 py-5">
        {/* Side picker */}
        <div className="mb-4 flex items-center justify-center gap-3">
          <span className="text-sm font-medium text-[#aaa49a]">Цвет:</span>
          <div className="flex gap-2">
            {SIDE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onSideChange(opt.id)}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full transition",
                  side === opt.id
                    ? "ring-2 ring-[#7ab648] ring-offset-2 ring-offset-[#1f1e1a]"
                    : "opacity-60 hover:opacity-90",
                )}
              >
                <SidePickerIcon side={opt.id} size={28} />
              </button>
            ))}
          </div>
        </div>

        {/* Play button */}
        <button
          type="button"
          onClick={handlePlay}
          className="flex h-16 w-full items-center justify-center gap-3 rounded-xl bg-[#7ab648] text-xl font-extrabold text-white shadow-[inset_0_-4px_0_rgba(0,0,0,0.2)] transition hover:bg-[#85c34f] active:shadow-[inset_0_2px_0_rgba(0,0,0,0.15)]"
        >
          {selected.locked ? (
            <Crown className="h-6 w-6" fill="white" />
          ) : (
            <Play className="h-6 w-6" fill="white" />
          )}
          {selected.locked ? "Разблокировать" : "Играть"}
        </button>
      </div>
    </aside>
  );
}

function BotCard({
  item,
  active,
  onSelect,
}: {
  item: BotSelectionItem;
  active: boolean;
  onSelect: () => void;
}) {
  const { character, locked } = item;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group relative flex flex-col items-center gap-2 overflow-hidden rounded-xl p-3 transition",
        active
          ? "bg-[#44413b] ring-2 ring-[#7ab648]"
          : locked
            ? "hover:bg-[#3a3835]"
            : "hover:bg-[#3a3835]",
      )}
    >
      <div className="relative h-16 w-16 overflow-hidden rounded-md">
        <Image
          src={character.avatar}
          alt={character.name}
          width={64}
          height={64}
          className={cn(
            "h-full w-full object-cover",
            locked && "brightness-[0.42] saturate-[0.7]",
          )}
          unoptimized
        />
        {locked && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#f4c542]/50 bg-[#17140d]/80 shadow-[0_0_18px_rgba(244,197,66,0.28)] backdrop-blur-sm">
              <Lock className="h-5 w-5 text-[#f4c542]" />
            </div>
          </div>
        )}
      </div>
      <div className="text-center">
        <p className={cn("text-xs font-bold", locked ? "text-[#f4d979]" : "text-white")}>
          {character.name}
        </p>
        <p className="text-[10px] text-[#aaa49a]">{character.elo}</p>
        {locked && (
          <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[#f4c542]">
            Pro
          </p>
        )}
      </div>
    </button>
  );
}

function BotOptionsSection() {
  const GAME_VARIANTS = [
    { id: "russian", label: "Русские шашки", available: true },
    { id: "classic", label: "Классические", available: false },
    { id: "international", label: "Международные", available: false },
    { id: "brazilian", label: "Бразильские", available: false },
  ];

  return (
    <div className="space-y-4 rounded-lg bg-[#33322d] p-4">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#aaa49a]">
          Вариант игры
        </p>
        <div className="space-y-1">
          {GAME_VARIANTS.map((v) => (
            <div
              key={v.id}
              className={cn(
                "flex items-center justify-between rounded-lg px-3 py-2 text-sm",
                v.available
                  ? "bg-[#44413b] font-semibold text-white"
                  : "text-[#777471]",
              )}
            >
              <span>{v.label}</span>
              {!v.available && (
                <span className="rounded bg-[#44413b] px-2 py-0.5 text-[10px] font-bold uppercase text-[#aaa49a]">
                  скоро
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-[#d4d0c8]">
            Звуки
          </p>
          <ToggleSwitch defaultOn />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-[#d4d0c8]">
            Координаты
          </p>
          <ToggleSwitch defaultOn />
        </div>
      </div>
    </div>
  );
}

function ToggleSwitch({ defaultOn = false }: { defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <button
      type="button"
      onClick={() => setOn(!on)}
      className={cn(
        "relative h-[26px] w-[46px] rounded-full transition-colors",
        on ? "bg-[#7ab648]" : "bg-[#555249]",
      )}
    >
      <span
        className={cn(
          "absolute top-[3px] left-[2px] h-5 w-5 rounded-full bg-white shadow transition-transform",
          on && "translate-x-[20px]",
        )}
      />
    </button>
  );
}
