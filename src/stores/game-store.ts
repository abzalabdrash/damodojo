"use client";

import { create } from "zustand";

import type { MoveClassification } from "@/components/board/move-badge";
import {
  applyMove,
  BOARD_SIZE,
  findMoveByEndpoints,
  getLegalMoves,
  getResult,
  initialBoard,
  initialState,
  legalMovesFromSquare,
  sameSquare,
} from "@/lib/engine";
import type { Color, GameResult, GameState, Move, Square } from "@/lib/engine";
import type { PlayModeId } from "@/lib/play-modes";
import {
  advanceCaptureDraft,
  beginCaptureDraft,
  captureDraftPieces,
  type CaptureDraft,
} from "@/stores/capture-draft";

/** UI-side piece with a stable id so Framer Motion can animate position. */
export interface UIPiece {
  id: string;
  color: Color;
  king: boolean;
  row: number;
  col: number;
}

export function initialPieces(): UIPiece[] {
  const out: UIPiece[] = [];
  let n = 0;
  const b = initialBoard();
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const p = b[row][col];
      if (!p) continue;
      out.push({
        id: `p${n++}`,
        color: p.color,
        king: p.king,
        row,
        col,
      });
    }
  }
  return out;
}

/**
 * Apply a Move to the UIPiece list: mark captures (filtered out), move the
 * mover to its new square, set king flag if promoted. Preserves piece IDs so
 * the moving piece animates from old to new position via Framer Motion.
 */
export function applyMoveToPieces(pieces: UIPiece[], move: Move): UIPiece[] {
  const capturedKeys = new Set(
    move.captures.map((s) => `${s.row},${s.col}`)
  );
  return pieces
    .filter((p) => !capturedKeys.has(`${p.row},${p.col}`))
    .map((p) => {
      if (p.row === move.from.row && p.col === move.from.col) {
        return {
          ...p,
          row: move.to.row,
          col: move.to.col,
          king: p.king || move.promoted,
        };
      }
      return p;
    });
}

/**
 * Lightweight heuristic classifier for the hot-seat demo. The real Game Review
 * uses engine-eval delta (see BLUEPRINT §3.4). Until the engine is wired up,
 * this gives credible visual feedback on each move.
 */
function classifyHotSeat(move: Move): MoveClassification {
  if (move.captures.length >= 2) return "brilliant";
  if (move.promoted) return "best";
  if (move.captures.length === 1) return "great";
  return "good";
}

interface GameStore {
  // engine state
  game: GameState;
  result: GameResult;

  // UI state
  selected: Square | null;
  /** Legal destinations from the currently-selected square (cached). */
  possibleMoves: Move[];
  /** The most recent move (for highlighting from/to + sounds). */
  lastMove: Move | null;
  /** Heuristic classification of `lastMove` for the demo MoveBadge. */
  lastClassification: MoveClassification | null;
  /** UI-side piece list with stable IDs for smooth animations. */
  pieces: UIPiece[];
  /** In-progress UI-only capture chain; engine state commits when chain ends. */
  pendingCapture: CaptureDraft | null;
  /** Stable piece snapshot from before the capture draft started. */
  pendingCaptureBasePieces: UIPiece[] | null;
  /**
   * Replay scrub: when non-null, the board renders the position AFTER applying
   * `history[0..viewPly-1]` (so viewPly === 0 = initial position, ply === history.length = live).
   * Live game logic (clicks/drag, applyMove timing) is unaffected — only the
   * rendering changes. The opponent's clock keeps running.
   */
  viewPly: number | null;
  /** True if the user explicitly pinned a view position (vs. ephemeral hover). */
  viewPinned: boolean;
  /** Last explicitly pinned ply; hover preview returns here on mouse leave. */
  pinnedPly: number | null;
  activeMode: PlayModeId;
  /** My piece color when playing online — gates turn checking in handleSquareClick. */
  onlineColor: "w" | "b" | null;
  /** Called after a move is committed locally; used by online hook to send to server. */
  _onlineCommitHook: ((move: Move) => void) | null;
  /** Called when user registers a premove (or null to clear). */
  _premoveHook: ((move: Move | null) => void) | null;
  /** Source square staged while user picks a premove destination. */
  premoveFrom: Square | null;

