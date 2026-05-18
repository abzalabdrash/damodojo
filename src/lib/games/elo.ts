export const DEFAULT_ELO = 1500;

export interface EloGameRow {
  readonly white_id: string | null;
  readonly white_nick: string | null;
  readonly black_id: string | null;
  readonly black_nick: string | null;
  readonly winner: "w" | "b" | null;
  readonly time_control?: string | null;
  readonly finished_at?: string | null;
}

export interface LeaderboardPlayer {
  readonly id: string;
  readonly nick: string;
  readonly elo: number;
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
  readonly games: number;
  readonly winRate: number;
}

interface MutablePlayer {
  id: string;
  nick: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
}

function isHumanPlayer(id: string | null | undefined): id is string {
  return Boolean(id) && !id!.startsWith("bot:") && !id!.startsWith("coach:");
}

function isOnlineGame(game: EloGameRow): boolean {
  const tc = game.time_control?.toLowerCase();
  return tc !== "bot" && tc !== "coach";
}

function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

export function calculateEloDelta(
  rating: number,
  opponentRating: number,
  score: 0 | 0.5 | 1,
): number {
  const expected = expectedScore(rating, opponentRating);
  const underdog = rating < opponentRating;
  const k =
    score === 1 && underdog ? 48 :
    score === 0 && !underdog ? 32 :
    24;
  return Math.round(k * (score - expected));
}

function upsert(
  players: Map<string, MutablePlayer>,
  id: string,
  nick: string | null,
): MutablePlayer {
  const existing = players.get(id);
  if (existing) {
    if (nick) existing.nick = nick;
    return existing;
  }
  const player: MutablePlayer = {
    id,
    nick: nick ?? id,
    rating: DEFAULT_ELO,
    wins: 0,
    losses: 0,
    draws: 0,
  };
  players.set(id, player);
  return player;
}

export function buildLeaderboardRows(games: readonly EloGameRow[]): LeaderboardPlayer[] {
  const players = new Map<string, MutablePlayer>();
  const ordered = [...games].sort((a, b) => {
    const at = a.finished_at ? Date.parse(a.finished_at) : 0;
    const bt = b.finished_at ? Date.parse(b.finished_at) : 0;
    return at - bt;
  });

  for (const game of ordered) {
    if (!isOnlineGame(game)) continue;
    if (!isHumanPlayer(game.white_id) || !isHumanPlayer(game.black_id)) continue;

    const white = upsert(players, game.white_id, game.white_nick);
    const black = upsert(players, game.black_id, game.black_nick);
    const whiteBefore = white.rating;
    const blackBefore = black.rating;

    const whiteScore = game.winner === "w" ? 1 : game.winner === "b" ? 0 : 0.5;
    const blackScore = game.winner === "b" ? 1 : game.winner === "w" ? 0 : 0.5;

    white.rating = Math.max(100, white.rating + calculateEloDelta(whiteBefore, blackBefore, whiteScore));
    black.rating = Math.max(100, black.rating + calculateEloDelta(blackBefore, whiteBefore, blackScore));

    if (game.winner === "w") {
      white.wins++;
      black.losses++;
    } else if (game.winner === "b") {
      black.wins++;
      white.losses++;
    } else {
      white.draws++;
      black.draws++;
    }
  }

  return [...players.values()]
    .map((p) => {
      const gamesCount = p.wins + p.losses + p.draws;
      return {
        id: p.id,
        nick: p.nick,
        elo: p.rating,
        wins: p.wins,
        losses: p.losses,
        draws: p.draws,
        games: gamesCount,
        winRate: gamesCount > 0 ? Math.round((p.wins / gamesCount) * 100) : 0,
      };
    })
    .filter((p) => p.games > 0)
    .sort((a, b) => b.elo - a.elo || b.wins - a.wins || b.winRate - a.winRate)
    .slice(0, 50);
}
