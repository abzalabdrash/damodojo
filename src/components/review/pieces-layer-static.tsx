"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState, type RefObject } from "react";

import { BOARD_SIZE } from "@/lib/engine";
import type { UIPiece } from "@/stores/game-store";
import { Piece } from "@/components/board/piece";

interface PiecesLayerStaticProps {
  pieces: readonly UIPiece[];
  boardRef: RefObject<HTMLDivElement | null>;
  flipped?: boolean;
}

interface BoardRect {
  left: number; top: number; width: number; height: number;
}

function readBoardRect(board: HTMLDivElement | null): BoardRect | null {
  if (!board) return null;
  const rect = board.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

export function PiecesLayerStatic({
  pieces,
  boardRef,
  flipped = false,
}: PiecesLayerStaticProps) {
  const [boardRect, setBoardRect] = useState<BoardRect | null>(null);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const update = () => setBoardRect(readBoardRect(board));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(board);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [boardRef]);

  const rect = boardRect;
  const cellW = rect ? rect.width / BOARD_SIZE : 0;
  const cellH = rect ? rect.height / BOARD_SIZE : 0;

  return (
    <div className="pointer-events-none absolute inset-0">
      <AnimatePresence>
        {pieces.map((p) => {
          const dr = flipped ? BOARD_SIZE - 1 - p.row : p.row;
          const dc = flipped ? BOARD_SIZE - 1 - p.col : p.col;
          const xValue = rect ? dc * cellW : 0;
          const yValue = rect ? dr * cellH : 0;

          return (
            <motion.div
              key={p.id}
              layout={false}
              initial={false}
              animate={{
                x: xValue,
                y: yValue,
                scale: 1,
                zIndex: 1,
                opacity: rect ? 1 : 0,
              }}
              exit={{
                scale: 0.3,
                opacity: 0,
                rotate: 18,
                transition: { duration: 0.26, ease: [0.4, 0, 1, 1] },
              }}
              transition={{
                x: { type: "spring", stiffness: 430, damping: 32, mass: 0.75 },
                y: { type: "spring", stiffness: 430, damping: 32, mass: 0.75 },
                opacity: { duration: 0.12 },
              }}
              className="absolute left-0 top-0 select-none"
              style={{
                width: rect ? cellW : `${100 / BOARD_SIZE}%`,
                height: rect ? cellH : `${100 / BOARD_SIZE}%`,
                pointerEvents: "none",
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
