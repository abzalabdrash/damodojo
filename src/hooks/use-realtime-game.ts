"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  applyMove,
  findMoveByEndpoints,
  getResult,
} from "@/lib/engine";
import type { Move } from "@/lib/engine";
import { createGameClient, getPartyKitHost } from "@/lib/realtime/client";
import type { GameClient } from "@/lib/realtime/client";
import { moveToUci, uciToEndpoints } from "@/lib/realtime/protocol";
import type { SerializedGameState, ServerMsg } from "@/lib/realtime/protocol";
import type { GameState, Board, Piece } from "@/lib/engine";
import { useGameStore, applyMoveToPieces } from "@/stores/game-store";
import type { UIPiece } from "@/stores/game-store";
import { useOnlineStore } from "@/stores/online-store";

export function useRealtimeGame(roomId: string | null, timeControl?: string) {
  const clientRef = useRef<GameClient | null>(null);
  const lastVRef = useRef<number>(0);
  const pendingCidRef = useRef<number | null>(null);

  const handleMessage = useCallback((msg: ServerMsg) => {
    const onlineState = useOnlineStore.getState();
    const {
      setConnectionStatus,
      setPlayers,
      setClock,
      setGameStatus,
      addChat,
      setChats,
      setPremove,
      myColor,
    } = onlineState;

    switch (msg.t) {
      case "snapshot": {
        lastVRef.current = msg.v;

        // Derive my color from the players list using my playerId, falling
        // back to whatever color was provisionally assigned.
        const { playerId } = onlineState;
        const me = msg.players.find((p) => p.playerId === playerId);
        const resolvedColor = me?.color ?? myColor;
        if (resolvedColor && resolvedColor !== myColor) {
          useOnlineStore.setState({ myColor: resolvedColor });
        }

        setPlayers(msg.players);
        setClock(msg.clock);
        setGameStatus(msg.status);
        setChats(msg.chat);
        if (msg.timeControl) {
          onlineState.setTimeControl(msg.timeControl);
        }

        const gs = deserializeGameState(msg.gameState);
        const { setOnlineColor } = useGameStore.getState();
        setOnlineColor(resolvedColor);

        useGameStore.setState({
          game: gs,
          result: getResult(gs),
          selected: null,
          possibleMoves: [],
          lastMove: gs.history[gs.history.length - 1] ?? null,
          lastClassification: null,
          pieces: piecesFromBoard(gs),
          pendingCapture: null,
          pendingCaptureBasePieces: null,
          viewPly: null,
          viewPinned: false,
          pinnedPly: null,
          premoveFrom: null,
        });

        pendingCidRef.current = null;

        if (msg.status === "playing" || msg.status === "waiting") {
          setConnectionStatus("live");
        }
        break;
      }

      case "move": {
        lastVRef.current = msg.v;
        setClock(msg.clock);

        const wasOurMove = msg.by === myColor && pendingCidRef.current !== null;

        if (wasOurMove) {
          pendingCidRef.current = null;
          // Move already applied optimistically — nothing to do
        } else {
          // Opponent move
          const endpoints = uciToEndpoints(msg.uci);
          if (!endpoints) {
            requestResync();
            break;
          }
          const { game, pieces } = useGameStore.getState();
          const move = findMoveByEndpoints(game, endpoints.from, endpoints.to);
          if (!move) {
            requestResync();
            break;
          }
          const nextGame = applyMove(game, move);
          useGameStore.setState({
            game: nextGame,
            result: getResult(nextGame),
            lastMove: move,
            lastClassification: null,
            pieces: applyMoveToPieces(pieces, move),
            selected: null,
            possibleMoves: [],
            pendingCapture: null,
            pendingCaptureBasePieces: null,
            viewPly: null,
            viewPinned: false,
            pinnedPly: null,
            premoveFrom: null,
          });

          // Try to execute premove on our turn
          const { premoveUci } = useOnlineStore.getState();
          if (premoveUci && nextGame.turn === myColor) {
            const pmEndpoints = uciToEndpoints(premoveUci);
            setPremove(null);
            if (pmEndpoints) {
              const pmMove = findMoveByEndpoints(nextGame, pmEndpoints.from, pmEndpoints.to);
              if (pmMove) {
                // Execute premove in next tick to let render settle
                setTimeout(() => sendMoveWire(pmMove), 0);
              }
            }
          }
        }
        break;
      }

      case "rejected": {
        if (pendingCidRef.current === msg.cid) {
          pendingCidRef.current = null;
          // Roll back: request fresh snapshot
          requestResync();
        }
        break;
      }

      case "chat": {
        lastVRef.current = msg.v;
        addChat(msg.msg);
        break;
      }

      case "presence": {
        setPlayers(msg.players);
        break;
      }

      case "game_end": {
        lastVRef.current = msg.v;
        setClock(msg.finalClock);
        setGameStatus(msg.winner ? "finished_win" : "finished_draw");
        const result = msg.winner
          ? ({ kind: "win", winner: msg.winner, reason: msg.reason as "resign" | "no_pieces" | "no_moves" } as const)
          : ({ kind: "draw", reason: "agreement" } as const);
        useGameStore.setState({ result });
        break;
      }

      case "draw_offer_received":
        // TODO: surface draw offer UI
        break;

      case "pong":
        break;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function requestResync() {
    const { playerId, nick } = useOnlineStore.getState();
    if (!playerId || !nick) return;
    clientRef.current?.send({ t: "hello", playerId, nick, lastV: -1 });
  }

  function sendMoveWire(move: Move) {
    const client = clientRef.current;
    if (!client) return;
    const { consumeCid } = useOnlineStore.getState();
    const cid = consumeCid();
    pendingCidRef.current = cid;
    client.send({ t: "move", cid, uci: moveToUci(move), clientV: lastVRef.current });
  }

  // This is registered as the _onlineCommitHook in game-store.
  // Called AFTER game-store has already applied the move optimistically.
  const onCommit = useCallback((move: Move) => {
    sendMoveWire(move);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Register/unregister the commit hook
  useEffect(() => {
    if (!roomId) return;
    useGameStore.getState().setOnlineCommitHook(onCommit);
    useGameStore.getState().setPremoveHook(sendPremove);
    return () => {
      useGameStore.getState().setOnlineCommitHook(null);
      useGameStore.getState().setPremoveHook(null);
    };
  }, [roomId, onCommit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Connect when roomId is available
  useEffect(() => {
    if (!roomId) return;
    const { playerId, nick, setConnectionStatus } = useOnlineStore.getState();
    if (!playerId || !nick) return;

    setConnectionStatus("connecting");

    const client = createGameClient({
      host: getPartyKitHost(),
      roomId,
      playerId,
      nick,
      lastV: lastVRef.current,
      timeControl,
      onMessage: handleMessage,
      onOpen: () => useOnlineStore.getState().setConnectionStatus("connecting"),
      onClose: () => useOnlineStore.getState().setConnectionStatus("reconnecting"),
      onReconnect: () => useOnlineStore.getState().setConnectionStatus("reconnecting"),
    });
    clientRef.current = client;

    return () => {
      client.close();
      clientRef.current = null;
      useOnlineStore.getState().setConnectionStatus("closed");
    };
  }, [roomId, handleMessage, timeControl]);

  function sendPremove(move: Move | null) {
    const uci = move ? moveToUci(move) : null;
    useOnlineStore.getState().setPremove(uci);
    clientRef.current?.send({ t: "premove", uci });
  }

  function sendResign() {
    clientRef.current?.send({ t: "resign" });
  }

  function sendDrawOffer() {
    clientRef.current?.send({ t: "draw_offer" });
  }

  function sendDrawAccept() {
    clientRef.current?.send({ t: "draw_accept" });
  }

  function sendChat(text: string) {
    clientRef.current?.send({ t: "chat", text });
  }

  return { sendPremove, sendResign, sendDrawOffer, sendDrawAccept, sendChat };
}

// ─── Deserialization ──────────────────────────────────────────────────────────

function deserializeGameState(s: SerializedGameState): GameState {
  const board: (Piece | null)[][] = s.board.map((row) =>
    row.map((p) => (p ? { color: p.color, king: p.king } : null))
  );
  return {
    board: board as Board,
    turn: s.turn,
    halfmoveClock: s.halfmoveClock,
    ply: s.ply,
    history: s.history.map((m) => ({
      from: m.from,
      to: m.to,
      path: m.path,
      captures: m.captures,
      promoted: m.promoted,
    })),
    repetitions: new Map(s.repetitions),
    endgame: s.endgame as GameState["endgame"],
  };
}

function piecesFromBoard(gs: GameState): UIPiece[] {
  const out: UIPiece[] = [];
  let n = 0;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const p = gs.board[row]?.[col];
      if (!p) continue;
      out.push({ id: `p${n++}`, color: p.color, king: p.king, row, col });
    }
  }
  return out;
}
