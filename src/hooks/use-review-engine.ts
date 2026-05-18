"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Move } from "@/lib/engine";
import type { GameReview, ReviewedMove, ReviewOptions } from "@/lib/engine-ai/review/index";
import { createEngineWorkerBridge, type EngineWorkerBridge } from "@/lib/engine-ai/worker/bridge";

export type ReviewStatus = "idle" | "loading" | "done" | "error";

interface ReviewState {
  readonly status: ReviewStatus;
  readonly progressMoves: readonly ReviewedMove[];
  readonly progressPct: number;
  readonly review: GameReview | null;
  readonly error: string | null;
}

const INITIAL: ReviewState = {
  status: "idle",
  progressMoves: [],
  progressPct: 0,
  review: null,
  error: null,
};

export function useReviewEngine() {
  const bridgeRef = useRef<EngineWorkerBridge | null>(null);
  const requestIdRef = useRef(0);
  const [state, setState] = useState<ReviewState>(INITIAL);

  const ensureBridge = useCallback(() => {
    if (bridgeRef.current) return bridgeRef.current;
    if (typeof window === "undefined") return null;
    bridgeRef.current = createEngineWorkerBridge(
      () =>
        new Worker(
          new URL("../lib/engine-ai/worker/engine.worker.ts", import.meta.url),
          { type: "module" }
        )
    );
    return bridgeRef.current;
  }, []);

  const startReview = useCallback(
    async (history: readonly Move[], options?: ReviewOptions) => {
      const bridge = ensureBridge();
      if (!bridge || history.length === 0) return;

      const requestId = ++requestIdRef.current;
      const total = options?.maxPly ?? history.length;

      setState({
        status: "loading",
        progressMoves: [],
        progressPct: 0,
        review: null,
        error: null,
      });

      try {
        const result = await bridge.review(
          { history, options: options ?? {} },
          (move, plyDone, _total) => {
            if (requestIdRef.current !== requestId) return;
            setState((prev) => ({
              ...prev,
              progressMoves: [...prev.progressMoves, move],
              progressPct: Math.round((plyDone / (total || 1)) * 100),
            }));
          }
        );

        if (requestIdRef.current !== requestId) return;
        setState({
          status: "done",
          progressMoves: result.moves as ReviewedMove[],
          progressPct: 100,
          review: result,
          error: null,
        });
      } catch (err) {
        if (requestIdRef.current !== requestId) return;
        setState({
          status: "error",
          progressMoves: [],
          progressPct: 0,
          review: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [ensureBridge]
  );

  const cancel = useCallback(() => {
    requestIdRef.current++;
    bridgeRef.current?.stop();
    setState((prev) => ({ ...prev, status: "idle" }));
  }, []);

  useEffect(() => {
    const bridge = bridgeRef;
    const reqId = requestIdRef;
    return () => {
      reqId.current++;
      bridge.current?.terminate();
      bridge.current = null;
    };
  }, []);

  return {
    status: state.status,
    progressMoves: state.progressMoves,
    progressPct: state.progressPct,
    review: state.review,
    error: state.error,
    startReview,
    cancel,
  };
}
