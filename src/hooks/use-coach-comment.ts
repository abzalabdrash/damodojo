"use client";

import { useEffect, useRef, useState } from "react";
import { buildAtaMoveReviewContext } from "@/lib/coach/ata";
import type { ReviewedMove } from "@/lib/engine-ai/review/index";

interface State {
  comment: string | null;
  loading: boolean;
  error: string | null;
}

export function useCoachComment(
  move: ReviewedMove | undefined,
  moveNumber: number,
  totalMoves: number
): State {
  const [cache, setCache] = useState<ReadonlyMap<number, string>>(() => new Map());
  const [state, setState] = useState<State>({ comment: null, loading: false, error: null });
  const abortRef = useRef<AbortController | null>(null);

  const cachedFor = move ? cache.get(move.ply) ?? null : null;

  useEffect(() => {
    if (!move) return;
    if (cache.has(move.ply)) return; // already cached → no fetch

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Mark as loading before kicking off the fetch. Setting state inside an
    // effect is the standard React pattern for "begin async work" — the
    // upcoming fetch will overwrite this with the resolved value.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ comment: null, loading: true, error: null });

    fetch("/api/coach/comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        move,
        moveNumber,
        totalMoves,
        ataContext: buildAtaMoveReviewContext(move, totalMoves),
      }),
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data: { comment?: string; error?: string }) => {
        if (controller.signal.aborted) return;
        if (data.comment) {
          setCache((prev) => {
            const next = new Map(prev);
            next.set(move.ply, data.comment!);
            return next;
          });
          setState({ comment: data.comment, loading: false, error: null });
        } else {
          setState({ comment: null, loading: false, error: data.error ?? "Нет ответа" });
        }
      })
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        setState({ comment: null, loading: false, error: err.message });
      });

    return () => controller.abort();
  }, [move, moveNumber, totalMoves, cache]);

  return {
    comment: cachedFor ?? state.comment,
    loading: cachedFor ? false : state.loading,
    error: cachedFor ? null : state.error,
  };
}
