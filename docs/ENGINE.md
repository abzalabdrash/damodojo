# DamaDojo Engine — Architecture & Build Plan

> Implementation-ready spec for the DamaDojo AI engine. Complements `BLUEPRINT.md`
> (which locks UX/product) by detailing *how* the engine is built, tested,
> and extracted as a standalone OSS package.
>
> **Canonical companion docs:** `BLUEPRINT.md` (product, UX, bots, review),
> `BRAND.md` (visual language). This doc only covers the engine internals.

---

## 0. Goals & honest strength target

Build the **strongest open-source Russian-draughts (8×8) engine under a permissive
license**. Not "Stockfish for shashki" — that's a year-long project. Target:

- **Practical strength:** beats 90-95% of casual and club-level players.
- **Estimated rating:** ~1500-1800 lidraughts elo for Russian variant.
- **Tactical depth:** depth 10 in <2s on a modern laptop CPU (single thread).
- **Correctness:** 100% rules-correct (Turkish strike, flying kings, free
  capture-route choice, mid-chain promotion, 50-move + threefold draws).
- **Out of MVP scope:** FMJD master-level play (needs bitboards / Rust+WASM /
  NNUE / endgame tablebases — see §17 post-MVP).

**README framing:** "First production-grade OSS Russian-draughts engine under
Apache 2.0. Club-strength. Built from scratch in TypeScript." Honest, defensible,
unique.

---

## 1. Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Language | **TypeScript** (no Rust/C++ in MVP) | Single stack, ships in browser via Web Worker, same code runs in Edge Functions for review. Rust→WASM is post-MVP. |
| Board representation | **`Uint8Array(32)`** indexed by Russian square number 1..32 | Fastest TS option that ships in 3 days. Bitboards in TS need BigInt or two-word bookkeeping — too much risk. `int8[64]` wastes half the cells. |
| Search | Negamax + alpha-beta + iterative deepening + TT + killer + history | Standard, battle-tested, fits the time budget. |
| Evaluation | Hand-tuned, ~10 features, phase-tapered | Dependable, debuggable, fast. NNUE is Phase 7 stretch. |
| Concurrency | **Web Worker** for browser, sync for Node | UI never blocks; same module works in Edge Functions. |
| License | **Apache 2.0** | Permissive AND has patent grant (vs MIT). Better for a startup positioning. |
| Repo strategy | Develop inside `src/lib/engine-ai/` of main repo. Extract to public repo `dama-engine` via `git subtree split` on Day 3 evening. | Avoids fragmenting work. Clean OSS history at the end. |
| Coupling to existing rule engine | **Engine-AI does NOT import `src/lib/engine/`** at runtime. Existing rule engine stays the UI / game-store source of truth. Engine-AI has its own fast representation, with `toGameState()`/`fromGameState()` converters at the boundary. | Allows engine-AI to be extracted cleanly. Existing engine remains untouched. |
| Strength via ML | **No NNUE / RL in critical path.** Optional Phase 7 add-on (teacher-distilled MLP). | Time better spent on UX/review/motifs. Honest research mention in README without overclaiming. |

---

## 2. File layout

