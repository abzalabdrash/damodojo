"use client";

import { useState } from "react";

import { GameBoard } from "@/components/board/game-board";
import { AppSidebar } from "@/components/app-sidebar";
import { BotSelectionPanel } from "@/components/bot/bot-selection-panel";
import { KzFlag } from "@/components/ui/kz-flag";
import {
  getBotSelectionItems,
  type BotSelectionItem,
  type BotSideOptionId,
} from "@/lib/coach/bot-selection";

export default function BotsPage() {
  const items = getBotSelectionItems();
  const [selected, setSelected] = useState<BotSelectionItem>(items[0]);
  const [side, setSide] = useState<BotSideOptionId>("white");

  const flipped = side === "black";

  return (
    <div className="flex h-svh overflow-hidden bg-[#302f2b] text-white">
      <AppSidebar />

      <main className="flex min-w-0 flex-1 items-center justify-center px-4 py-4 lg:px-10">
        <div className="flex w-full max-w-[min(78svh,840px)] flex-col gap-3">
          {/* Opponent (bot) strip */}
          <div className="flex h-14 items-center gap-3">
            <div className="h-11 w-11 overflow-hidden rounded bg-[#44413b]">
              <img
                src={selected.character.avatar}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xl font-bold">
                <span>{selected.character.name}</span>
                <span className="font-normal text-[#c3bdb3]">
                  ({selected.character.elo})
                </span>
                <KzFlag size={28} />
              </div>
              <p className="text-sm text-[#aaa49a]">
                Выбери соперника справа и начинай партию
              </p>
            </div>
          </div>

          {/* Board — non-interactive on selection page */}
          <div className="w-full">
            <GameBoard flipped={flipped} disabled />
          </div>

          {/* Player strip */}
          <div className="flex h-14 items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded bg-[#eee8dc]">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <circle cx="14" cy="10" r="5.5" fill="#8B7E6A" />
                <path
                  d="M3 26c0-6.075 4.925-11 11-11s11 4.925 11 11"
                  fill="#8B7E6A"
                />
              </svg>
            </div>
            <div className="flex items-center gap-2 text-xl font-bold">
              <span>Игрок</span>
              <KzFlag size={28} />
            </div>
          </div>
        </div>
      </main>

      <BotSelectionPanel
        items={items}
        selected={selected}
        side={side}
        onSelect={setSelected}
        onSideChange={setSide}
      />
    </div>
  );
}
