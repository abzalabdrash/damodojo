"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Share2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ShareRoomCardProps {
  roomUrl: string;
  className?: string;
}

export function ShareRoomCard({ roomUrl, className }: ShareRoomCardProps) {
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  async function copy() {
    await navigator.clipboard.writeText(roomUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function cancel() {
    router.push("/play");
  }

  const waUrl = `https://wa.me/?text=${encodeURIComponent(`Играем в шашки! ${roomUrl}`)}`;
  const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(roomUrl)}&text=${encodeURIComponent("Играем в шашки!")}`;

  return (
    <div className={cn("rounded-xl border border-[color:var(--border-base)] bg-[color:var(--bg-surface)] p-4", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--text-primary)]">
          <Share2 className="h-4 w-4 text-[color:var(--accent)]" />
          Пригласить соперника
        </div>
        <button
          type="button"
          onClick={cancel}
          className="inline-flex items-center gap-1 rounded-md border border-[color:var(--border-base)] bg-[color:var(--bg-elevated)] px-2 py-1 text-[11px] text-[color:var(--text-muted)] transition-colors hover:border-red-500/60 hover:text-red-400"
          aria-label="Отменить и вернуться в меню"
        >
          <X className="h-3 w-3" />
          Отменить
        </button>
      </div>

      <div className="mb-3 flex items-center gap-2 rounded-lg border border-[color:var(--border-base)] bg-[color:var(--bg-elevated)] px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-[color:var(--text-secondary)]">
          {roomUrl}
        </span>
        <button
          type="button"
          onClick={copy}
          className="ml-1 shrink-0 rounded-md p-1 text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--accent)]"
        >
          {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>

      <div className="flex gap-2">
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 rounded-lg border border-[color:var(--border-base)] bg-[color:var(--bg-elevated)] py-2 text-center text-xs font-medium text-[color:var(--text-secondary)] hover:border-green-500/60 hover:text-green-400 transition-colors"
        >
          WhatsApp
        </a>
        <a
          href={tgUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 rounded-lg border border-[color:var(--border-base)] bg-[color:var(--bg-elevated)] py-2 text-center text-xs font-medium text-[color:var(--text-secondary)] hover:border-blue-500/60 hover:text-blue-400 transition-colors"
        >
          Telegram
        </a>
      </div>
    </div>
  );
}
