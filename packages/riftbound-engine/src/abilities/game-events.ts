/**
 * Game Events
 *
 * Events that can trigger abilities during gameplay.
 * Maps to TriggerEvent types from @tcg/riftbound-types.
 */

/**
 * All game events that can trigger abilities.
 */
export type GameEvent =
  | { type: "play-self"; cardId: string; playerId: string }
  | { type: "play-card"; cardId: string; playerId: string; cardType: string }
  | { type: "attack"; cardId: string; battlefieldId: string }
  | { type: "defend"; cardId: string; battlefieldId: string }
  | { type: "conquer"; playerId: string; battlefieldId: string }
  | { type: "hold"; playerId: string; battlefieldId: string }
  | { type: "die"; cardId: string; owner: string }
  | { type: "move"; cardId: string; from: string; to: string }
  | { type: "take-damage"; cardId: string; amount: number; sourceId?: string }
  | { type: "play-spell"; cardId: string; playerId: string }
  | { type: "discard"; cardId: string; playerId: string }
  | { type: "draw"; playerId: string }
  | { type: "channel-rune"; playerId: string; runeId: string }
  | { type: "buff"; cardId: string }
  | { type: "start-of-turn"; playerId: string }
  | { type: "end-of-turn"; playerId: string }
  | { type: "become-mighty"; cardId: string; owner: string }
  | { type: "heal"; cardId: string; amount: number }
  | { type: "stun"; cardId: string }
  | { type: "grant-keyword"; cardId: string; keyword: string }
  | { type: "win-combat"; cardId: string; battlefieldId: string }
  | { type: "choose"; cardId: string; chooserId: string }
  | { type: "hide"; cardId: string; playerId: string }
  | { type: "gain-xp"; playerId: string; amount: number };
