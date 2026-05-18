"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  useEffect,
  useState,
  type PointerEvent,
  type RefObject,
} from "react";

import { BOARD_SIZE } from "@/lib/engine";
import type { Color } from "@/lib/engine";
import { useGameStore, type UIPiece } from "@/stores/game-store";
import { useOnlineStore } from "@/stores/online-store";

import {
  dragTranslate,
  pointToBoardSquare,
  type BoardRect,
} from "./drag-geometry";
import { Piece } from "./piece";

interface PiecesLayerProps {
  pieces: readonly UIPiece[];
  flipped?: boolean;
  boardRef: RefObject<HTMLDivElement | null>;
  disabled?: boolean;
}

const DRAG_THRESHOLD = 5;

interface DragState {
  pieceId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  grabOffsetX: number;
  grabOffsetY: number;
  clientX: number;
  clientY: number;
  moved: boolean;
}

function readBoardRect(board: HTMLDivElement | null): BoardRect | null {
  if (!board) return null;
  const rect = board.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

export function PiecesLayer({
  pieces,
  flipped = false,
  boardRef,
  disabled = false,
}: PiecesLayerProps) {
  const turn = useGameStore((s) => s.game.turn);
  const result = useGameStore((s) => s.result);
  const viewPly = useGameStore((s) => s.viewPly);
  const pendingCapture = useGameStore((s) => s.pendingCapture);
  const tryMoveOrCapture = useGameStore((s) => s.tryMoveOrCapture);
  const handleSquareClick = useGameStore((s) => s.handleSquareClick);
  const activeMode = useGameStore((s) => s.activeMode);
  const onlineColor = useGameStore((s) => s.onlineColor);
  const onlineGameStatus = useOnlineStore((s) => s.gameStatus);

  const [drag, setDrag] = useState<DragState | null>(null);
  const [boardRect, setBoardRect] = useState<BoardRect | null>(null);

  const gameOngoing = result.kind === "ongoing";
  const isLive = viewPly === null;

  // Which color am I allowed to control with drag?
  //   local: whoever's turn it is (hot-seat — both pieces are "mine")
  //   bot:   "w" (I always play white, bot is black)
  //   online: my assigned color (locked to my side)
  // For drag to be allowed, BOTH conditions must hold:
  //   1. piece.color === myDragColor (it's MY piece)
  //   2. game.turn === myDragColor (it's MY turn)
  // Online also requires gameStatus === "playing" (no drag in lobby/finished).
  const myDragColor: Color | null =
    activeMode === "online"
      ? onlineColor
      : activeMode === "bot"
        ? "w"
        : turn;
  const interactionAllowed =
    !disabled &&
    gameOngoing &&
    isLive &&
    (activeMode !== "online" || onlineGameStatus === "playing");

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;

    const update = () => setBoardRect(readBoardRect(board));
    update();

    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(board);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [boardRef]);

  function onPointerDown(
    piece: UIPiece,
    e: PointerEvent<HTMLDivElement>
  ): void {
    if (!interactionAllowed) return;
    const pendingSquare = pendingCapture?.path[pendingCapture.path.length - 1];
    const canLiftPending =
      !pendingSquare ||
      (piece.row === pendingSquare.row && piece.col === pendingSquare.col);
    // Drag requires: piece is MINE + it's MY turn + (in online) game playing
    if (!myDragColor || piece.color !== myDragColor || turn !== myDragColor) return;
    if (!canLiftPending) return;
    if (e.button !== 0) return;

    const latestBoardRect = readBoardRect(boardRef.current);
    if (!latestBoardRect) return;
    setBoardRect(latestBoardRect);

    e.preventDefault();
    e.stopPropagation();

    const el = e.currentTarget;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // The element may be gone during fast remounts; losing capture is harmless.
    }

    const rect = el.getBoundingClientRect();
    const pieceCenterX = rect.left + rect.width / 2;
    const pieceCenterY = rect.top + rect.height / 2;

    setDrag({
      pieceId: piece.id,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      grabOffsetX: e.clientX - pieceCenterX,
      grabOffsetY: e.clientY - pieceCenterY,
      clientX: e.clientX,
      clientY: e.clientY,
      moved: false,
    });
  }

  function onPointerMove(
    piece: UIPiece,
    e: PointerEvent<HTMLDivElement>
  ): void {
    if (!drag || drag.pieceId !== piece.id) return;
    if (e.pointerId !== drag.pointerId) return;

    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;
    const moved = drag.moved || Math.hypot(dx, dy) > DRAG_THRESHOLD;

    setDrag({
      ...drag,
      clientX: e.clientX,
      clientY: e.clientY,
      moved,
    });
  }

  function endDrag(
    piece: UIPiece,
    e: PointerEvent<HTMLDivElement>,
    apply: boolean
  ): void {
    if (!drag || drag.pieceId !== piece.id) return;
    if (e.pointerId !== drag.pointerId) return;

    const wasMoved = drag.moved;
    const dropPoint = {
      x: drag.clientX - drag.grabOffsetX,
      y: drag.clientY - drag.grabOffsetY,
    };

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Pointer capture can already be released by the browser.
    }

    setDrag(null);
    if (!apply) return;

    if (!wasMoved) {
      handleSquareClick({ row: piece.row, col: piece.col });
      return;
    }

    const latestBoardRect = readBoardRect(boardRef.current);
    if (latestBoardRect) setBoardRect(latestBoardRect);

    const square = latestBoardRect
      ? pointToBoardSquare(latestBoardRect, dropPoint, flipped)
      : null;

    if (!square) return;
    if (square.row === piece.row && square.col === piece.col) return;

    tryMoveOrCapture({ row: piece.row, col: piece.col }, square);
  }

  const rect = boardRect;
  const cellW = rect ? rect.width / BOARD_SIZE : 0;
  const cellH = rect ? rect.height / BOARD_SIZE : 0;

  return (
    <div className="pointer-events-none absolute inset-0">
      <AnimatePresence>
        {pieces.map((p) => {
          const dr = flipped ? BOARD_SIZE - 1 - p.row : p.row;
          const dc = flipped ? BOARD_SIZE - 1 - p.col : p.col;
          const isMyPiece = myDragColor !== null && p.color === myDragColor;
          const isMyTurn = myDragColor !== null && turn === myDragColor;
          const pendingSquare =
            pendingCapture?.path[pendingCapture.path.length - 1];
          const canDragPending =
            !pendingSquare ||
            (p.row === pendingSquare.row && p.col === pendingSquare.col);
          const canDrag = interactionAllowed && isMyPiece && isMyTurn && canDragPending;
          const isDragging = drag?.pieceId === p.id && drag.moved;

          let xValue = rect ? dc * cellW : 0;
          let yValue = rect ? dr * cellH : 0;

          if (isDragging && drag && rect) {
            const next = dragTranslate(rect, {
              clientX: drag.clientX,
              clientY: drag.clientY,
              grabOffsetX: drag.grabOffsetX,
              grabOffsetY: drag.grabOffsetY,
            });
            xValue = next.x;
            yValue = next.y;
          }

          return (
            <motion.div
              key={p.id}
              onPointerDown={(e) => onPointerDown(p, e)}
              onPointerMove={(e) => onPointerMove(p, e)}
              onPointerUp={(e) => endDrag(p, e, true)}
              onPointerCancel={(e) => endDrag(p, e, false)}
              layout={false}
              initial={false}
              animate={{
                x: xValue,
                y: yValue,
                scale: isDragging ? 1.06 : 1,
                zIndex: isDragging ? 50 : 1,
                opacity: rect ? 1 : 0,
              }}
              exit={{
                scale: 0.3,
                opacity: 0,
                rotate: 18,
                transition: { duration: 0.26, ease: [0.4, 0, 1, 1] },
              }}
              transition={
                isDragging
                  ? {
                      x: { duration: 0 },
                      y: { duration: 0 },
                      scale: { duration: 0.07, ease: "easeOut" },
                      opacity: { duration: 0.12 },
                      zIndex: { duration: 0 },
                    }
                  : {
                      x: { type: "spring", stiffness: 480, damping: 34, mass: 0.7 },
                      y: { type: "spring", stiffness: 480, damping: 34, mass: 0.7 },
                      scale: { duration: 0.08, ease: "easeOut" },
                      opacity: { duration: 0.12 },
                      zIndex: { duration: 0 },
                    }
              }
              className="absolute left-0 top-0 select-none"
              style={{
                width: rect ? cellW : `${100 / BOARD_SIZE}%`,
                height: rect ? cellH : `${100 / BOARD_SIZE}%`,
                // Only my pieces intercept pointers. Opponent's pieces let the
                // click fall through to the BoardCell underneath (needed so
                // premove clicks during opponent's turn reach handleSquareClick).
                pointerEvents: canDrag ? "auto" : "none",
                cursor: canDrag ? (isDragging ? "grabbing" : "grab") : "default",
                touchAction: "none",
              }}
            >
              <div className="absolute inset-[10%] drop-shadow-[0_3px_4px_rgba(0,0,0,0.45)]">
                <Piece color={p.color === "w" ? "light" : "dark"} king={p.king} />
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
