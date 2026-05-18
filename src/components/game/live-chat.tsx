"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import type { ChatMsg } from "@/lib/realtime/protocol";
import { cn } from "@/lib/utils";

interface LiveChatProps {
  messages: ChatMsg[];
  myPlayerId: string;
  onSend: (text: string) => void;
  className?: string;
}

export function LiveChat({ messages, myPlayerId, onSend, className }: LiveChatProps) {
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function submit() {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div className={cn("flex flex-col rounded-xl border border-[color:var(--border-base)] bg-[color:var(--bg-surface)]", className)}>
      <div className="border-b border-[color:var(--border-base)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
        Чат
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {messages.length === 0 && (
          <p className="text-center text-xs text-[color:var(--text-muted)] py-4">
            Напишите первое сообщение
          </p>
        )}
        {messages.map((msg) => {
          const mine = msg.playerId === myPlayerId;
          return (
            <div key={msg.id} className={cn("mb-2 flex flex-col", mine ? "items-end" : "items-start")}>
              <span className="mb-0.5 text-[10px] text-[color:var(--text-muted)]">
                {msg.nick}
              </span>
              <span
                className={cn(
                  "max-w-[80%] rounded-lg px-2.5 py-1.5 text-xs leading-snug",
                  mine
                    ? "bg-[color:var(--accent)] text-[#1A1408]"
                    : "bg-[color:var(--bg-elevated)] text-[color:var(--text-primary)]"
                )}
              >
                {msg.text}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 border-t border-[color:var(--border-base)] p-2">
        <input
          type="text"
          maxLength={200}
          placeholder="Сообщение…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="min-w-0 flex-1 rounded-md border border-[color:var(--border-base)] bg-[color:var(--bg-elevated)] px-2 py-1.5 text-xs text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[color:var(--accent)]"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!draft.trim()}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-[color:var(--accent)] text-[#1A1408] disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
