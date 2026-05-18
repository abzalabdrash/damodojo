/**
 * Public engine endpoint for external clients (Tampermonkey userscript,
 * bookmarklet, CLI scripts) that want our best-move suggestion for a
 * given Russian-draughts position.
 *
 * Request body:
 *   {
 *     // 32-char square string in Russian-numbering (1..32 = dark squares).
 *     // Characters: '.' empty, 'w'/'W' white man/king, 'b'/'B' black man/king.
 *     board: string,
 *     turn:  "w" | "b",
 *     // Optional search budget.
 *     maxDepth?: number,
 *     timeMs?: number
 *   }
 *
 * Response body:
 *   {
 *     fromSquare: number,         // 1..32
 *     toSquare:   number,         // 1..32
 *     pathSquares: number[],      // landing squares (excluding from)
 *     captureSquares: number[],   // captured squares (1..32)
 *     score: number,              // centipawn from side-to-move POV
 *     depth: number,
 *     elapsedMs: number,
 *     fromBook?: boolean
 *   }
 */

import fs from "node:fs";
import path from "node:path";
import { searchBestMove } from "@/lib/engine-ai/search/iterative";
import { fastPositionKey } from "@/lib/engine-ai/board/fast-state";
import { squareNumber } from "@/lib/engine-ai/board/encoding";
import { setNNWeights } from "@/lib/engine-ai/nn/evaluator";
import { buildWeights } from "@/lib/engine-ai/nn/forward";
import type { DamaNetManifest } from "@/lib/engine-ai/nn/forward";
import {
  BLACK,
  BLACK_KING,
  BLACK_MAN,
  EMPTY,
  WHITE,
  WHITE_KING,
  WHITE_MAN,
  type FastState,
} from "@/lib/engine-ai/types";

// Load NN weights once at module init so this endpoint uses the full hybrid eval.
(function initNN() {
  try {
    const base = path.join(process.cwd(), "public", "nn");
    const manifest = JSON.parse(
      fs.readFileSync(path.join(base, "damanet.manifest.json"), "utf8")
    ) as DamaNetManifest;
    const buf = fs.readFileSync(path.join(base, "damanet.weights.bin"));
    const blob = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    setNNWeights(blob, manifest);
  } catch {
    // Weights missing — evaluator falls back to classical automatically.
  }
})();

interface BestMoveBody {
  board?: string;
  turn?: "w" | "b";
  maxDepth?: number;
  timeMs?: number;
}

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: BestMoveBody;
  try {
    body = (await request.json()) as BestMoveBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const board = body.board;
  const turn = body.turn;
  if (typeof board !== "string" || board.length !== 32) {
    return Response.json({ error: "board must be a 32-character string" }, { status: 400 });
  }
  if (turn !== "w" && turn !== "b") {
    return Response.json({ error: "turn must be 'w' or 'b'" }, { status: 400 });
  }

  const cells = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    switch (board[i]) {
      case ".":
      case " ":
      case "0":
        cells[i] = EMPTY;
        break;
      case "w":
        cells[i] = WHITE_MAN;
        break;
      case "W":
        cells[i] = WHITE_KING;
        break;
      case "b":
        cells[i] = BLACK_MAN;
        break;
      case "B":
        cells[i] = BLACK_KING;
        break;
      default:
        return Response.json(
          { error: `Invalid board character '${board[i]}' at index ${i}` },
          { status: 400 }
        );
    }
  }

  const state: FastState = {
    cells,
    turn: turn === "w" ? WHITE : BLACK,
    halfmoveClock: 0,
    ply: 0,
    repetitionStack: [],
    endgame: null,
  };
  state.repetitionStack.push(fastPositionKey(state));

  const maxDepth = Math.max(1, Math.min(20, body.maxDepth ?? 12));
  const timeMs = Math.max(50, Math.min(15_000, body.timeMs ?? 3000));
  const result = searchBestMove(state, { maxDepth, timeMs });

  if (!result.bestMove) {
    return Response.json({ error: "No legal moves" }, { status: 422 });
  }

  return Response.json({
    fromSquare: squareNumber(result.bestMove.from),
    toSquare: squareNumber(result.bestMove.to),
    pathSquares: result.bestMove.path.map((s) => squareNumber(s)),
    captureSquares: result.bestMove.captures.map((s) => squareNumber(s)),
    score: result.score,
    depth: result.depth,
    elapsedMs: result.elapsedMs,
    fromBook: result.fromBook ?? false,
  });
}
