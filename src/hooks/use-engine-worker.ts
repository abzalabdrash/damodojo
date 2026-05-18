"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { EngineAnalysis } from "@/lib/engine-ai";
import { serializeGameState, type SerializableGameState } from "@/lib/engine-ai";
import { createEngineWorkerBridge, type EngineWorkerBridge } from "@/lib/engine-ai/worker/bridge";
import type { GameState } from "@/lib/engine";

interface AnalyzeOptions {
  readonly state: GameState;
  readonly maxDepth?: number;
  readonly timeMs?: number;
}

interface WorkerState {
  readonly latest: EngineAnalysis | null;
  readonly thinking: boolean;
  readonly error: string | null;
}

export function useEngineWorker() {
  const bridgeRef = useRef<EngineWorkerBridge | null>(null);
  const requestIdRef = useRef(0);
  const [state, setState] = useState<WorkerState>({
    latest: null,
    thinking: false,
    error: null,
  });

  const ensureBridge = useCallback(() => {
    if (bridgeRef.current) return bridgeRef.current;
    if (typeof window === "undefined") return null;
    bridgeRef.current = createEngineWorkerBridge(
      () =>
        new Worker(new URL("../lib/engine-ai/worker/engine.worker.ts", import.meta.url), {
          type: "module",
        })
    );
    return bridgeRef.current;
  }, []);

  const analyze = useCallback(
    async (options: AnalyzeOptions): Promise<EngineAnalysis | null> => {
      const bridge = ensureBridge();
      if (!bridge) return null;
      const requestId = ++requestIdRef.current;
      const payload = toPayload(options);
      setState((current) => ({ ...current, thinking: true, error: null }));

      try {
        const result = await bridge.analyze(payload, (info) => {
          if (requestIdRef.current !== requestId) return;
          setState({ latest: info, thinking: true, error: null });
        });
        if (requestIdRef.current !== requestId) return null;
        setState({ latest: result, thinking: false, error: null });
        return result;
      } catch (error) {
        if (requestIdRef.current === requestId) {
          setState({
            latest: null,
            thinking: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return null;
      }
    },
    [ensureBridge]
  );

  const bestMove = useCallback(
    async (options: AnalyzeOptions): Promise<EngineAnalysis | null> => {
      const bridge = ensureBridge();
      if (!bridge) return null;
      const requestId = ++requestIdRef.current;
      setState((current) => ({ ...current, thinking: true, error: null }));

      try {
        const result = await bridge.bestMove(toPayload(options));
        if (requestIdRef.current !== requestId) return null;
        setState({ latest: result, thinking: false, error: null });
        return result;
      } catch (error) {
        if (requestIdRef.current === requestId) {
          setState({
            latest: null,
            thinking: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return null;
      }
    },
    [ensureBridge]
  );

  const stop = useCallback(() => {
    requestIdRef.current++;
    bridgeRef.current?.stop();
    setState((current) => ({ ...current, thinking: false }));
  }, []);

  useEffect(() => {
    const requestId = requestIdRef;
    const bridge = bridgeRef;
    return () => {
      requestId.current++;
      bridge.current?.terminate();
      bridge.current = null;
    };
  }, []);

  return useMemo(
    () => ({
      latest: state.latest,
      thinking: state.thinking,
      error: state.error,
      analyze,
      bestMove,
      stop,
    }),
    [analyze, bestMove, state.error, state.latest, state.thinking, stop]
  );
}

function toPayload(options: AnalyzeOptions): {
  state: SerializableGameState;
  maxDepth?: number;
  timeMs?: number;
} {
  return {
    state: serializeGameState(options.state),
    maxDepth: options.maxDepth,
    timeMs: options.timeMs,
  };
}
