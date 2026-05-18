// ==UserScript==
// @name         DamaDojo Autoplay on draughts.io
// @namespace    https://damadojo.local
// @version      0.1.0
// @description  Plays your DamaDojo engine against the draughts.io bot. Talks to a local Next.js API for move selection.
// @match        https://draughts.io/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      localhost
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  // ─────────────────────────────────────────────────────────────────────
  // CONFIG — edit these after inspecting draughts.io DOM in DevTools.
  // ─────────────────────────────────────────────────────────────────────

  const API_URL = "http://localhost:3000/api/engine/best-move";
  const SEARCH_DEPTH = 14;
  const SEARCH_TIME_MS = 5000;

  // Which color does OUR engine play as on draughts.io?
  // Set this when you start a game on the site.
  const OUR_COLOR = "w"; // "w" or "b"

  // Board-orientation flag: true means draughts.io is rendering with white
  // at the bottom (default for a white-side player). If you play black,
  // the board flips — set to false.
  const WHITE_AT_BOTTOM = true;

  // CSS selectors — INSPECT THE SITE AND ADJUST THESE.
  const SELECTORS = {
    // A 64-cell or 32-dark-cell grid. Each cell should be reachable via
    // its row/col data attributes, id, or by position in the parent.
    boardRoot: ".board, [data-board], #board",
    cell: ".cell, td, .square",
    // Functions that pull row/col from a cell. Override if needed.
    getCellRow: (cell) => cell.dataset.row ?? cell.getAttribute("data-row"),
    getCellCol: (cell) => cell.dataset.col ?? cell.getAttribute("data-col"),
    // A piece element inside a cell. Color/king classes are read below.
    piece: ".piece, .checker, .stone, [data-piece]",
    isWhitePiece: (piece) =>
      piece.classList.contains("white") ||
      piece.dataset.color === "white" ||
      piece.dataset.color === "w",
    isKing: (piece) =>
      piece.classList.contains("king") ||
      piece.classList.contains("damka") ||
      piece.dataset.king === "true",
    // Turn indicator. If null, we use heuristics.
    turnIndicator: "[data-turn], .turn-indicator",
    getTurnFromIndicator: (el) => {
      const t = el?.textContent?.toLowerCase() ?? "";
      if (t.includes("white") || t.includes("белые")) return "w";
      if (t.includes("black") || t.includes("чёрные") || t.includes("черные")) return "b";
      return null;
    },
  };

  // ─────────────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────────────

  let enabled = false;
  let busy = false;
  let lastBoardSnapshot = "";

  // ─────────────────────────────────────────────────────────────────────
  // UI: floating toggle button
  // ─────────────────────────────────────────────────────────────────────

  function buildPanel() {
    const panel = document.createElement("div");
    panel.style.cssText = `
      position: fixed; bottom: 16px; right: 16px; z-index: 999999;
      background: #1a1208; color: #f5e9d4; border: 2px solid #c9a227;
      border-radius: 10px; padding: 10px 14px; font-family: system-ui, sans-serif;
      font-size: 13px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); min-width: 220px;
    `;
    panel.innerHTML = `
      <div style="font-weight:600; color:#c9a227; margin-bottom:6px;">DamaDojo Autoplay</div>
      <div id="dd-status" style="margin-bottom:8px;">Idle</div>
      <button id="dd-toggle" style="
        width:100%; padding:6px 10px; border-radius:6px; border:none;
        background:#c9a227; color:#1a1208; font-weight:600; cursor:pointer;
      ">Start</button>
      <div style="margin-top:8px; font-size:11px; opacity:0.7;">
        Make sure DamaDojo dev server is running on :3000.
      </div>
    `;
    document.body.appendChild(panel);
    document.getElementById("dd-toggle").addEventListener("click", () => {
      enabled = !enabled;
      document.getElementById("dd-toggle").textContent = enabled ? "Stop" : "Start";
      setStatus(enabled ? "Watching board…" : "Idle");
      if (enabled) tick();
    });
  }

  function setStatus(text) {
    const el = document.getElementById("dd-status");
    if (el) el.textContent = text;
    console.log("[DamaDojo]", text);
  }

  // ─────────────────────────────────────────────────────────────────────
  // BOARD READING
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Build a 32-char board string in Russian-numbering convention.
   * row 0 (top) = squares 1-4, row 1 = 5-8, ..., row 7 = 29-32.
   * If WHITE_AT_BOTTOM is true and the DOM puts row 0 at the top with
   * black home rank, this maps directly. Adjust if needed.
   */
  function readBoard() {
    const root = document.querySelector(SELECTORS.boardRoot);
    if (!root) return null;
    const grid = Array.from({ length: 8 }, () => Array(8).fill("."));
    const cells = root.querySelectorAll(SELECTORS.cell);
    for (const cell of cells) {
      const row = parseInt(SELECTORS.getCellRow(cell));
      const col = parseInt(SELECTORS.getCellCol(cell));
      if (!Number.isFinite(row) || !Number.isFinite(col)) continue;
      const piece = cell.querySelector(SELECTORS.piece);
      if (!piece) continue;
      const white = SELECTORS.isWhitePiece(piece);
      const king = SELECTORS.isKing(piece);
      grid[row][col] = white ? (king ? "W" : "w") : king ? "B" : "b";
    }
    // Apply flip if site renders with black at bottom for our perspective.
    const realGrid = WHITE_AT_BOTTOM ? grid : grid.map((r) => r.slice().reverse()).reverse();

    // Squeeze into 32 dark-square sequence.
    let out = "";
    for (let n = 1; n <= 32; n++) {
      const r = Math.floor((n - 1) / 4);
      const idx = (n - 1) % 4;
      const c = (r & 1) === 0 ? idx * 2 + 1 : idx * 2;
      out += realGrid[r][c];
    }
    return out;
  }

  function readTurn() {
    const el = document.querySelector(SELECTORS.turnIndicator);
    return SELECTORS.getTurnFromIndicator(el);
  }

  // ─────────────────────────────────────────────────────────────────────
  // CLICKING
  // ─────────────────────────────────────────────────────────────────────

  function squareToRowCol(n) {
    const r = Math.floor((n - 1) / 4);
    const idx = (n - 1) % 4;
    const c = (r & 1) === 0 ? idx * 2 + 1 : idx * 2;
    return WHITE_AT_BOTTOM ? { r, c } : { r: 7 - r, c: 7 - c };
  }

  function findCellByRowCol(r, c) {
    const root = document.querySelector(SELECTORS.boardRoot);
    if (!root) return null;
    const cells = root.querySelectorAll(SELECTORS.cell);
    for (const cell of cells) {
      const rr = parseInt(SELECTORS.getCellRow(cell));
      const cc = parseInt(SELECTORS.getCellCol(cell));
      if (rr === r && cc === c) return cell;
    }
    return null;
  }

  function clickSquare(squareNum) {
    const { r, c } = squareToRowCol(squareNum);
    const cell = findCellByRowCol(r, c);
    if (!cell) {
      setStatus(`Cell ${squareNum} (row ${r}, col ${c}) not found`);
      return false;
    }
    cell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    cell.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
    cell.click();
    return true;
  }

  async function playMove(fromSquare, pathSquares) {
    setStatus(`Playing ${fromSquare} → ${pathSquares.join(" → ")}`);
    if (!clickSquare(fromSquare)) return;
    for (const sq of pathSquares) {
      await sleep(280);
      if (!clickSquare(sq)) return;
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // ENGINE CALL
  // ─────────────────────────────────────────────────────────────────────

  function callEngine(board, turn) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: API_URL,
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify({ board, turn, maxDepth: SEARCH_DEPTH, timeMs: SEARCH_TIME_MS }),
        onload: (res) => {
          try {
            const data = JSON.parse(res.responseText);
            if (data.error) reject(new Error(data.error));
            else resolve(data);
          } catch (e) {
            reject(e);
          }
        },
        onerror: (e) => reject(new Error(`Network error: ${JSON.stringify(e)}`)),
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // MAIN LOOP
  // ─────────────────────────────────────────────────────────────────────

  async function tick() {
    if (!enabled) return;
    if (busy) {
      setTimeout(tick, 800);
      return;
    }

    const board = readBoard();
    if (!board) {
      setStatus("Board not found — check SELECTORS.boardRoot");
      setTimeout(tick, 1500);
      return;
    }
    if (board === lastBoardSnapshot) {
      setTimeout(tick, 600);
      return;
    }
    lastBoardSnapshot = board;

    const turn = readTurn() ?? guessTurn(board);
    if (turn !== OUR_COLOR) {
      setStatus(`Opponent's turn (${turn ?? "?"})`);
      setTimeout(tick, 600);
      return;
    }

    busy = true;
    setStatus(`Thinking… (depth ${SEARCH_DEPTH})`);
    try {
      const result = await callEngine(board, OUR_COLOR);
      setStatus(`Best: ${result.fromSquare}→${result.toSquare} (score ${result.score}, d${result.depth})`);
      await playMove(result.fromSquare, result.pathSquares);
    } catch (e) {
      setStatus(`Engine error: ${e.message}`);
    } finally {
      busy = false;
      setTimeout(tick, 1200);
    }
  }

  function guessTurn(board) {
    // Crude heuristic: count pieces. White moves first; if both sides have
    // equal counts the side-to-move is whoever moved last least recently.
    // Without DOM info we can't tell reliably — user should set OUR_COLOR
    // and rely on board-change detection. This stub returns OUR_COLOR
    // optimistically so the loop attempts a move; the server will reject
    // illegal positions.
    void board;
    return OUR_COLOR;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ─────────────────────────────────────────────────────────────────────
  // BOOTSTRAP
  // ─────────────────────────────────────────────────────────────────────

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildPanel);
  } else {
    buildPanel();
  }
})();