```
src/lib/engine/                    # EXISTING rule engine — DO NOT MODIFY
  ├─ types.ts, board.ts, moves.ts, apply.ts, notation.ts
  └─ __tests__/

src/lib/engine-ai/                 # NEW — the AI engine (extractable)
  ├─ index.ts                      # public API: createEngine(), Engine class
  ├─ types.ts                      # internal types (FastState, Undo, TTEntry, ...)
  │
  ├─ board/
  │   ├─ fast-state.ts             # Uint8Array(32) representation + accessors
  │   ├─ encoding.ts               # square indexing 1..32 ↔ (row, col)
  │   ├─ make-unmake.ts            # make/unmake with Undo stack
  │   └─ convert.ts                # FastState ↔ public GameState
  │
  ├─ moves/
  │   ├─ generate.ts               # legal-move gen on FastState
  │   ├─ captures.ts               # forced captures + multi-capture DFS
  │   └─ encode.ts                 # 16-bit Move encoding for TT/ordering
  │
  ├─ search/
  │   ├─ negamax.ts                # negamax + alpha-beta + aspiration
  │   ├─ iterative.ts              # iterative deepening with time budget
  │   ├─ tt.ts                     # transposition table
  │   ├─ zobrist.ts                # Zobrist hashing (init keys, update on make)
  │   ├─ ordering.ts               # PV/TT/killer/history move ordering
  │   └─ quiescence.ts             # captures-only horizon extension
  │
  ├─ eval/
  │   ├─ evaluate.ts               # main eval entry, phase tapering
  │   ├─ pst.ts                    # piece-square tables (men, kings, by phase)
  │   ├─ features.ts               # mobility, back-rank, promotion race, etc.
  │   └─ weights.ts                # tunable weights (one file = easy A/B)
  │
  ├─ data/
  │   ├─ openings.json             # tiny opening book (~50-200 positions)
  │   └─ openings.ts               # book lookup helpers
  │
  ├─ review/
  │   ├─ classify.ts               # Best/Good/Inaccuracy/Mistake/Blunder/Miss/Brilliant
  │   ├─ winprob.ts                # eval → win probability via sigmoid
  │   ├─ motifs.ts                 # extract shashki motifs from PV diff
  │   └─ accuracy.ts               # per-side accuracy % (chess.com-style)
  │
  ├─ worker/
  │   ├─ engine.worker.ts          # Web Worker entry
  │   ├─ protocol.ts               # message types (typed)
  │   └─ bridge.ts                 # main-thread wrapper around postMessage
  │
  ├─ io/
  │   ├─ fen.ts                    # FEN-like notation parser/serializer
  │   └─ pdn.ts                    # PDN game parser (for review + book)
  │
  └─ __tests__/
      ├─ perft.test.ts             # perft cross-check vs src/lib/engine
      ├─ tactics.test.ts           # tactical positions (best-move tests)
      ├─ regression.test.ts        # known regressions
      └─ bench.ts                  # benchmark harness (NPS, depth/time)
```

---

## 3. Internal board representation (`FastState`)

```ts
class FastState {
  cells: Uint8Array;       // length 32, indexed by sqNum-1
  turn: 0 | 1;             // 0 = white, 1 = black
  halfmoveClock: number;
  ply: number;
  hash: number;            // Zobrist (two 32-bit halves stored as bigint or pair)
  repetitionStack: number[]; // hashes since last irreversible move
}
```

**Cell encoding (1 byte):**

```
bit 0 : occupied (1) / empty (0)
bit 1 : king (1) / man (0)
bit 2 : color (0 white, 1 black)
bits 3-7 : reserved (future: piece id, phantom flag for mid-chain)
```

**Why `Uint8Array(32)` over alternatives:**

- **vs bitboards in TS:** 64-bit ops in JS require BigInt (slow) or two-word
  juggling (error-prone). At depth 10, our perf budget is met without bitboards.
- **vs `Piece[][]` (existing):** array-of-array cloning is ~50× slower than
  Uint8Array make/unmake. Search at depth 10 is impossible with cloning.
- **vs `int8[64]`:** half the cells (light squares) are unused — wastes cache.
- **Square numbering** uses standard Russian shashki notation (1..32), already
  implemented in `src/lib/engine/board.ts:squareNumber`. Reuse that mapping.

**Make/unmake:**

```ts
interface Undo {
  move: number;             // 16-bit encoded
  captured: Uint8Array;     // captured piece byte values
  capturedSquares: number[];// 1..32 numbers
  prevHalfmove: number;
  prevHash: number;
  promotedHere: boolean;
}
const undoStack: Undo[] = [];
function make(s: FastState, move: number): void { ... }
function unmake(s: FastState): void { ... }
```

No allocations on hot path — preallocate undo entries (object pool of ~64).

---

## 4. Move generation

Mirror the rules already implemented in `src/lib/engine/moves.ts` (which is
correct per Russian rules) but on `FastState`:

- **Forced captures first.** If any capture exists for the side to move,
  return *only* captures. (Same as existing.)
- **Multi-capture chains:** explicit-stack DFS (no recursion → smaller call
  frames, better TS perf).
- **Turkish-strike:** captured pieces remain frozen as blockers until end of
  chain. Track via a `frozen: Uint32Array` mask (32 bits, one per square).
