// Re-export all protocol types from the party layer for use on the client.
// Single source of truth — no duplication.
export type {
  ClientMsg,
  ServerMsg,
  ClockState,
  PlayerInfo,
  ChatMsg,
  GameStatus,
  SerializedGameState,
  SerializedMove,
  SerializedPiece,
} from "../../../party/protocol";
export {
  moveToUci,
  uciToEndpoints,
  serializeGameState,
  serializeMove,
} from "../../../party/protocol";
