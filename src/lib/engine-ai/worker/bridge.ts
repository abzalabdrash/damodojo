import type { EngineAnalysis } from "../engine";
import type { GameReview, ReviewedMove } from "../review/index";
import type {
  BridgeAnalyzeOptions,
  EngineWorkerReviewPayload,
  EngineWorkerRequest,
  EngineWorkerResponse,
} from "./protocol";

interface PendingRequest {
  readonly resolve: (result: EngineAnalysis) => void;
  readonly reject: (error: Error) => void;
  readonly onInfo?: (info: EngineAnalysis) => void;
}

interface PendingReview {
  readonly resolve: (result: GameReview) => void;
  readonly reject: (error: Error) => void;
  readonly onProgress?: (move: ReviewedMove, plyDone: number, total: number) => void;
}

export interface EngineWorkerBridge {
  analyze(
    options: BridgeAnalyzeOptions,
    onInfo?: (info: EngineAnalysis) => void
  ): Promise<EngineAnalysis>;
  bestMove(options: BridgeAnalyzeOptions): Promise<EngineAnalysis>;
  review(
    payload: EngineWorkerReviewPayload,
    onProgress?: (move: ReviewedMove, plyDone: number, total: number) => void
  ): Promise<GameReview>;
  stop(): void;
  terminate(): void;
}

export type WorkerFactory = () => Worker;

export function createEngineWorkerBridge(factory: WorkerFactory): EngineWorkerBridge {
  let worker = factory();
  let nextId = 0;
  const pending = new Map<number, PendingRequest>();
  const pendingReviews = new Map<number, PendingReview>();

  const handleMessage = (event: MessageEvent<EngineWorkerResponse>) => {
    const message = event.data;

    if (message.type === "reviewProgress") {
      const review = pendingReviews.get(message.id);
      review?.onProgress?.(message.move, message.plyDone, message.total);
      return;
    }

    if (message.type === "reviewDone") {
      const review = pendingReviews.get(message.id);
      if (review) {
        pendingReviews.delete(message.id);
        review.resolve(message.result);
      }
      return;
    }

    // Route errors to the right pending map (review or analyze)
    if (message.type === "error") {
      const reviewReq = pendingReviews.get(message.id);
      if (reviewReq) {
        pendingReviews.delete(message.id);
        reviewReq.reject(new Error(message.error));
        return;
      }
      const req = pending.get(message.id);
      if (req) {
        pending.delete(message.id);
        req.reject(new Error(message.error));
      }
      return;
    }

    const request = pending.get(message.id);
    if (!request) return;

    if (message.type === "info") {
      request.onInfo?.(message.info);
      return;
    }

    pending.delete(message.id);
    request.resolve(message.result);
  };

  const handleError = (event: ErrorEvent) => {
    rejectAll(new Error(event.message || "Engine worker error"));
  };

  const handleMessageError = () => {
    rejectAll(new Error("Engine worker message error"));
  };

  const rejectAll = (error: Error) => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    for (const review of pendingReviews.values()) review.reject(error);
    pendingReviews.clear();
  };

  function bind(current: Worker): void {
    current.addEventListener("message", handleMessage);
    current.addEventListener("error", handleError);
    current.addEventListener("messageerror", handleMessageError);
  }

  function unbind(current: Worker): void {
    current.removeEventListener("message", handleMessage);
    current.removeEventListener("error", handleError);
    current.removeEventListener("messageerror", handleMessageError);
  }

  bind(worker);

  function send(
    type: "analyze" | "bestMove",
    options: BridgeAnalyzeOptions,
    onInfo?: (info: EngineAnalysis) => void
  ): Promise<EngineAnalysis> {
    const id = ++nextId;
    const message: EngineWorkerRequest = { type, id, payload: options };
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, onInfo });
      worker.postMessage(message);
    });
  }

  return {
    analyze: (options, onInfo) => send("analyze", options, onInfo),
    bestMove: (options) => send("bestMove", options),
    review: (payload, onProgress) => {
      const id = ++nextId;
      const message: EngineWorkerRequest = { type: "review", id, payload };
      return new Promise((resolve, reject) => {
        pendingReviews.set(id, { resolve, reject, onProgress });
        worker.postMessage(message);
      });
    },
    stop: () => {
      const id = ++nextId;
      worker.postMessage({ type: "stop", id } satisfies EngineWorkerRequest);
      rejectAll(new Error("Engine worker stopped"));
      unbind(worker);
      worker.terminate();
      worker = factory();
      bind(worker);
    },
    terminate: () => {
      rejectAll(new Error("Engine worker terminated"));
      unbind(worker);
      worker.terminate();
    },
  };
}
