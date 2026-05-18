"use client";

import { motion } from "framer-motion";
import { Piece, type PieceColor } from "./piece";
import { cn } from "@/lib/utils";

interface CellState {
  color: PieceColor;
  king?: boolean;
}

/**
 * Russian checkers initial position (8 rows × 8 cols).
 * Row 0 = top of the board (Black/dark from White's perspective).
 * Pieces placed only on dark squares (where (row+col) % 2 === 1).
 */
function initialBoard(): (CellState | null)[][] {
  const board: (CellState | null)[][] = Array.from({ length: 8 }, () =>
    Array.from({ length: 8 }, () => null)
  );
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const isDarkSquare = (row + col) % 2 === 1;
      if (!isDarkSquare) continue;
      if (row < 3) board[row][col] = { color: "dark" };
      else if (row > 4) board[row][col] = { color: "light" };
    }
  }
  return board;
}

interface MiniBoardProps {
  className?: string;
}

export function MiniBoard({ className }: MiniBoardProps) {
  const board = initialBoard();

  return (
    <div
      className={cn(
        "relative aspect-square w-full overflow-hidden rounded-lg border-[8px] shadow-2xl",
        className
      )}
      style={{
        borderColor: "var(--board-frame)",
        boxShadow:
          "0 30px 60px -20px rgba(0,0,0,0.55), 0 12px 24px -10px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(0,0,0,0.4)",
      }}
    >
      <div className="grid h-full w-full grid-cols-8">
        {board.flatMap((rowArr, row) =>
          rowArr.map((cell, col) => {
            const isDarkSquare = (row + col) % 2 === 1;
            return (
              <div
                key={`${row}-${col}`}
                className="relative"
                style={{
                  backgroundColor: isDarkSquare
                    ? "var(--board-dark)"
                    : "var(--board-light)",
                }}
              >
                {cell && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{
                      delay: (row * 8 + col) * 0.012,
                      duration: 0.42,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="absolute inset-[12%]"
                  >
                    <Piece color={cell.color} king={cell.king} />
                  </motion.div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* light glaze for depth */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          background:
            "radial-gradient(120% 80% at 20% 0%, rgba(255,255,255,0.6), transparent 60%)",
        }}
      />
    </div>
  );
}
