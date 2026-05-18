import { initialFastState } from "../board/fast-state";
import { searchBestMove } from "../search/iterative";

const state = initialFastState();
const result = searchBestMove(state, { maxDepth: 8, timeMs: 1000 });

console.log(
  JSON.stringify(
    {
      depth: result.depth,
      score: result.score,
      nodes: result.nodes,
      nps: result.nps,
      elapsedMs: result.elapsedMs,
      bestMove: result.bestMove
        ? {
            from: result.bestMove.from,
            to: result.bestMove.to,
            captures: result.bestMove.captures.length,
          }
        : null,
    },
    null,
    2
  )
);
