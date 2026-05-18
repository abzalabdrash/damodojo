"use client";

import Image from "next/image";
import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

export type BotId = "ata" | "kanat" | "zhanar" | "temir" | "aigerim" | "talgat";

interface BotAvatarProps {
  bot: BotId;
  size?: number;
  glow?: boolean;
  className?: string;
}

const BOT_AVATAR_META: Record<BotId, { name: string; icon: string; accent: string }> = {
  ata: {
    name: "Ата",
    icon: "/bots/ata/icon.webp",
    accent: "rgba(201,162,39,0.75)",
  },
  kanat: {
    name: "Канат",
    icon: "/bots/kanat/icon.webp",
    accent: "rgba(79,143,232,0.65)",
  },
  zhanar: {
    name: "Жанар",
    icon: "/bots/zhanar/icon.webp",
    accent: "rgba(192,93,255,0.62)",
  },
  temir: {
    name: "Темир",
    icon: "/bots/temir/icon.webp",
    accent: "rgba(75,155,97,0.62)",
  },
  aigerim: {
    name: "Айгерим",
    icon: "/bots/aigerim/icon.webp",
    accent: "rgba(45,78,138,0.72)",
  },
  talgat: {
    name: "Талгат",
    icon: "/bots/talgat/icon.webp",
    accent: "rgba(212,74,58,0.66)",
  },
};

export function BotAvatar({ bot, size = 96, glow = false, className }: BotAvatarProps) {
  const meta = BOT_AVATAR_META[bot];

  return (
    <span
      className={cn(
        "relative inline-flex overflow-hidden rounded-full border border-[color:var(--border-base)] bg-[color:var(--bg-elevated)]",
        glow && "shadow-[0_0_42px_-12px_var(--bot-avatar-glow)]",
        className
      )}
      style={{
        width: size,
        height: size,
        "--bot-avatar-glow": meta.accent,
      } as CSSProperties}
    >
      <Image
        src={meta.icon}
        alt={meta.name}
        width={size}
        height={size}
        className="h-full w-full object-cover"
        draggable={false}
        unoptimized
      />
    </span>
  );
}
