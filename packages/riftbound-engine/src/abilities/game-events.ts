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
  // rule-id: ogn-167-298 — rule 811.1.c.3: playing a card from facedown IS
  // playing a card; cards that key off it specifically ("When you play a card
  // from [Hidden]") need their own event alongside play-self / play-card.
  | { type: "play-from-hidden"; cardId: string; playerId: string; cardType?: string }
  // rule-id: ogn-060-298 — `owner` = the attacking/defending unit's controller
  // so "When a friendly unit attacks/defends" subject matchers can resolve.
  // `alone` (rule 740.2.a) = no OTHER unit its controller controls is at that
  // battlefield, so "attacks or defends alone" triggers can match.
  | { type: "attack"; cardId: string; battlefieldId: string; owner?: string; alone?: boolean }
  | { type: "defend"; cardId: string; battlefieldId: string; owner?: string; alone?: boolean }
  // rule-id: ogn-034-298 — combat conquers carry `afterAttack` and the excess
  // damage the attacker assigned to enemy units (rule 626.1.d.2).
  | {
      type: "conquer";
      playerId: string;
      battlefieldId: string;
      afterAttack?: boolean;
      excessDamage?: number;
    }
  | { type: "hold"; playerId: string; battlefieldId: string }
  // rule 428.5: `killedBy` = the player responsible for the kill (kill
  // instruction's controller, the dealer of the lethal spell/ability damage,
  // or the opposing combatant's controller); `killSource` = what did it;
  // `wasStunned` = the unit was stunned as it died ("kill a stunned enemy unit").
  | {
      type: "die";
      cardId: string;
      owner: string;
      /** rule 428.1.a.1.b: the zone the unit occupied as it died (last known information). */
      diedAt?: string;
      killedBy?: string;
      killSource?: "spell" | "ability" | "combat";
      wasStunned?: boolean;
      /** rule 702: the unit carried a buff as it died ("a buffed friendly unit dies"). */
      wasBuffed?: boolean;
    }
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
  // rule 466.3.a — emitted once per surviving unit of the winning player;
  // `playerId` is that player, so "When you win a combat" (on: "controller")
  // only matches their cards.
  | { type: "win-combat"; cardId: string; battlefieldId: string; playerId?: string }
  // rule-id: unl-079-219 — fired whenever a showdown (combat OR non-combat)
  // opens at a battlefield ("When a showdown begins here").
  | { type: "showdown-begin"; battlefieldId: string; playerId: string; isCombat: boolean }
  // rule-id: sfd-142-221 — `sourceType` distinguishes "choose me with a
  // spell" from ability-sourced choices (gear/unit activated or triggered).
  // rule-id: sfd-195-221 — `owner` is the CHOSEN card's current controller, so
  // "when you choose a friendly unit" descriptors can judge the subject. It is
  // stamped centrally in `fireTriggers`; emit sites need only supply `cardId`.
  | {
      type: "choose";
      cardId: string;
      chooserId: string;
      owner?: string;
      sourceType?: "spell" | "ability";
    }
  | { type: "ready"; cardId: string; playerId: string }
  | { type: "hide"; cardId: string; playerId: string }
  | { type: "attach-equipment"; cardId: string; equipmentId: string; playerId: string }
  | { type: "gain-xp"; playerId: string; amount: number }
  // rule-id: ogn-235-298 — "When you recycle one or more cards to your Main
  // Deck": fired once per batch of cards a player recycles to the main deck.
  // `cardIds` (plural) so on:"self" unit triggers match by controller.
  | { type: "recycle"; playerId: string; cardIds: string[] }
  // rule 369.1 / 370.1 (ogn-194-298 Nocturne) — "as you look at or reveal me":
  // a look/reveal that shows a card to its owner is an observable moment, fired
  // once per shown card. Milling straight to the trash (Burn, rule 440.1) never
  // looks at or reveals, so it must NOT fire this.
  | { type: "reveal"; cardId: string; playerId: string; from?: string };
