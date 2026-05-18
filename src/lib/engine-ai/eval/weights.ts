export const WEIGHTS = {
  man: 100,
  king: 320,
  pst: 1,
  mobility: 3,
  mobilityCap: 18,
  backRankGuard: 40,
  promotionRace: 36,
  trappedKing: -80,
  longDiagonal: 10,
  tempo: 8,
  /** Per empty diagonal cell adjacent to a king (capped). */
  kingMobility: 4,
  kingMobilityCap: 4,
  /** Pair of own pieces forming a defensive bridge. */
  protectedPiece: 4,
} as const;
