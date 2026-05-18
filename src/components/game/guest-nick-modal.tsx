"use client";

import { useState } from "react";
import { saveNick } from "@/lib/realtime/identity";
import { Button } from "@/components/ui/button";

interface GuestNickModalProps {
  onConfirm: (nick: string) => void;
}

export function GuestNickModal({ onConfirm }: GuestNickModalProps) {
  const [nick, setNick] = useState("");

  function submit() {
    const trimmed = nick.trim().slice(0, 24);
    if (!trimmed) return;
    saveNick(trimmed);
    onConfirm(trimmed);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-[color:var(--border-base)] bg-[color:var(--bg-surface)] p-6 shadow-2xl">
        <h2 className="mb-1 font-display text-lg font-semibold text-[color:var(--text-primary)]">
          Как вас зовут?
        </h2>
        <p className="mb-4 text-sm text-[color:var(--text-secondary)]">
          Введите ник — соперник увидит его во время партии.
        </p>
        <input
          autoFocus
          type="text"
          maxLength={24}
          placeholder="Ваш ник"
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="mb-4 w-full rounded-lg border border-[color:var(--border-base)] bg-[color:var(--bg-elevated)] px-3 py-2 text-sm text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
        />
        <Button
          variant="primary"
          size="md"
          className="w-full"
          onClick={submit}
          disabled={!nick.trim()}
        >
          Войти в комнату
        </Button>
      </div>
    </div>
  );
}
