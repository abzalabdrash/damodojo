import { describe, expect, it, vi } from "vitest";

import { initialState } from "@/lib/engine";
import {
  Engine,
  deserializeGameState,
  fastMoveToPublicMove,
  fromGameState,
  generateFastMoves,
  isEngineWorkerRequest,
  serializeGameState,
} from "../index";
import { createEngineWorkerBridge } from "../worker/bridge";
import type { EngineWorkerResponse } from "../worker/protocol";

describe("engine-ai public API", () => {
  it("serializes and deserializes GameState without losing board metadata", () => {
    const state = initialState();
    const roundTrip = deserializeGameState(serializeGameState(state));

    expect(roundTrip.turn).toBe(state.turn);
    expect(roundTrip.halfmoveClock).toBe(state.halfmoveClock);
    expect(roundTrip.ply).toBe(state.ply);
    expect(roundTrip.board).toEqual(state.board);
    expect(roundTrip.history).toEqual([]);
  });

  it("converts FastMove to a public Move", () => {
    const state = initialState();
    const fast = fromGameState(state);
    const move = fastMoveToPublicMove(generateFastMoves(fast)[0]);

    expect(move.path).toHaveLength(1);
    expect(move.from).toEqual({ row: 5, col: expect.any(Number) });
    expect(move.to.row).toBe(4);
  });

  it("returns legal public moves from analyze and bestMove", async () => {
    // useBook: false for determinism — book uses Math.random() for variety
    const engine = new Engine({ defaultMaxDepth: 3, defaultTimeMs: 500, useBook: false });
    const state = initialState();

    const info = vi.fn();
    const analysis = await engine.analyze({ state }, info);
    const move = await engine.bestMove({ state });

    expect(analysis.bestMove).not.toBeNull();
    expect(move).toEqual(analysis.bestMove);
    expect(analysis.depth).toBeGreaterThanOrEqual(1);
    expect(analysis.nodes).toBeGreaterThan(0);
    expect(info).toHaveBeenCalled();
  });
});

describe("engine-ai worker protocol and bridge", () => {
  it("accepts known request types and rejects unknown messages", () => {
    expect(isEngineWorkerRequest({ type: "stop", id: 1 })).toBe(true);
    expect(isEngineWorkerRequest({ type: "wat", id: 1 })).toBe(false);
    expect(isEngineWorkerRequest(null)).toBe(false);
  });

  it("resolves info and done messages from a worker", async () => {
    const worker = new FakeWorker();
    const bridge = createEngineWorkerBridge(() => worker as unknown as Worker);
    const onInfo = vi.fn();
    const promise = bridge.analyze(
      { state: serializeGameState(initialState()), maxDepth: 2, timeMs: 100 },
      onInfo
    );

    const sent = worker.lastPosted();
    const id = sent.id as number;
    worker.emit({ type: "info", id, info: partialResult(1) });
    worker.emit({ type: "done", id, result: partialResult(2) });

    await expect(promise).resolves.toMatchObject({ depth: 2 });
    expect(onInfo).toHaveBeenCalledWith(expect.objectContaining({ depth: 1 }));
  });

  it("rejects worker errors and ignores stale ids", async () => {
    const worker = new FakeWorker();
    const bridge = createEngineWorkerBridge(() => worker as unknown as Worker);
    const first = bridge.bestMove({
      state: serializeGameState(initialState()),
      maxDepth: 1,
      timeMs: 100,
    });
    const second = bridge.bestMove({
      state: serializeGameState(initialState()),
      maxDepth: 1,
      timeMs: 100,
    });

    const [firstMsg, secondMsg] = worker.messages;
    worker.emit({ type: "done", id: 9999, result: partialResult(1) });
    worker.emit({ type: "error", id: firstMsg.id as number, error: "boom" });
    worker.emit({ type: "done", id: secondMsg.id as number, result: partialResult(1) });

    await expect(first).rejects.toThrow("boom");
    await expect(second).resolves.toMatchObject({ depth: 1 });
  });
});

function partialResult(depth: number) {
  return {
    bestMove: null,
    score: 0,
    depth,
    nodes: depth,
    nps: depth * 100,
    elapsedMs: 1,
    pv: [],
  };
}

class FakeWorker {
  readonly messages: Array<Record<string, unknown>> = [];
  private listeners = new Map<string, Set<(event: MessageEvent) => void>>();

  postMessage(message: Record<string, unknown>): void {
    this.messages.push(message);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  terminate(): void {}

  emit(data: EngineWorkerResponse): void {
    for (const listener of this.listeners.get("message") ?? []) {
      listener({ data } as MessageEvent);
    }
  }

  lastPosted(): Record<string, unknown> {
    return this.messages[this.messages.length - 1];
  }
}