- **Mid-chain promotion:** if a man lands on the promotion row during the chain,
  it becomes a king for subsequent jumps in the same chain.
- **Free capture-route choice:** generate every maximal chain — do NOT prune by
  "longest capture" (that's Brazilian rules, not Russian).

**Move encoding (16-bit, packed into a `number`):**

```
bits 0-5   : from (0..31)
bits 6-11  : to   (0..31)
bit 12     : is_capture
bit 13     : is_promotion
bits 14-15 : flags (reserved)
```

Full capture list (which pieces are captured along the chain) is stored
*separately* per legal-move slot — captured squares form a variable-length list
that we keep in a side array indexed by move id within a generation batch.

---

## 5. Perft & correctness gate

`perft(state, depth)` returns the number of leaf nodes at the given depth.
This is the single most important correctness gate.

**Test plan (`__tests__/perft.test.ts`):**

1. From initial position, compute `perft(d)` on both the existing rule engine
   (slow, trusted) and `engine-ai` (fast, under test) for d ∈ {1..6}.
2. Counts MUST be identical.
3. Repeat from 5 hand-picked positions: middle-game with multi-capture
   available, endgame with king vs men, promotion-row pre-strike, threefold
   repetition position, 50-move-near-limit.
4. If any count differs → **bug in move generation or make/unmake**. Block
   merge until green.

This is non-negotiable. Skip this and the entire search above will produce
beautiful but wrong results.

---

## 6. Search

### 6.1 Algorithm

```
function search(s, depth, alpha, beta, ply):
  if hitTimeLimit(): throw Stop
  if isTerminal(s): return terminalScore(s, ply)

  ttEntry = tt.probe(s.hash)
  if ttEntry && ttEntry.depth >= depth:
    use ttEntry per its flag (exact/lower/upper)

  if depth == 0:
    return quiescence(s, alpha, beta, ply)

  moves = generate(s)
  if moves.length == 0: return -MATE + ply       // no-moves loss
  order(moves, ttEntry?.bestMove, killer[ply], history)

  best = -INF, bestMove = -1, flag = UPPER
  for move in moves:
    make(s, move)
    score = -search(s, depth-1, -beta, -alpha, ply+1)
    unmake(s)

    if score > best: best = score; bestMove = move
    if score > alpha: alpha = score; flag = EXACT
    if alpha >= beta:
      flag = LOWER
      killer[ply].push(move)
      history[fromto(move)] += depth*depth
      break

  tt.store(s.hash, depth, flag, best, bestMove)
  return best
```

### 6.2 Iterative deepening

```
function bestMove(s, opts):
  result = null
  for depth = 1; depth <= maxDepth; depth++:
    score = search(s, depth, -INF, +INF, 0)
    result = { depth, score, pv: extractPV(tt, s), nodes }
    if timeUp(opts.timeMs): break
    if Math.abs(score) > MATE - 100: break  // forced result found
  return result
```

- **Time budget** (`opts.timeMs`): set by caller. Engine polls `Date.now()`
  every 4096 nodes; on overflow, throws a `StopSearch` sentinel that unwinds
  the stack cleanly and returns the best move from the *last completed iteration*.
- **Aspiration windows** (after depth ≥ 4): start with `[score-50, score+50]`,
  re-search with wider window on fail-high/low. Optional polish.

### 6.3 Transposition table

- **Zobrist init:** 32 squares × 4 piece types (white-man, white-king,
  black-man, black-king) + 1 side-to-move bit. Total 129 random 64-bit keys
  (we use two-word bigint pair, or 64-bit `number` with caveats — see notes).
- **Entry layout** (compact, fits in a single typed-array slot via packing):
  ```
  key32_high  : 32-bit upper half of hash
  data        : { depth: 6 bits, flag: 2 bits, score: i16, bestMove: 16 bits }
  ```
- **Sizing:** default 32 MB → ~1M entries. Configurable via `Engine` options.
- **Replacement:** depth-preferred with always-replace fallback.
- **Repetition handling:** the search-level repetition check uses the
  `repetitionStack` on `FastState`, NOT the TT (TT can't distinguish
  positions reachable by different paths for repetition purposes).

### 6.4 Move ordering

Priority within a generated move list:

1. **PV move** from previous iterative-deepening pass (if any)
2. **TT bestMove** (if hash hit)
3. **Captures** (already mandatory if any, but ordered among themselves by
   captured material — most captured first; useful inside qsearch)
4. **Killer moves** (2 per ply, FIFO)
5. **History heuristic** (cumulative `from→to` table, decayed periodically)

### 6.5 Quiescence

Russian shashki has a *natural* quiescence: if any capture exists, it must be
made. Quiet = no captures available. The qsearch is therefore very clean:

```
function quiescence(s, alpha, beta, ply):
  standPat = evaluate(s)
  if standPat >= beta: return beta
  if standPat > alpha: alpha = standPat

  if !hasCaptures(s): return alpha   // already quiet

  for move in generateCaptures(s):
    make(s, move)
    score = -quiescence(s, -beta, -alpha, ply+1)
    unmake(s)
    if score >= beta: return beta
    if score > alpha: alpha = score
  return alpha
```

**Extensions:**
- **Promotion-imminent:** a man on the 6th/7th rank (1 step from king row)
  gets +1 ply extension at non-leaf nodes — they shape the next 2-3 plies.
- **Forced-only sequences:** if all moves are captures (single legal capture),
  do NOT decrement depth — extend automatically. This is shashki-natural.

---

## 7. Evaluation

### 7.1 Material

```
MAN  = 100
KING = 300
```

The 3× ratio is empirically right for Russian shashki (vs ~9× queen/pawn in
chess). Sources: classical shashki theory; lidraughts engine PSTs use similar.

### 7.2 Piece-square tables

Two 32-cell PSTs per piece type, blended by **game phase**:

```
phase = clamp(totalMaterial / startingMaterial, 0..1)
score = phase * mgPst[piece][sq] + (1-phase) * egPst[piece][sq]
```

**Men PST (mg):**
- +0..40 bonus for advancement (each rank closer to promotion)
- +12 for back-rank guard (rows 6-7 for white) — but **decays in endgame**

**Kings PST:**
- Center > edge (corners are weak in shashki, king can be trapped)
- Long diagonals (a1-h8, a8-h1) +6 bonus

PSTs live in `eval/pst.ts` as plain `Int8Array(32)` — readable, tweakable.

### 7.3 Feature list (v1, ~10 dependable features)

| Feature | Weight (init) | Notes |
|---|---|---|
| Material (man) | 100 | Per side |
| Material (king) | 300 | Per side |
| PST (men, phased) | 1.0× lookup | |
| PST (kings, phased) | 1.0× lookup | |
| Mobility | +2 per legal move, cap at 16 | Capture-only positions: skip |
| Back-rank guard | +12 per man on home rank × phase | Decays as endgame approaches |
| Promotion race | +30 to side with closest man to promo row | Difference, not sum |
| Trapped king | -40 per king with 0 flight squares | |
| Long-diagonal control | +8 per king on a1-h8 or a8-h1 | Strong shashki motif |
| Tempo | +5 to side-to-move | |
| Side-to-move zugzwang in 1k1k | Special-case | Hand-coded in king-only endgame |

All weights live in `eval/weights.ts` — single file for A/B tuning later.

### 7.4 Tuning

Day-3 polish (if time allows): run a 200-game self-play tournament between
two parameter sets (e.g., default vs `back-rank +20%`), use win delta to
pick winner. This is *very* low-effort with the bench harness in place.

---

## 8. Opening book

**Source:** lidraughts.org PDN export, variant=russian, top 500-1000 tournament
games. URL pattern: `https://lidraughts.org/api/games/user/{username}?variant=russian`
or per-tournament export.

**Build script** (run once, output committed):

```
node scripts/build-openings.ts
  → parse PDN files
  → for each game, walk first 12 plies
  → record (positionHash → moveCount map)
  → output entries with totalSeen ≥ 3 (filters typos)
  → write src/lib/engine-ai/data/openings.json
```

**Format:**

```json
{
  "1a2b3c...": [
    { "move": 1234, "weight": 87 },
    { "move": 5678, "weight": 42 }
  ]
}
```

Hash key is `hash.toString(36)` (compact). Move is 16-bit encoded.

**Engine integration:**

```
function pickBookMove(s): Move | null {
  const entries = book.get(s.hash);
  if (!entries) return null;
  return weightedSample(entries);  // some randomness for variety
}
```

Probe book *before* search. If hit, return book move (no search needed).
Falls back to search after move 10-12 (book depth limit).

**Size target:** 20-50 KB minified.

---

## 9. Endgame helpers

No full tablebases in MVP. Hand-coded helpers for common patterns:

- **1k vs 1k:** known draw. Return a score nudged toward draw (+/- 5 cp from
  zero, with side-to-move tempo). Repetition detection handles the rest.
- **Multi-king vs solo king:** material is decisive; PST + mobility carry it.
- **King + man vs king:** usually drawn unless man is far advanced — let
  search figure it out; eval just needs to not panic.

**Edge case to test:** the "triangle" trap (king + 2 men, opposite king in
the wrong corner) — pre-record a few positions in `__tests__/tactics.test.ts`
to verify the engine finds the win.

**Phase 7 stretch:** 3-piece bitbase. Out of MVP scope.

---

## 10. Web Worker integration

**Worker entry** (`worker/engine.worker.ts`):

```ts
import { Engine } from "../index";
const engine = new Engine();

onmessage = (ev) => {
  const msg = ev.data;
  switch (msg.type) {
    case "analyze":
      engine.analyze(msg.payload, (info) =>
        postMessage({ type: "info", info })
      ).then((result) =>
        postMessage({ type: "done", id: msg.id, result })
      );
      break;
    case "stop": engine.stop(); break;
  }
};
```

**Main-thread bridge** (`worker/bridge.ts`):

```ts
export function createEngineWorker(url: string) {
  const w = new Worker(url, { type: "module" });
  let nextId = 0;
  const pending = new Map();
  w.onmessage = (ev) => { /* resolve pending[id] */ };

  return {
    analyze: (opts, onInfo) => new Promise((resolve) => {
      const id = ++nextId;
      pending.set(id, { resolve, onInfo });
      w.postMessage({ type: "analyze", id, payload: opts });
    }),
    stop: () => w.postMessage({ type: "stop" }),
    terminate: () => w.terminate(),
  };
}
```

For Node (Edge Functions, tests): same engine module, no Worker — direct sync
calls.

---

## 11. Review pipeline

### 11.1 winProbability(eval)

```
winProbability(eval: number): number {  // 0..1
  return 1 / (1 + Math.exp(-eval / SCALE));  // SCALE ≈ 300 cp
}
```

Calibrate `SCALE` later from self-play games (fit logistic to actual outcomes).

### 11.2 Classification

Per BLUEPRINT.md §3.4 — implementation here:

```
function classify(input: {
  evalBefore: number,     // engine eval before player's move (side-to-move POV)
  evalAfter: number,      // engine eval after player's move (still side-to-move POV; sign-flip handled)
  bestMove: Move,
  playedMove: Move,
  bestEvalIfBest: number, // what eval would be if best move played
  isCapture: boolean,
  isSacrifice: boolean,
  opponentBlundered: boolean, // previous move was Blunder/Mistake
}): MoveClass {
  const wpBefore = winProbability(evalBefore);
  const wpAfter  = winProbability(evalAfter);
  const wpBest   = winProbability(bestEvalIfBest);
  const delta    = wpBefore - wpAfter;          // loss to side-to-move

  if (movesEqual(playedMove, bestMove)) {
    if (isSacrifice && isOnlyGoodMove) return "brilliant";
    if (isOnlyGoodMove) return "great";
    return "best";
  }
  if (inBook(positionHash)) return "book";
  if (opponentBlundered && delta > 0.10) return "miss";

  if (delta < 0.02) return "excellent";
  if (delta < 0.05) return "good";
  if (delta < 0.10) return "inaccuracy";
  if (delta < 0.20) return "mistake";
  return "blunder";
}
```

`isSacrifice` = played move loses material immediately but engine still
prefers it (positive `bestEvalIfBest` despite material deficit).
`isOnlyGoodMove` = `wpBest - wpSecondBest > 0.15`.

### 11.3 Motif extraction

For non-best moves, scan the diff between played PV and engine PV. Pattern
matchers in `review/motifs.ts`:

| Motif | Detector |
|---|---|
| `missed_capture` | Player had a capture but chose simple move (impossible under correct rules — forced) — flag if classify catches a "Blunder" that's a capture-route choice mistake. |
| `wrong_capture_route` | Player took a chain with k captures when a k+m chain was available. (Reminder: Russian allows free choice — but engine still rates chains; if eval delta favors longer chain, motif fires.) |
| `lost_long_diagonal` | After played move, opponent king controls a1-h8 or a8-h1 that wasn't theirs before. |
| `promotion_gift` | Within 3 plies after played move, opponent forces a promotion. |
| `tempo_loss` | Played move is a king shuffle when there were active alternatives. |
| `back_rank_break` | Played move vacates last back-rank guard, allowing opponent breakthrough within 4 plies. |

**Output per move:**

```ts
interface ReviewedMove {
  ply: number;
  notation: string;
  class: MoveClass;
  motif?: Motif;
  evalBefore: number;
  evalAfter: number;
  wpDelta: number;
  bestMove: string;       // notation
  bestLine: string[];     // first 4 plies of PV
  playedLine: string[];   // what actually happened
}
```

**Featherless LLM** (per BLUEPRINT §3.4): called *only* on Blunder / Mistake /
Brilliant / Miss. Input: motif + class + brief context. Output: one-sentence
Ата voice in user's locale. Cached in `game_reviews` table.

### 11.4 Accuracy

```
accuracy = 100 * (1 - mean(wpDelta over all non-book moves) * SCALE_ACC)
```

Calibrate `SCALE_ACC` so a clean engine self-play game scores 95-99.

---

## 12. Public API (the OSS face)

What `import { ... } from "dama-engine"` will expose after Day 3 extraction:

```ts
import { Engine, parseFEN, parsePDN, perft } from "dama-engine";

// Browser (with Worker):
const engine = new Engine({
  workerUrl: "/dama-engine.worker.js",
  hashMB: 32,
});

// Node:
const engine = new Engine({ hashMB: 32 });

// Analyze a position
const result = await engine.analyze({
  fen: "...",                   // or state
  depth: 12,
  timeMs: 3000,
  multiPV: 3,                   // top-3 lines
  onInfo: (info) => { /* depth, score, pv updates */ },
});
// → { bestMove, score, depth, pv, nodes, nps, tbhits }

// Best move only (fast)
const move = await engine.bestMove({ fen, timeMs: 800 });

// Full game review
const review = await engine.review({
  pdn: "1. cd4 fg5 2. ...",
  perMoveTimeMs: 400,
});
// → { moves: [...], accuracy: { w, b }, summary: {...} }

engine.stop();
engine.terminate();
```

Stable, minimal, no exotic types in the surface. Internal types (FastState,
Undo, TTEntry) are NOT exported.

---

## 13. Phased build plan

Target: working engine + review in 3 days (~25-30 working hours).

### Phase 1 — Fast board + perft (4-6h) **BLOCKING**

- [ ] `board/encoding.ts` — sqNum 1..32 ↔ (row,col), with tests
- [ ] `board/fast-state.ts` — `Uint8Array(32)`, accessors, init, clone
- [ ] `board/convert.ts` — `toGameState()` / `fromGameState()`
- [ ] `moves/captures.ts`, `moves/generate.ts` — mirror existing rules
- [ ] `board/make-unmake.ts` — make/unmake with `Undo` stack
- [ ] `__tests__/perft.test.ts` — perft d=1..6, identical counts vs existing engine
- **Gate:** all perft tests green. Without this, nothing else matters.

### Phase 2 — Search (4-6h)

- [ ] `search/zobrist.ts` — keys + incremental update in make/unmake
- [ ] `search/tt.ts` — TT with packed entries
- [ ] `search/negamax.ts` — negamax + alpha-beta
- [ ] `search/iterative.ts` — iterative deepening with time budget
- [ ] `search/ordering.ts` — PV/TT/killer/history
- [ ] `search/quiescence.ts` — captures-only horizon
- [ ] Smoke test: engine plays itself, doesn't crash, prefers material
- **Gate:** depth 8 in <1s from initial position.

### Phase 3 — Evaluation (3-4h)

- [ ] `eval/pst.ts` — men + kings PSTs, mg + eg
- [ ] `eval/features.ts` — mobility, back-rank, promotion race, trapped king,
      long diagonal, tempo
- [ ] `eval/evaluate.ts` — phase tapering + sum
- [ ] `eval/weights.ts` — extracted constants
- [ ] `__tests__/tactics.test.ts` — 10 tactical positions, engine finds best
      move at depth 8
- **Gate:** beats a random player 100%, beats a material-only eval 90%+.

### Phase 4 — Web Worker + API (2-3h)

- [ ] `worker/protocol.ts` — typed message protocol
- [ ] `worker/engine.worker.ts` — worker entry
- [ ] `worker/bridge.ts` — main-thread wrapper
- [ ] `index.ts` — `Engine` class, public API
- [ ] Hook into Play screen: "best move" lightbulb hint button
- [ ] Hook into Play screen: eval bar (depth 6, fast)
- **Gate:** UI doesn't block during search; hint lightbulb works.

### Phase 5 — Review pipeline (3-4h)

- [ ] `io/pdn.ts` — PDN parse + serialize (for review input + opening book)
- [ ] `review/winprob.ts` — sigmoid w/ tunable scale
- [ ] `review/classify.ts` — class assignment per BLUEPRINT
- [ ] `review/motifs.ts` — pattern matchers (start with 3-4, expand as time)
- [ ] `review/accuracy.ts` — per-side %
- [ ] `Engine.review()` — full game pass
- [ ] Wire into `/review/[gameId]` screen
- **Gate:** review of a complete game runs in <30s on laptop.

### Phase 6 — Opening book + endgame polish (2-3h)

- [ ] Build script: download lidraughts PDN → produce `openings.json`
- [ ] `data/openings.ts` — probe + weighted sample
- [ ] Hand-tuned 1k1k draw recognition + a few endgame test positions
- [ ] Self-play sanity tournament (Beginner vs Hard, 20 games)
- **Gate:** Hard bot wins 18+/20 vs Beginner.

### Phase 7 (POST-MVP, if time) — Stretch goals

- [ ] **NNUE-lite evaluator:** generate 500k positions self-labeled by classical
      engine (depth 10), train 256-128-1 MLP on H100 (4-6h), wire as
      drop-in eval. Compare strength.
- [ ] **3-piece endgame bitbase:** generate offline, ship as compressed file.
- [ ] **Bitboard rewrite** for 10-50× speedup → enables depth 14+ in same time.
- [ ] **Rust→WASM port** for browser perf parity with server.

---

## 14. Data to fetch (you, manually)

1. **lidraughts PDN (Russian variant)** — for opening book + review benchmarks.
   - Browse: https://lidraughts.org/games/search?perf=russian (UI)
   - API: https://lidraughts.org/api (look for `/api/games/user/`,
     tournament exports)
   - Target: 500-1000 games from rated players (rating ≥ 1800).
   - Save into `data/pdn-raw/` (gitignored).

