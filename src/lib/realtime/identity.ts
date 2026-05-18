import { v4 as uuidv4 } from "uuid";

const PLAYER_ID_KEY = "dama_player_id";
const PLAYER_NICK_KEY = "dama_player_nick";

export interface GuestIdentity {
  playerId: string;
  nick: string;
}

export function getOrCreateGuestIdentity(): GuestIdentity {
  if (typeof window === "undefined") {
    return { playerId: "ssr", nick: "Guest" };
  }
  let playerId = localStorage.getItem(PLAYER_ID_KEY);
  if (!playerId) {
    playerId = uuidv4();
    localStorage.setItem(PLAYER_ID_KEY, playerId);
  }
  const nick = getStoredNick() ?? defaultNick(playerId);
  return { playerId, nick };
}

export function getStoredNick(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PLAYER_NICK_KEY);
}

export function saveNick(nick: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PLAYER_NICK_KEY, nick.trim().slice(0, 24));
}

export function hasNick(): boolean {
  return !!getStoredNick();
}

function defaultNick(playerId: string): string {
  return `Гость-${playerId.slice(0, 4).toUpperCase()}`;
}
