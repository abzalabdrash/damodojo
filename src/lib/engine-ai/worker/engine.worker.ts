/// <reference lib="webworker" />

import { initialState, applyMove } from "@/lib/engine";
import type { Move } from "@/lib/engine";
import { Engine } from "../engine";
import { loadDamaNetWeights } from "../nn/loader";
import {
  errorMessage,
  isEngineWorkerRequest,
  type EngineWorkerResponse,
} from "./protocol";

const engine = new Engine();

// Fire-and-forget NN weights load. If the assets aren't shipped yet
// the classical evaluator is used unchanged.
loadDamaNetWeights().then((res) => {
  if (res.loaded) {
    console.info(`[engine.worker] NN weights loaded (${res.bytes} bytes)`);
  } else if (res.error && res.error !== "already attempted") {
    console.info(`[engine.worker] NN weights not loaded: ${res.error} — using classical eval`);
  }
});

function buildGameStateSequence(history: readonly Move[]) {
  const states = [initialState()];
  let current = initialState();
  for (const move of history) {
    current = applyMove(current, move);
    states.push(current);
  }
  return states;
}

self.addEventListener("message", async (event: MessageEvent<unknown>) => {
  const message = event.data;
  if (!isEngineWorkerRequest(message)) {
    self.postMessage({
      type: "error",
      id: -1,
      error: "Unknown engine worker request",
    } satisfies EngineWorkerResponse);
    return;
  }

  if (message.type === "stop") {
    engine.stop();
    return;
  }

  if (message.type === "review") {
    try {
      const { history, options } = message.payload;
      const states = buildGameStateSequence(history);
      const total = Math.min(history.length, options.maxPly ?? history.length);

      const result = await engine.review(states, history as Move[], options, (ply, _total, move) => {
        self.postMessage({
          type: "reviewProgress",
          id: message.id,
          move,
          plyDone: ply + 1,
          total,
        } satisfies EngineWorkerResponse);
      });

      self.postMessage({
        type: "reviewDone",
        id: message.id,
        result,
      } satisfies EngineWorkerResponse);
    } catch (error) {
      self.postMessage({
        type: "error",
        id: message.id,
        error: errorMessage(error),
      } satisfies EngineWorkerResponse);
    }
    return;
  }

  try {
    const result = await engine.analyze(message.payload, (info) => {
      if (message.type === "analyze") {
        self.postMessage({
          type: "info",
          id: message.id,
          info,
        } satisfies EngineWorkerResponse);
      }
    });

    self.postMessage({
      type: "done",
      id: message.id,
      result,
    } satisfies EngineWorkerResponse);
  } catch (error) {
    self.postMessage({
      type: "error",
      id: message.id,
      error: errorMessage(error),
    } satisfies EngineWorkerResponse);
  }
});
