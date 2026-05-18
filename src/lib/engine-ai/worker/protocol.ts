import type {
  EngineAnalysis,
  EngineAnalyzeOptions,
} from "../engine";
import type { SerializableGameState } from "../io/serializable";
import type { Move } from "@/lib/engine";
import type { GameReview, ReviewedMove, ReviewOptions } from "../review/index";

export interface EngineWorkerAnalyzePayload {
  readonly state: SerializableGameState;
  readonly maxDepth?: number;
  readonly timeMs?: number;
}

export interface EngineWorkerReviewPayload {
  readonly history: readonly Move[];
  readonly options: ReviewOptions;
}

export type EngineWorkerRequest =
  | {
      readonly type: "analyze";
      readonly id: number;
      readonly payload: EngineWorkerAnalyzePayload;
    }
  | {
      readonly type: "bestMove";
      readonly id: number;
      readonly payload: EngineWorkerAnalyzePayload;
    }
  | {
      readonly type: "review";
      readonly id: number;
      readonly payload: EngineWorkerReviewPayload;
    }
  | {
      readonly type: "stop";
      readonly id: number;
    };

export type EngineWorkerResponse =
  | {
      readonly type: "info";
      readonly id: number;
      readonly info: EngineAnalysis;
    }
  | {
      readonly type: "done";
      readonly id: number;
      readonly result: EngineAnalysis;
    }
  | {
      readonly type: "reviewProgress";
      readonly id: number;
      readonly move: ReviewedMove;
      readonly plyDone: number;
      readonly total: number;
    }
  | {
      readonly type: "reviewDone";
      readonly id: number;
      readonly result: GameReview;
    }
  | {
      readonly type: "error";
      readonly id: number;
      readonly error: string;
    };

export type BridgeAnalyzeOptions = Omit<EngineAnalyzeOptions, "state"> & {
  readonly state: SerializableGameState;
};

export function isEngineWorkerRequest(value: unknown): value is EngineWorkerRequest {
  if (!value || typeof value !== "object") return false;
  const maybe = value as { type?: unknown; id?: unknown; payload?: unknown };
  if (typeof maybe.id !== "number") return false;
  if (maybe.type === "stop") return true;
  if (maybe.type === "review") return isReviewPayload(maybe.payload);
  if (maybe.type !== "analyze" && maybe.type !== "bestMove") return false;
  return isAnalyzePayload(maybe.payload);
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isAnalyzePayload(value: unknown): value is EngineWorkerAnalyzePayload {
  if (!value || typeof value !== "object") return false;
  const maybe = value as { state?: unknown };
  return !!maybe.state;
}

function isReviewPayload(value: unknown): value is EngineWorkerReviewPayload {
  if (!value || typeof value !== "object") return false;
  const maybe = value as { history?: unknown };
  return Array.isArray(maybe.history);
}