2. **PDN 3.0 specification** — for the parser.
   - Reference: https://pdn.fmjd.org/ (look for the spec PDF/HTML)
   - Note: Russian variant uses GameType tag `25` (8×8, draughts-64).

3. **IDF / Section-64 official rules** — for edge-case verification only.
   - Reference: https://idf64.org/ (the international body for 64-square
     draughts; rules PDF in their downloads section).

**Do NOT fetch:** Scan source (GPL, 10×10), Kingsrow (closed), other engines.
We want clean Apache 2.0 provenance.

---

## 15. OSS repo extraction (Day 3 evening, ~1h)

```bash
# From main repo
git subtree split --prefix=src/lib/engine-ai -b dama-engine-split

# New repo (create on GitHub first)
git clone git@github.com:<you>/dama-engine.git
cd dama-engine
git pull ../checkers dama-engine-split

# Add OSS scaffolding
- LICENSE (Apache 2.0 full text)
- NOTICE
- README.md (see template below)
- CONTRIBUTING.md
- package.json (rename to "dama-engine", set version 0.1.0, exports map)
- tsconfig.json
- .github/workflows/test.yml (Vitest CI)

git add . && git commit -m "Initial public release"
git push origin main
```

**Main repo re-import options:**

- **Option A (simpler for MVP):** keep code in main repo, *also* push to public
  repo. README in main repo links to public repo: "engine code mirrored to
  github.com/.../dama-engine under Apache 2.0".
