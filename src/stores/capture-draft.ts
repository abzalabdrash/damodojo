import { sameSquare } from "@/lib/engine";
import type { Move, Square } from "@/lib/engine";

import type { UIPiece } from "./game-store";

export interface CaptureDraft {
  readonly from: Square;
  readonly path: readonly Square[];
  readonly captures: readonly Square[];
  readonly candidates: readonly Move[];
  readonly nextLandings: readonly Square[];
  readonly nextCaptures: readonly Square[];
}

export type CaptureDraftResult =
  | { readonly kind: "none" }
  | { readonly kind: "pending"; readonly draft: CaptureDraft }
  | { readonly kind: "commit"; readonly move: Move };

function squareKey(square: Square): string {
  return `${square.row},${square.col}`;
}

function uniqueSquares(squares: readonly Square[]): Square[] {
  const seen = new Set<string>();
  const out: Square[] = [];
  for (const square of squares) {
    const key = squareKey(square);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(square);
  }
  return out;
}

function matchesTarget(square: Square | undefined, target: Square): boolean {
  return !!square && sameSquare(square, target);
}

function matchesPrefix(move: Move, path: readonly Square[]): boolean {
  if (path.length > move.path.length) return false;
  return path.every((square, index) => sameSquare(move.path[index], square));
}

function draftFrom(from: Square, path: readonly Square[], candidates: readonly Move[]): CaptureDraft {
  const matching = candidates.filter((move) => matchesPrefix(move, path));
  const step = path.length;
  return {
    from,
    path: [...path],
    captures: matching[0]?.captures.slice(0, step) ?? [],
    candidates: matching,
    nextLandings: uniqueSquares(
      matching.map((move) => move.path[step]).filter(Boolean)
    ),
    nextCaptures: uniqueSquares(
      matching.map((move) => move.captures[step]).filter(Boolean)
    ),
  };
}

export function beginCaptureDraft(
  moves: readonly Move[],
  from: Square,
  target: Square
): CaptureDraftResult {
  const captures = moves.filter(
    (move) =>
      move.captures.length > 0 &&
      sameSquare(move.from, from) &&
      (matchesTarget(move.path[0], target) ||
        matchesTarget(move.captures[0], target))
  );

  if (captures.length === 0) return { kind: "none" };

  const firstPath = captures[0].path[0];
  const matching = captures.filter((move) => matchesPrefix(move, [firstPath]));
  const complete = matching.find((move) => move.path.length === 1);
  const hasContinuation = matching.some((move) => move.path.length > 1);

  if (complete && !hasContinuation) {
    return { kind: "commit", move: complete };
  }

  return {
    kind: "pending",
    draft: draftFrom(from, [firstPath], matching),
  };
}

export function advanceCaptureDraft(
  draft: CaptureDraft,
  target: Square
): CaptureDraftResult {
  const step = draft.path.length;
  const matching = draft.candidates.filter(
    (move) =>
      matchesPrefix(move, draft.path) &&
      (matchesTarget(move.path[step], target) ||
        matchesTarget(move.captures[step], target))
  );

  if (matching.length === 0) return { kind: "none" };

  const nextSquare = matching[0].path[step];
  const nextPath = [...draft.path, nextSquare];
  const stillMatching = matching.filter((move) => matchesPrefix(move, nextPath));
  const complete = stillMatching.find((move) => move.path.length === nextPath.length);
  const hasContinuation = stillMatching.some((move) => move.path.length > nextPath.length);

  if (complete && !hasContinuation) {
    return { kind: "commit", move: complete };
  }

  return {
    kind: "pending",
    draft: draftFrom(draft.from, nextPath, stillMatching),
  };
}

export function captureDraftPieces(
  pieces: readonly UIPiece[],
  draft: CaptureDraft
): UIPiece[] {
  const captured = new Set(draft.captures.map(squareKey));
  const current = draft.path[draft.path.length - 1];
  return pieces
    .filter((piece) => !captured.has(`${piece.row},${piece.col}`))
    .map((piece) => {
      if (piece.row === draft.from.row && piece.col === draft.from.col) {
        return { ...piece, row: current.row, col: current.col };
      }
      return piece;
    });
}
