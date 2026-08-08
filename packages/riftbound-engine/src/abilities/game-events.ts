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
      /** rule 419 — how the play was performed (`moves/play/play-pipeline.ts PlayVia`). */
      via?: string;
      /** rule 419.1 — the zone the card was played from (hand, trash, banishment, championZone, facedown-…). */
      from?: string;
    }
  | {
      type: "play-card";
      cardId: string;
      playerId: string;
      cardType: string;
      via?: string;
      from?: string;
      /**
       * rule 359.2.c — the zone the card entered (`battlefield-<id>` / `base`),
       * so a battlefield's "When a player plays a unit HERE" can be judged.
       */
      to?: string;
    }
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
  // rule 383.4.f.2.a (sfd-126-221) — however many of your units defend, YOU
  // defend once per combat. `batchIndex` = position among that owner's
  // defenders, so player-scoped ("when you defend") matchers take only index 0
  // while unit-scoped ("when I defend") matchers still see every unit.
  | {
      type: "defend";
      cardId: string;
      battlefieldId: string;
      owner?: string;
      alone?: boolean;
      batchIndex?: number;
    }
  // rule-id: ogn-034-298 — combat conquers carry `afterAttack` and the excess
  // damage the attacker assigned to enemy units (rule 626.1.d.2).
  | {
      type: "conquer";
      playerId: string;
      battlefieldId: string;
      afterAttack?: boolean;
      excessDamage?: number;
      /**
       * rule 188 — the player who controlled the battlefield immediately
       * before this conquer, or `null` when it was Uncontrolled. Read by the
       * `battlefield-was-uncontrolled` trigger restriction (sfd-116-221).
       */
      previousController?: string | null;
    }
  | { type: "hold"; playerId: string; battlefieldId: string }
  // rule 468 / 471.2 — a player Scored (Hold or Conquer) at a battlefield;
  // fired alongside the `hold` / `conquer` event ("When an opponent scores").
  | { type: "score"; playerId: string; battlefieldId: string; method: "hold" | "conquer" }
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
      /** rule 708/710 + 808.1.d.3: it had 5+ effective Might as it died ("if I was [Mighty]"). */
      wasMighty?: boolean;
      // rule 428.1.a.1.b / 740.2.a — last-known information stamped by
      // `operations/leave-board.ts`: who controlled it, whether no other
      // friendly unit shared its location, what was attached, and which
      // kill path produced the death.
      controller?: string;
      wasAlone?: boolean;
      attachments?: string[];
      cause?: "kill" | "sba" | "temporary" | "cost";
    }
  // rule 124.1 — a permanent left the board without dying (banish, bounce,
  // recycle). Emitted by `operations/leave-board.ts` with its LKI.
  | {
      type: "leave-board";
      cardId: string;
      owner: string;
      controller?: string;
      from?: string;
      to?: string;
      cause: "banish" | "recycle" | "bounce" | "replaced";
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
  // rule 702.2.b — spending a buff (as a cost or an instruction) is its own
  // event, fired once PER buff removed; `playerId` is the player who spent it
  // ("When YOU spend a buff"), `cardId` the card whose cost/effect spent it.
  | { type: "spend-buff"; cardId: string; playerId: string; spentFrom?: string }
  | { type: "start-of-turn"; playerId: string }
  // rule-id: 516-main-phase-start (ven-067-166 Bottled Constellation)
  | { type: "main-phase"; playerId: string }
  | { type: "end-of-turn"; playerId: string }
  | { type: "become-mighty"; cardId: string; owner: string }
  // rule-id: ven-177-166 — a Might increase, carrying both endpoints so
  // "when my Might becomes N or more" can be matched as a threshold crossing.
  | { type: "might-becomes"; cardId: string; owner: string; might: number; previousMight: number }
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
  // rule 466.7.b — a combat ends as the last step of the Resolution Step.
  // Fired once per unit that WAS in that combat and is still on the board,
  // including attackers recalled home by rule 466.1.a.2 (466.7.a).
  | { type: "combat-end"; cardId: string; battlefieldId: string; playerId?: string }
  // rule-id: unl-079-219 — fired whenever a showdown (combat OR non-combat)
  // opens at a battlefield ("When a showdown begins here").
  | { type: "showdown-begin"; battlefieldId: string; playerId: string; isCombat: boolean }
  // rule 464.2.b (rule-id: ven-166-166) — "When combat starts here": fired only
  // for a COMBAT showdown, after roles are assigned and before the attacker's
  // first Focus action. `playerId` is the attacker (464.2.c.1).
  | {
      type: "combat-start";
      battlefieldId: string;
      playerId: string;
      attacker: string;
      defender: string;
    }
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
      // rule-id: ogn-292-298 — where the chosen card stands, for "…here"
      // triggers. Stamped centrally in `fireTriggers`.
      battlefieldId?: string;
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
  | { type: "reveal"; cardId: string; playerId: string; from?: string }
  // rule-id: sfd-075-221 — rule 206.1: "when you USE an activated ability"
  // happens as the ability is activated, so this is fired once per activation
  // AFTER the ability reaches the chain — the trigger then sits above it and
  // resolves first. `cardId` is the HOST whose ability was used, `sourceType`
  // its card type (Equipment normalises to "gear", rule 151: Equipment is a
  // kind of gear and [Equip] is an activated ability).
  | { type: "use-activated-ability"; cardId: string; playerId: string; sourceType?: string };
