"use client";

import { useEffect, useMemo, useRef } from "react";

import { BOARD_SIZE, isDarkSquare, sameSquare } from "@/lib/engine";
import type { Move } from "@/lib/engine";
import { uciToEndpoints } from "@/lib/realtime/protocol";
import { playSound, unlockAudio } from "@/lib/sounds";
import { cn } from "@/lib/utils";
import { forcedCaptureSquares, useGameStore } from "@/stores/game-store";
import { gameStateAtPly } from "@/stores/replay";
import { useOnlineStore } from "@/stores/online-store";

import { BoardCell, type CellHint } from "./board-cell";
import { BoardTexture } from "./board-texture";
import { PiecesLayer } from "./pieces-layer";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

interface GameBoardProps {
  /** If true, flip the board so Black is at the bottom. */
  flipped?: boolean;
  className?: string;
  /** Hide rank/file coordinates. */
  hideCoords?: boolean;
  suggestedMove?: Move | null;
  /** If true, the board is view-only (no clicks or drags). */
  disabled?: boolean;
}

export function GameBoard({
  flipped = false,
  className,
  hideCoords,
  suggestedMove,
  disabled = false,
}: GameBoardProps) {
  const boardSurfaceRef = useRef<HTMLDivElement>(null);

  const game = useGameStore((s) => s.game);
  const selectedLive = useGameStore((s) => s.selected);
  const possibleMovesLive = useGameStore((s) => s.possibleMoves);
  const lastMoveLive = useGameStore((s) => s.lastMove);
  const piecesLive = useGameStore((s) => s.pieces);
  const pendingCapture = useGameStore((s) => s.pendingCapture);
  const viewPly = useGameStore((s) => s.viewPly);
  const handleSquareClick = useGameStore((s) => s.handleSquareClick);
  const premoveFromSq = useGameStore((s) => s.premoveFrom);
  const premoveUci = useOnlineStore((s) => s.premoveUci);
  const premoveSquares = useMemo(() => {
    if (!premoveUci) return null;
    return uciToEndpoints(premoveUci);
  }, [premoveUci]);

  // When the user is scrubbing history (viewPly !== null), reconstruct the
  // board state at that ply and use it for rendering. Live interactivity is
  // gated by handleSquareClick/PiecesLayer (both auto-snap back to live).
  const replayFrame = useMemo(() => {
    if (viewPly === null) return null;
    return gameStateAtPly(game.history, viewPly);
  }, [viewPly, game.history]);

  const isReplaying = replayFrame !== null;
  const pieces = replayFrame ? replayFrame.pieces : piecesLive;
  const lastMove = replayFrame ? replayFrame.lastMove : lastMoveLive;
  const selected = isReplaying
    ? null
    : pendingCapture
      ? pendingCapture.path[pendingCapture.path.length - 1]
      : selectedLive;
  const possibleMoves = isReplaying ? [] : possibleMovesLive;

  // Sound feedback fires only when the LIVE game advances; scrubbing history
  // is silent. The badge is intentionally NOT shown in live play — it lives
  // in the post-game Review screen.
  const lastMoveRef = useRef<Move | null>(null);
  useEffect(() => {
    if (!lastMoveLive || lastMoveLive === lastMoveRef.current) return;
    lastMoveRef.current = lastMoveLive;
    if (lastMoveLive.promoted) {
      playSound("promote");
    } else if (lastMoveLive.captures.length > 0) {
      playSound("capture");
    } else {
      playSound("move");
    }
  }, [lastMoveLive]);

  // Quick lookups for highlights this render
  const possibleDestinations = new Set<string>();
  const captureTargets = new Set<string>();
  const forcedSources = new Set<string>();
  if (pendingCapture && !isReplaying) {
    for (const sq of pendingCapture.nextLandings) {
      possibleDestinations.add(`${sq.row},${sq.col}`);
    }
    for (const sq of pendingCapture.nextCaptures) {
      captureTargets.add(`${sq.row},${sq.col}`);
    }
  } else if (selected) {
    for (const m of possibleMoves) {
      possibleDestinations.add(`${m.to.row},${m.to.col}`);
      for (const cap of m.captures) {
        captureTargets.add(`${cap.row},${cap.col}`);
      }
    }
  } else if (!isReplaying) {
    for (const sq of forcedCaptureSquares(game)) {
      forcedSources.add(`${sq.row},${sq.col}`);
    }
  }

  function getHint(row: number, col: number): CellHint {
    if (selected && selected.row === row && selected.col === col) return "selected";
    const key = `${row},${col}`;
    if (!isReplaying && suggestedMove) {
      if (sameSquare(suggestedMove.from, { row, col })) return "engine-from";
      if (sameSquare(suggestedMove.to, { row, col })) return "engine-to";
    }
    if (forcedSources.has(key)) return "forced-capture";
    if (captureTargets.has(key)) return "capture-target";
    if (possibleDestinations.has(key)) {
      // Show a stronger ring if this empty square is the end of a capture chain;
      // a centered dot for a plain simple move.
      const isCaptureChainLanding = pendingCapture
        ? pendingCapture.nextLandings.some((sq) => sq.row === row && sq.col === col)
        : possibleMoves.some(
            (m) =>
              m.captures.length > 0 &&
              m.to.row === row &&
              m.to.col === col
          );
      const piece = game.board[row]?.[col];
      if (!piece && isCaptureChainLanding) return "possible-capture";
      return "possible-move";
    }
    if (premoveFromSq && sameSquare(premoveFromSq, { row, col })) return "selected";
    if (premoveSquares) {
      if (sameSquare(premoveSquares.from, { row, col })) return "premove";
      if (sameSquare(premoveSquares.to, { row, col })) return "premove";
    }
    if (lastMove) {
      if (sameSquare(lastMove.from, { row, col })) return "last-from";
      if (sameSquare(lastMove.to, { row, col })) return "last-to";
    }
    return "none";
  }

  // Orient the visual grid based on flipped prop.
  const rows = flipped
    ? Array.from({ length: BOARD_SIZE }, (_, i) => BOARD_SIZE - 1 - i).reverse()
    : Array.from({ length: BOARD_SIZE }, (_, i) => i);
  const cols = flipped
    ? Array.from({ length: BOARD_SIZE }, (_, i) => BOARD_SIZE - 1 - i)
    : Array.from({ length: BOARD_SIZE }, (_, i) => i);

  // Rendered top-to-bottom = `rows`; left-to-right = `cols`.
  const renderRows = flipped ? rows.slice().reverse() : rows;

  return (
    <div
      className={cn(
        "relative aspect-square w-full select-none overflow-hidden rounded-xl",
        className
      )}
      style={{
        padding: "14px",
        background:
          "linear-gradient(140deg, #3A2A1A 0%, #1F1408 30%, #100A04 70%, #2A1C0F 100%)",
        boxShadow:
          "0 40px 80px -28px rgba(0,0,0,0.7), 0 18px 36px -16px rgba(0,0,0,0.55), inset 0 1px 0 0 rgba(255,220,170,0.12), inset 0 -1px 0 0 rgba(0,0,0,0.6)",
      }}
      onPointerDown={unlockAudio}
    >
      {/* Inner board surface (the play area, inside the wooden frame) */}
      <div
        ref={boardSurfaceRef}
        className="relative h-full w-full overflow-hidden rounded-md"
        style={{
          boxShadow:
            "inset 0 0 0 1px rgba(0,0,0,0.6), inset 0 0 0 2px rgba(220,180,120,0.15), 0 2px 0 0 rgba(0,0,0,0.4)",
        }}
      >
        {/* Cell grid (no pieces here — they live in PiecesLayer above) */}
        <div
          className="grid h-full w-full"
          style={{
            gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
            gridTemplateRows: `repeat(${BOARD_SIZE}, 1fr)`,
          }}
        >
          {renderRows.flatMap((row, dispRow) =>
            cols.map((col, dispCol) => {
              const interactive = isDarkSquare(row, col);
              const onLeftEdge = dispCol === 0;
              const onBottomEdge = dispRow === BOARD_SIZE - 1;
              const rankLabel =
                !hideCoords && onLeftEdge ? String(BOARD_SIZE - row) : undefined;
              const fileLabel =
                !hideCoords && onBottomEdge ? FILES[col] : undefined;
              return (
                <BoardCell
                  key={`${row}-${col}`}
                  row={row}
                  col={col}
                  hint={getHint(row, col)}
                  interactive={interactive}
                  fileLabel={fileLabel}
                  rankLabel={rankLabel}
                  onClick={
                    interactive && !disabled
                      ? () => handleSquareClick({ row, col })
                      : undefined
                  }
                />
              );
            })
          )}
        </div>

        {/* Wood grain + ambient lighting overlay */}
        <BoardTexture />

        {/* Pieces layer (above texture, handles drag-and-drop) */}
        <PiecesLayer
          pieces={pieces}
          flipped={flipped}
          boardRef={boardSurfaceRef}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