  // actions
  reset: () => void;
  resign: (loser: Color) => void;
  undoMove: (count?: number) => void;
  setMode: (mode: PlayModeId) => void;
  setOnlineColor: (color: "w" | "b" | null) => void;
  setOnlineCommitHook: (fn: ((move: Move) => void) | null) => void;
  setPremoveHook: (fn: ((move: Move | null) => void) | null) => void;
  selectSquare: (sq: Square | null) => void;
  /** Try to play a move from→to. Returns the Move if accepted, null otherwise. */
  tryMove: (from: Square, to: Square) => Move | null;
  /** Apply a known legal move object, used by AI/worker integrations. */
  commitMove: (move: Move) => Move;
  /** Load a completed game into the store for archive -> review replay. */
  loadHistory: (history: readonly Move[]) => void;
  /**
   * Drop-target variant for drag-and-drop:
   *   - exact destination match works as in tryMove
   *   - dropping on a capture-target square (enemy piece being jumped) resolves
   *     to the move whose capture list contains that square
   */
  tryMoveOrCapture: (from: Square, to: Square) => Move | null;
  /** High-level: handle a user click on a board square. */
  handleSquareClick: (sq: Square) => Move | null;
  /** Replay scrub controls — see viewPly field for semantics. */
  hoverPly: (ply: number | null) => void;
  pinPly: (ply: number) => void;
  goToLive: () => void;
  viewStepBack: () => void;
  viewStepForward: () => void;
}

function deriveResult(game: GameState): GameResult {
  return getResult(game);
}

