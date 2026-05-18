# Board Feel + Play Hub Design

## Goal

Make `/play` feel like the start of a real DamaDojo platform, not a local hot-seat demo.

## Product Direction

Landing CTA remains "Играть сейчас". The play surface should prioritize:

1. Играть онлайн
2. Играть с ботом
3. Играть с Ата
4. Играть с другом
5. Локально на этом устройстве as a secondary utility action

Ata is the coach layer, not the center of the whole product. Bots are opponents with their own short in-game lines. Ata appears as the trainer during coach mode and as the post-game reviewer after any game.

## Today's Scope

- Add a compact chess.com-inspired Play Hub panel to `/play`.
- Keep the current local board playable while presenting the real product hierarchy.
- Add immediate mandatory-capture highlighting before the user selects a piece.
- Make move/capture/start sounds louder and more tactile.
- Show timer-ready player strips using `3:00` instead of placeholder dashes.
- Keep premoves out of local hot-seat; premoves belong to bot and online modes.

## Out Of Scope

- Real online matchmaking.
- Full AI/minimax.
- Full post-game review.
- Supabase auth or persistence.

