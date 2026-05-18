"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { Character, Locale } from "@/lib/coach/characters";
import type { CoachSituation } from "@/lib/coach/featherless";

interface CoachBubbleProps {
  character: Character;
  /** Pre-canned line shown immediately (e.g. greeting). If `situation` is also
   *  provided, the streamed LLM reply replaces this once it starts arriving. */
  initialLine?: string;
  /** Adaptive situation — triggers a streamed LLM reply when set. */
  situation?: CoachSituation | null;
  locale?: Locale;
  /** Position the bubble relative to the avatar — left = avatar on right, etc. */
  side?: "left" | "right";
  className?: string;
}

/**
 * Speech-bubble display for a coach or bot.
 *
 * Two text sources, layered:
 *   1. `initialLine` — instant canned line (no network).
 *   2. `situation`   — streams from /api/coach/stream, replacing the line as
 *                      tokens arrive. Renders with a blinking caret while
 *                      streaming so the typewriter effect reads naturally.
 *
 * Aborts the in-flight stream if the situation changes or component unmounts.
 */
export function CoachBubble({
  character,
  initialLine,
  situation,
  locale = "ru",
  side = "left",
  className,
}: CoachBubbleProps) {
  const [text, setText] = useState<string>(initialLine ?? "");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Reset text when initial line changes (e.g. new game).
  useEffect(() => {
    if (!situation) setText(initialLine ?? "");
  }, [initialLine, situation]);

  // Stream from API when situation is set.
  useEffect(() => {
    if (!situation) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStreaming(true);
    setText("");

    (async () => {
      try {
        const res = await fetch("/api/coach/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterId: character.id,
            locale,
            situation,
          }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          setStreaming(false);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let acc = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") break;
            try {
              const json = JSON.parse(payload) as { delta?: string; error?: string };
              if (json.error) {
                setStreaming(false);
                return;
              }
              if (json.delta) {
                acc += json.delta;
                setText(acc);
              }
            } catch {
              // ignore
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        // Network error — keep whatever we have.
      } finally {
        setStreaming(false);
      }
    })();

    return () => ctrl.abort();
  }, [situation, character.id, locale]);

  return (
    <div
      className={cn(
        "flex items-start gap-2.5",
        side === "right" && "flex-row-reverse",
        className
      )}
    >
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-[color:var(--border-base)] bg-[color:var(--bg-elevated)]">
        <Image
          src={character.avatar}
          alt={character.name}
          width={48}
          height={48}
          className="h-full w-full object-cover"
          onError={(e) => {
            // Avatar not yet generated — fall back to initial letter.
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        {/* Fallback overlay always rendered behind so missing-image case looks intentional */}
        <div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center text-base font-display font-semibold text-[color:var(--text-secondary)]">
          {character.name[0]}
        </div>
      </div>

      <div
        className={cn(
          "relative max-w-[280px] rounded-2xl bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-md",
          side === "left" ? "rounded-tl-sm" : "rounded-tr-sm"
        )}
      >
        {/* Tail */}
        <span
          aria-hidden
          className={cn(
            "absolute top-3 h-3 w-3 rotate-45 bg-white",
            side === "left" ? "-left-1" : "-right-1"
          )}
        />
        {text || (streaming ? "…" : initialLine ?? "")}
        {streaming && (
          <span className="ml-0.5 inline-block h-3 w-[2px] animate-pulse bg-zinc-700 align-middle" />
        )}
      </div>
    </div>
  );
}
