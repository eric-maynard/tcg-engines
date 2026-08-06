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
  | {
      type: "play-self";
      cardId: string;
      playerId: string;
      paidAdditionalCost?: boolean;
      /**
       * rule-id: ogn-097-298 — Rule 723.1.d (811.1.d.2): battlefield the card
       * was Hidden at when played from facedown; play-effect targets must be
       * chosen from that battlefield only.
       */
      fromHiddenAt?: string;
    }
  | { type: "play-card"; cardId: string; playerId: string; cardType: string }
  | { type: "play-token-unit"; cardId: string; playerId: string }
  | { type: "attack"; cardId: string; battlefieldId: string }
  | { type: "defend"; cardId: string; battlefieldId: string }
  | { type: "conquer"; playerId: string; battlefieldId: string }
  | { type: "hold"; playerId: string; battlefieldId: string }
  | { type: "die"; cardId: string; owner: string }
  // rule-id: unl-133-219 — `owner` = moved unit's controller, `movedBy` = the
  // player whose action/effect moved it ("When you move an enemy unit").
  | { type: "move"; cardId: string; from: string; to: string; owner?: string; movedBy?: string }
  | { type: "take-damage"; cardId: string; amount: number; sourceId?: string }
  | { type: "play-spell"; cardId: string; playerId: string }
  // rule-id: ogn-202-298 — `batchIndex` = position within a single multi-card
  // discard; "When you discard one or more cards" fires only for index 0.
  | { type: "discard"; cardId: string; playerId: string; batchIndex?: number }
  | { type: "draw"; playerId: string }
  | { type: "channel-rune"; playerId: string; runeId: string }
  | { type: "buff"; cardId: string; playerId?: string }
  | { type: "start-of-turn"; playerId: string }
  // rule-id: 516-main-phase-start (ven-067-166 Bottled Constellation)
  | { type: "main-phase"; playerId: string }
  | { type: "end-of-turn"; playerId: string }
  | { type: "become-mighty"; cardId: string; owner: string }
  | { type: "empower"; cardId: string; owner: string }
  | { type: "heal"; cardId: string; amount: number }
  // rule-id: unl-055-219 — `owner` = stunned unit's controller, `stunnedBy` =
  // the player whose effect stunned it, `battlefieldId` set when the stunned
  // unit is at a battlefield ("When you [Stun] an enemy unit at a battlefield").
  | { type: "stun"; cardId: string; owner?: string; stunnedBy?: string; battlefieldId?: string }
  | { type: "grant-keyword"; cardId: string; keyword: string }
  | { type: "win-combat"; cardId: string; battlefieldId: string }
  // rule-id: unl-079-219 — fired whenever a showdown (combat OR non-combat)
  // opens at a battlefield ("When a showdown begins here").
  | { type: "showdown-begin"; battlefieldId: string; playerId: string; isCombat: boolean }
  // rule-id: sfd-142-221 — `sourceType` distinguishes "choose me with a
  // spell" from ability-sourced choices (gear/unit activated or triggered).
  | { type: "choose"; cardId: string; chooserId: string; sourceType?: "spell" | "ability" }
  | { type: "ready"; cardId: string; playerId: string }
  | { type: "hide"; cardId: string; playerId: string }
  | { type: "attach-equipment"; cardId: string; equipmentId: string; playerId: string }
  | { type: "gain-xp"; playerId: string; amount: number }
  // rule-id: ogn-235-298 — "When you recycle one or more cards to your Main
  // Deck": fired once per batch of cards a player recycles to the main deck.
  // `cardIds` (plural) so on:"self" unit triggers match by controller.
  | { type: "recycle"; playerId: string; cardIds: string[] };
