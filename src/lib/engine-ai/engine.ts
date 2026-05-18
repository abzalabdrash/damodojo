import type { GameState, Move } from "@/lib/engine";

import { fromGameState } from "./board/convert";
import { makeFastMove } from "./board/make-unmake";
import { generateFastMoves } from "./moves/generate";
import { searchBestMove, type BestMoveResult } from "./search/iterative";
import {
  deserializeGameState,
  fastMoveToPublicMove,
  type SerializableGameState,
} from "./io/serializable";
import { reviewGame, type GameReview, type ReviewedMove, type ReviewOptions } from "./review/index";

export interface EngineOptions {
  readonly hashSize?: number;
  readonly defaultMaxDepth?: number;
  readonly defaultTimeMs?: number;
  readonly useBook?: boolean;
}

export interface EngineAnalyzeOptions {
  readonly state: GameState | SerializableGameState;
  readonly maxDepth?: number;
  readonly timeMs?: number;
}

export interface EngineAnalysis {
  readonly bestMove: Move | null;
  readonly score: number;
  readonly depth: number;
  readonly nodes: number;
  readonly nps: number;
  readonly elapsedMs: number;
  readonly pv: readonly Move[];
}

export type EngineInfoHandler = (info: EngineAnalysis) => void;

export class Engine {
  private stopped = false;

  constructor(private readonly options: EngineOptions = {}) {}

  async analyze(
    options: EngineAnalyzeOptions,
    onInfo?: EngineInfoHandler
  ): Promise<EngineAnalysis> {
    this.stopped = false;
    const state = materializeState(options.state);
    const result = searchBestMove(fromGameState(state), {
      maxDepth: options.maxDepth ?? this.options.defaultMaxDepth ?? 8,
      timeMs: options.timeMs ?? this.options.defaultTimeMs ?? 1000,
      hashSize: this.options.hashSize,
      useBook: this.options.useBook,
    });
    const analysis = toAnalysis(result);
    if (!this.stopped) onInfo?.(analysis);
    return analysis;
  }

  async bestMove(options: EngineAnalyzeOptions): Promise<Move | null> {
    const result = await this.analyze(options);
    return result.bestMove;
  }

  /**
   * Review a complete game.
   * `gameStates` must be a sequence of positions: states[i] is the board
   * before moves[i] was played. states.length === moves.length + 1.
   */
  async review(
    gameStates: readonly (GameState | SerializableGameState)[],
    gameMoves: readonly Move[],
    options: ReviewOptions = {},
    onProgress?: (ply: number, total: number, move: ReviewedMove) => void
  ): Promise<GameReview> {
    if (gameStates.length !== gameMoves.length + 1) {
      throw new Error(
        `review: states.length (${gameStates.length}) must be moves.length+1 (${gameMoves.length + 1})`
      );
    }

    const fastStates = gameStates.map((s) => fromGameState(materializeState(s)));

    // Convert public Move objects back to FastMove by matching against legal moves
    const fastMoves = gameMoves.map((move, i) => {
      const legal = generateFastMoves(fastStates[i]);
      const match = legal.find(
        (m) =>
          m.from.row === move.from.row &&
          m.from.col === move.from.col &&
          m.to.row === move.to.row &&
          m.to.col === move.to.col
      );
      if (!match) throw new Error(`review: move at ply ${i} not found in legal moves`);
      return match;
    });

    return reviewGame(fastStates, fastMoves, {
      depth: options.depth ?? this.options.defaultMaxDepth ?? 8,
      timeMs: options.timeMs ?? this.options.defaultTimeMs ?? 500,
      maxPly: options.maxPly,
    }, onProgress);
  }

  stop(): void {
    this.stopped = true;
  }

  dispose(): void {
    this.stop();
  }
}

function materializeState(state: GameState | SerializableGameState): GameState {
  if ("history" in state && "repetitions" in state) return state;
  return deserializeGameState(state);
}

function toAnalysis(result: BestMoveResult): EngineAnalysis {
  return {
    bestMove: result.bestMove ? fastMoveToPublicMove(result.bestMove) : null,
    score: result.score,
    depth: result.depth,
    nodes: result.nodes,
    nps: result.nps,
    elapsedMs: result.elapsedMs,
    pv: result.pv.map(fastMoveToPublicMove),
  };
}
