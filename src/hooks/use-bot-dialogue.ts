"use client";

import { useCallback, useRef, useState } from "react";
import {
  collapseRepeatedLiveComment,
  shouldKeepPreviousLiveComment,
} from "@/lib/coach/live-commentary";
import type { CoachSituation } from "@/lib/coach/featherless";
import { cleanTrainerOutput } from "@/lib/coach/sanitize";

interface UseBotDialogueResult {
  /** Previous comments shown only during short overlap windows. */
  history: string[];
  /** Currently streaming / latest comment. */
  comment: string;
  streaming: boolean;
  triggerComment: (
    characterId: string,
    situation: CoachSituation,
    instantLine?: string,
  ) => void;
}

export function useBotDialogue(fallback: string): UseBotDialogueResult {
  const [history, setHistory] = useState<string[]>([]);
  const [comment, setComment] = useState(fallback);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const currentRef = useRef(fallback);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequenceRef = useRef(0);
  const visibleUntilRef = useRef(0);
  const recentLinesRef = useRef<string[]>([]);

  const clearLater = useCallback((sequence: number) => {
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    visibleUntilRef.current = Date.now() + 2_000;
    clearTimerRef.current = setTimeout(() => {
      if (sequenceRef.current !== sequence) return;
      currentRef.current = "";
      visibleUntilRef.current = 0;
      setComment("");
      setHistory([]);
      setStreaming(false);
    }, 2_000);
  }, []);

  const triggerComment = useCallback(
    (characterId: string, situation: CoachSituation, instantLine?: string) => {
      abortRef.current?.abort();
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      const sequence = sequenceRef.current + 1;
      sequenceRef.current = sequence;
      const controller = new AbortController();
      abortRef.current = controller;

      const prev = currentRef.current;
      if (
        shouldKeepPreviousLiveComment({
          now: Date.now(),
          previousVisibleUntil: visibleUntilRef.current,
          previousText: prev,
          fallbackText: fallback,
        })
      ) {
        setHistory((h) => (h[h.length - 1] === prev ? h : [...h.slice(-1), prev]));
      } else {
        setHistory([]);
      }

      const initial = instantLine ?? "";
      setComment(initial);
      currentRef.current = initial;
      setStreaming(true);

      const situationWithMemory: CoachSituation =
        situation.mode === "trainer-live"
          ? { ...situation, recentCoachLines: recentLinesRef.current.slice(-3) }
          : situation;

      fetch("/api/coach/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, locale: "ru", situation: situationWithMemory }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok || !res.body) {
            const final = initial || fallback;
            currentRef.current = final;
            setComment(final);
            setStreaming(false);
            clearLater(sequence);
            return;
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let accumulated = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const payload = line.slice(6).trim();
              if (payload === "[DONE]") break;
              try {
                const parsed = JSON.parse(payload) as {
                  delta?: string;
                  error?: string;
                };
                if (parsed.delta) {
                  accumulated += parsed.delta;
                  const display = collapseRepeatedLiveComment(accumulated);
                  currentRef.current = display;
                  setComment(display);
                }
              } catch {
                // skip malformed frames
              }
            }
          }

          const collapsed = collapseRepeatedLiveComment(accumulated);
          const sanitized = situation.mode === "trainer-live"
            ? cleanTrainerOutput(collapsed)
            : collapsed;
          const final = sanitized || initial || fallback;
          currentRef.current = final;
          setComment(final);
          if (final && final !== fallback) {
            recentLinesRef.current = [...recentLinesRef.current.slice(-5), final];
          }
          setStreaming(false);
          clearLater(sequence);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            const final = initial || fallback;
            currentRef.current = final;
            setComment(final);
            setStreaming(false);
            clearLater(sequence);
          }
        });
    },
    [clearLater, fallback],
  );

  return { history, comment, streaming, triggerComment };
}