export const useGameStore = create<GameStore>((set, get) => ({
  game: initialState(),
  result: { kind: "ongoing" },
  selected: null,
  possibleMoves: [],
  lastMove: null,
  lastClassification: null,
  pieces: initialPieces(),
  pendingCapture: null,
  pendingCaptureBasePieces: null,
  viewPly: null,
  viewPinned: false,
  pinnedPly: null,
  activeMode: "local",
  onlineColor: null,
  _onlineCommitHook: null,
  _premoveHook: null,
  premoveFrom: null,

  setOnlineColor: (color) => set({ onlineColor: color }),
  setOnlineCommitHook: (fn) => set({ _onlineCommitHook: fn }),
  setPremoveHook: (fn) => set({ _premoveHook: fn }),

  reset: () => {
    const game = initialState();
    set({
      game,
      result: { kind: "ongoing" },
      selected: null,
      possibleMoves: [],
      lastMove: null,
      lastClassification: null,
      pieces: initialPieces(),
      pendingCapture: null,
      pendingCaptureBasePieces: null,
      viewPly: null,
      viewPinned: false,
      pinnedPly: null,
    });
  },

  resign: (loser) => {
    set({
      result: { kind: "win", winner: loser === "w" ? "b" : "w", reason: "resign" },
      selected: null,
      possibleMoves: [],
      pendingCapture: null,
      pendingCaptureBasePieces: null,
      viewPly: null,
      viewPinned: false,
      pinnedPly: null,
    });
  },

  undoMove: (count = 1) => {
    const { game, activeMode } = get();
    if (game.history.length < count) return;
    let state = initialState();
    let pieces = initialPieces();
    const targetPly = game.history.length - count;
    for (let i = 0; i < targetPly; i++) {
      pieces = applyMoveToPieces(pieces, game.history[i]);
      state = applyMove(state, game.history[i]);
    }
    set({
      game: state,
      result: deriveResult(state),
      selected: null,
      possibleMoves: [],
      lastMove: targetPly > 0 ? game.history[targetPly - 1] : null,
      lastClassification: null,
      pieces,
      pendingCapture: null,
      pendingCaptureBasePieces: null,
      viewPly: null,
      viewPinned: false,
      pinnedPly: null,
    });
  },

  setMode: (mode) => {
    const game = initialState();
    set({
      game,
      result: { kind: "ongoing" },
      selected: null,
      possibleMoves: [],
      lastMove: null,
      lastClassification: null,
      pieces: initialPieces(),
      pendingCapture: null,
      pendingCaptureBasePieces: null,
      viewPly: null,
      viewPinned: false,
      pinnedPly: null,
      activeMode: mode,
    });
  },

  hoverPly: (ply) => {
    const { pinnedPly } = get();
    if (ply === null) {
      set({ viewPly: pinnedPly, viewPinned: pinnedPly !== null });
      return;
    }
    set({ viewPly: ply });
  },

  pinPly: (ply) => {
    set({ viewPly: ply, viewPinned: true, pinnedPly: ply });
  },

  goToLive: () => {
    set({ viewPly: null, viewPinned: false, pinnedPly: null });
  },

  viewStepBack: () => {
    const { viewPly, game } = get();
    const live = game.history.length;
    const current = viewPly ?? live;
    const next = Math.max(0, current - 1);
    if (next === live) {
      set({ viewPly: null, viewPinned: false, pinnedPly: null });
    } else {
      set({ viewPly: next, viewPinned: true, pinnedPly: next });
    }
  },

  viewStepForward: () => {
    const { viewPly, game } = get();
    const live = game.history.length;
    const current = viewPly ?? live;
    const next = Math.min(live, current + 1);
    if (next === live) {
      set({ viewPly: null, viewPinned: false, pinnedPly: null });
    } else {
      set({ viewPly: next, viewPinned: true, pinnedPly: next });
    }
  },

  selectSquare: (sq) => {
    const { game } = get();
    if (sq === null) {
      set({ selected: null, possibleMoves: [] });
      return;
    }
    const { pendingCapture } = get();
    if (pendingCapture) {
      const current = pendingCapture.path[pendingCapture.path.length - 1];
      if (sameSquare(sq, current)) {
        set({ selected: sq, possibleMoves: [] });
      }
      return;
    }
    const piece = game.board[sq.row]?.[sq.col];
    if (!piece || piece.color !== game.turn) {
      set({ selected: null, possibleMoves: [] });
      return;
    }
    const moves = legalMovesFromSquare(game, sq);
    set({ selected: sq, possibleMoves: moves });
  },

  tryMove: (from, to) => {
    const { game, pieces, _onlineCommitHook } = get();
    const move = findMoveByEndpoints(game, from, to);
    if (!move) return null;
    const nextGame = applyMove(game, move);
    set({
      game: nextGame,
      result: deriveResult(nextGame),
      selected: null,
      possibleMoves: [],
      lastMove: move,
      lastClassification: classifyHotSeat(move),
      pieces: applyMoveToPieces(pieces, move),
      pendingCapture: null,
      pendingCaptureBasePieces: null,
      viewPly: null,
      viewPinned: false,
      pinnedPly: null,
    });
    _onlineCommitHook?.(move);
    return move;
  },

  commitMove: (move) => {
    const { game, pieces } = get();
    const nextGame = applyMove(game, move);
    set({
      game: nextGame,
      result: deriveResult(nextGame),
      selected: null,
      possibleMoves: [],
      lastMove: move,
      lastClassification: classifyHotSeat(move),
      pieces: applyMoveToPieces(pieces, move),
      pendingCapture: null,
      pendingCaptureBasePieces: null,
      viewPly: null,
      viewPinned: false,
      pinnedPly: null,
    });
    return move;
  },

  loadHistory: (history) => {
    let game = initialState();
    let pieces = initialPieces();
    for (const move of history) {
      pieces = applyMoveToPieces(pieces, move);
      game = applyMove(game, move);
    }
    set({
      game,
      result: deriveResult(game),
      selected: null,
      possibleMoves: [],
      lastMove: history.length > 0 ? history[history.length - 1] : null,
      lastClassification: null,
      pieces,
      pendingCapture: null,
      pendingCaptureBasePieces: null,
      viewPly: null,
      viewPinned: false,
      pinnedPly: null,
      activeMode: "local",
      onlineColor: null,
      premoveFrom: null,
    });
  },

  tryMoveOrCapture: (from, to) => {
    const { game, pendingCapture, pendingCaptureBasePieces, pieces, _onlineCommitHook, activeMode, onlineColor } = get();

    // Online mode: only let me drag my own pieces during my turn. Anything
    // else (opponent's piece during their turn, opponent's piece during my
    // turn, my piece during their turn) is silent-cancel — the visible state
    // never updates, so no rollback flash and no spurious sound.
    if (activeMode === "online" && onlineColor) {
      const fromPiece = game.board[from.row]?.[from.col];
      if (!fromPiece || fromPiece.color !== onlineColor) return null;
      if (game.turn !== onlineColor) return null;
    }

    if (pendingCapture) {
      const result = advanceCaptureDraft(pendingCapture, to);
      if (result.kind === "none") return null;
      const basePieces = pendingCaptureBasePieces ?? pieces;

      if (result.kind === "pending") {
        const current = result.draft.path[result.draft.path.length - 1];
        set({
          pendingCapture: result.draft,
          pieces: captureDraftPieces(basePieces, result.draft),
          selected: current,
          possibleMoves: [],
        });
        return null;
      }

      const nextGame = applyMove(game, result.move);
      set({
        game: nextGame,
        result: deriveResult(nextGame),
        selected: null,
        possibleMoves: [],
        lastMove: result.move,
        lastClassification: classifyHotSeat(result.move),
        pieces: applyMoveToPieces(basePieces, result.move),
        pendingCapture: null,
        pendingCaptureBasePieces: null,
        viewPly: null,
        viewPinned: false,
        pinnedPly: null,
      });
      _onlineCommitHook?.(result.move);
      return result.move;
    }

    const moves = legalMovesFromSquare(game, from);
    const draft = beginCaptureDraft(moves, from, to);
    if (draft.kind === "pending") {
      const current = draft.draft.path[draft.draft.path.length - 1];
      set({
        pendingCapture: draft.draft,
        pendingCaptureBasePieces: pieces,
        pieces: captureDraftPieces(pieces, draft.draft),
        selected: current,
        possibleMoves: [],
        viewPly: null,
        viewPinned: false,
        pinnedPly: null,
      });
      return null;
    }
    if (draft.kind === "commit") {
      const nextGame = applyMove(game, draft.move);
      set({
        game: nextGame,
        result: deriveResult(nextGame),
        selected: null,
        possibleMoves: [],
        lastMove: draft.move,
        lastClassification: classifyHotSeat(draft.move),
        pieces: applyMoveToPieces(pieces, draft.move),
        pendingCapture: null,
        pendingCaptureBasePieces: null,
        viewPly: null,
        viewPinned: false,
        pinnedPly: null,
      });
      _onlineCommitHook?.(draft.move);
      return draft.move;
    }

    let move = moves.find(
      (m) => m.to.row === to.row && m.to.col === to.col
    );
    if (!move) {
      move = moves.find((m) =>
        m.captures.some((c) => c.row === to.row && c.col === to.col)
      );
    }
    if (!move) return null;
    const nextGame = applyMove(game, move);
    set({
      game: nextGame,
      result: deriveResult(nextGame),
      selected: null,
      possibleMoves: [],
      lastMove: move,
      lastClassification: classifyHotSeat(move),
      pieces: applyMoveToPieces(pieces, move),
      pendingCapture: null,
      pendingCaptureBasePieces: null,
      viewPly: null,
      viewPinned: false,
      pinnedPly: null,
    });
    _onlineCommitHook?.(move);
    return move;
  },

  handleSquareClick: (sq) => {
    const { game, selected, result, viewPly, pendingCapture, activeMode, onlineColor } = get();
    if (result.kind !== "ongoing") return null;
    if ((activeMode === "bot" || activeMode === "coach") && game.turn === "b") return null;
    if (activeMode === "online" && onlineColor && game.turn !== onlineColor) {
      // Premove territory: let the user pick from→to on their own pieces
      const { _premoveHook, premoveFrom } = get();
      const piece = game.board[sq.row]?.[sq.col];
      if (!premoveFrom) {
        // First click: select own piece as premove source
        if (piece && piece.color === onlineColor) {
          set({ premoveFrom: sq });
        }
      } else if (sameSquare(premoveFrom, sq)) {
        // Click same square: cancel
        set({ premoveFrom: null });
        _premoveHook?.(null);
      } else if (piece && piece.color === onlineColor) {
        // Re-select different own piece
        set({ premoveFrom: sq });
      } else {
        // Second click: find the move in a hypothetical game where it's our turn
        const hypothetical: GameState = { ...game, turn: onlineColor };
        const move = findMoveByEndpoints(hypothetical, premoveFrom, sq);
        set({ premoveFrom: null });
        _premoveHook?.(move ?? null);
      }
      return null;
    }
    if (viewPly !== null) {
      // Scrubbing history — any click snaps back to the live position.
      set({
        viewPly: null,
        viewPinned: false,
        pinnedPly: null,
        selected: null,
        possibleMoves: [],
        pendingCapture: null,
        pendingCaptureBasePieces: null,
      });
      return null;
    }

    if (pendingCapture) {
      const current = pendingCapture.path[pendingCapture.path.length - 1];
      return get().tryMoveOrCapture(current, sq);
    }

    const piece = game.board[sq.row]?.[sq.col];

    // 1) No selection yet — try to select.
    if (!selected) {
      if (piece && piece.color === game.turn) {
        const moves = legalMovesFromSquare(game, sq);
        set({ selected: sq, possibleMoves: moves });
      }
      return null;
    }

    // 2) Click on the already-selected square — deselect.
    if (sameSquare(selected, sq)) {
      set({ selected: null, possibleMoves: [] });
      return null;
    }

    // 3) Click on another own-piece — re-select.
    if (piece && piece.color === game.turn) {
      const moves = legalMovesFromSquare(game, sq);
      set({ selected: sq, possibleMoves: moves });
      return null;
    }

    // 4) Otherwise — try the move (also accepts clicking on an enemy that
    // we'd capture, not just the landing square).
    return get().tryMoveOrCapture(selected, sq);
  },
}));

/** Read-only selector for any consumer. */
export function selectAllLegalMoves(s: GameStore): Move[] {
  return getLegalMoves(s.game);
}

export function forcedCaptureSquares(game: GameState): Square[] {
  const seen = new Set<string>();
  const out: Square[] = [];
  for (const move of getLegalMoves(game)) {
    if (move.captures.length === 0) continue;
    const key = `${move.from.row},${move.from.col}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(move.from);
  }
  return out;
}