- **Option B (cleaner for after MVP):** publish to npm as `dama-engine`,
  install as dep in main repo, delete `src/lib/engine-ai/`.

For nFactorial submission: **Option A**. Less risk, same optics.

### 15.1 OSS README skeleton

```
# dama-engine

The first production-grade open-source engine for Russian draughts
(русские шашки, 8×8) under the Apache 2.0 license.

## Features
- Full Russian-rules move generation (Turkish strike, flying kings, free
  capture-route choice, mid-chain promotion, 50-move + threefold draws)
- Negamax + alpha-beta + iterative deepening + transposition table
- Hand-tuned phase-tapered evaluation
- Opening book derived from lidraughts tournament games
- Web Worker support for browser; sync API for Node
- PDN parser
- Game review with chess.com-style move classification

## Strength
Club-level. Depth 10 in ~1.5s on a modern laptop CPU. Empirically beats
~95% of casual + club-level players in self-play and human testing.

This is NOT a master-strength engine. See ROADMAP for the NNUE + bitboard
path toward FMJD-master play.

## Install
npm install dama-engine

## Quick start
[code sample]

## API
[link to API.md]

## Benchmarks
[link to BENCHMARKS.md]

## Contributing
[link to CONTRIBUTING.md]

## License
Apache 2.0 — see LICENSE.
```

---

## 16. Strength validation

Three layers, increasing rigor:

### 16.1 Smoke (every commit, ~5s)

- 5 tactical positions: engine at depth 8 must find the known best move.
- 1 endgame draw position: engine must NOT lose.

### 16.2 Regression (nightly, ~5 min)

- 30 hand-picked test positions across opening / middlegame / endgame.
- Per-position best-move match + eval-stability check.

### 16.3 Gauntlet (manual, post-MVP)

- 50-game self-play tournament between any two engine variants (different
  weights, with/without book, etc.).
- Win/draw/loss + average move-class distribution.
- Bench in `__tests__/bench.ts` to track NPS regressions.

---

## 17. Post-MVP roadmap (for README ROADMAP.md)

- **Bitboard rewrite** — 10-50× speedup, enables depth 14+ in same wall-clock.
- **NNUE evaluator** — 256-128-1 MLP trained on engine-labeled positions
  (H100 6-12h). Drop-in `evaluate()` replacement.
- **Endgame bitbases** — 3 piece (~50 KB), 4 piece (~5 MB), distributed via CDN.
- **Rust→WASM** — browser perf parity with server, offline analysis.
- **MCTS hybrid** — for strong play in endgame races where alpha-beta tactical
  search undervalues long-term plans.
- **Self-play RL** — once classical engine is stable and bitbases exist.

Each item is honestly framed as "future work", not promised in MVP.

---

## 18. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Perft mismatch (move-gen bug) | Medium | §5 perft gate; fix BEFORE search work. |
| Depth-10 takes >5s, UX bad | Medium | Time budget + iterative deepening always returns last completed depth. |
| Review too slow (>60s/game) | Medium | Lower `perMoveTimeMs` to 200ms; warm TT between moves. |
| Featherless rate-limit on review | Low | Only call on Blunder/Mistake/Brilliant/Miss; cache aggressively. |
| OSS extraction misses files / breaks main repo | Low | Do extraction on a branch + verify both repos build. |
| Tempted to add features beyond §7.3 | High (self-imposed) | Resist. 10 features hand-tuned > 30 features unknown. |

---

## 19. Quick reference — file → owner phase

```
board/*           → Phase 1
moves/*           → Phase 1
search/*          → Phase 2
eval/*            → Phase 3
worker/*          → Phase 4
index.ts          → Phase 4
review/*          → Phase 5
io/pdn.ts         → Phase 5
io/fen.ts         → Phase 1 or 4 (whenever needed first)
data/*            → Phase 6
```

---

End of plan. Read once, then build Phase 1.
