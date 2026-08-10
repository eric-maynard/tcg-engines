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
  // rule 187 / 383.4 (ogn-091-298 × sfd-134-221) — a gear token IS a gear, and
  // putting one onto the board is "playing a gear". Tokens are not cards, so
  // this is its own event rather than a `play-card` (which would wrongly also
  // fire "when you play a card").
  | { type: "play-token-gear"; cardId: string; playerId: string }
  // rule-id: ogn-167-298 — rule 811.1.c.3: playing a card from facedown IS
  // playing a card; cards that key off it specifically ("When you play a card
  // from [Hidden]") need their own event alongside play-self / play-card.
  | {
      type: "play-from-hidden";
      cardId: string;
      playerId: string;
      cardType?: string;
      /**
       * rule 811.1.d.2 — the battlefield the card was facedown at. "(here)" on
       * a from-Hidden play trigger means that battlefield, so its targets are
       * scoped to it exactly like a from-Hidden spell's.
       */
      fromHiddenAt?: string;
    }
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
      /** rule 428.5.b: controller of the spell/ability that held the Kill instruction. */
      killedBySource?: string;
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
      /** rule 466.7.a — it still held an Attacker/Defender designation as it died. */
      wasInCombat?: boolean;
      attachments?: string[];
      cause?: "kill" | "sba" | "temporary" | "cost";
      // rule 423.1 (sfd-203-221) — position among the deaths of ONE
      // simultaneous batch that share this `controller`; "when one or more
      // <friendly|enemy> units die" fires only for index 0 of its own side.
      batchIndex?: number;
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
  // rule 427 — a card was put into Banishment from anywhere (board, trash,
  // hand, deck, or off the chain when a [Flow] play banishes the spell). Fired
  // in addition to `leave-board` when the card left the board.
  // rule 411.4 — `playerId` is the player RESPONSIBLE for the banish ("when YOU
  // banish"); rule 127.1 — `owner` is the card's owner ("a card you own").
  | { type: "banish"; cardId: string; playerId: string; owner?: string; from?: string }
  // rule 446.2 (unl-214-219) — a card RETURNED TO HAND, fired by
  // `effects/return-to-hand.ts` right after the generic `leave-board` event.
  // `owner` is the player whose hand it went to (rule 108/124 — the OWNER, not
  // the controller) and `from` its origin zone, so "when a unit here is
  // returned to a player's hand" can scope itself to this battlefield.
  | {
      type: "return-to-hand";
      cardId: string;
      owner: string;
      controller?: string;
      from?: string;
    }
  // rule-id: unl-133-219 — `owner` = moved unit's controller, `movedBy` = the
  // player whose action/effect moved it ("When you move an enemy unit").
  // rule 144.3 — a Standard Move of several units is ONE game action, so
  // `batchIndex` numbers the units of that single move and a player-templated
  // trigger ("when an opponent moves", `on.batched`) only counts index 0.
  | {
      type: "move";
      cardId: string;
      from: string;
      to: string;
      owner?: string;
      movedBy?: string;
      batchIndex?: number;
    }
  // rule 417 / 437.4 — fired by `operations/deal-damage.ts` once per unit
  // actually DEALT damage: `amount` = marked (after Bonus / Double / Prevent),
  // `original` = as instructed/assigned; `combat` = combat damage (465.2.d).
  | {
      type: "take-damage";
      cardId: string;
      amount: number;
      sourceId?: string;
      sourcePlayer?: string;
      original?: number;
      kind?: string;
      combat?: boolean;
      modifiedBy?: readonly unknown[];
    }
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
  // rule 441.3.a (rule-id: ven-153-166) — the player a Game Effect DIRECTS to
  // empower is the one who "empowers", so `actor` (not the empowered card's
  // `owner`) decides whether "YOU empower something".
  // rule 441.1.c.1 (rule-id: ven-153-166) — empowering an already-Empowered
  // card is still an empower ACTION ("when you empower something else"); it
  // just changes nothing. `becameEmpowered` marks the false→true edge, which is
  // what "When I become [Empowered]" (827.1.c) keys on.
  | {
      type: "empower";
      cardId: string;
      owner: string;
      actor?: string;
      becameEmpowered?: boolean;
    }
  | { type: "heal"; cardId: string; amount: number }
  // rule-id: unl-055-219 — `owner` = stunned unit's controller, `stunnedBy` =
  // the player whose effect stunned it, `battlefieldId` set when the stunned
  // unit is at a battlefield ("When you [Stun] an enemy unit at a battlefield").
  // rule 423.1 (ogn-261-298) — `batchIndex` = position within ONE stun action,
  // so "when you stun one or more enemy units" fires once for the whole action.
  | {
      type: "stun";
      cardId: string;
      owner?: string;
      stunnedBy?: string;
      battlefieldId?: string;
      batchIndex?: number;
    }
  | { type: "grant-keyword"; cardId: string; keyword: string }
  // rule 466.3.a — emitted once per surviving unit of the winning player;
  // `playerId` is that player, so "When you win a combat" (on: "controller")
  // only matches their cards. It is the PLAYER who wins, so player-scoped
  // triggers fire once per combat: `batchIndex` numbers the surviving units of
  // one win and only index 0 counts as "you won a combat".
  | {
      type: "win-combat";
      cardId: string;
      battlefieldId: string;
      playerId?: string;
      batchIndex?: number;
    }
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
      // rule-id: sfd-199-221 — the card HOSTING the chooser, so "chosen … with
      // spells or unit abilities" can tell a unit ability from a gear/legend
      // one (`sourceType` only says spell-vs-ability).
      sourceCardId?: string;
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
  // rule 206.1 (rule-id: ven-192-166) — `energyCost` is the ability's own
  // printed Energy cost, so "an activated ability with Energy cost [7] or more"
  // can be judged without re-finding which ability of the host was used.
  | {
      type: "use-activated-ability";
      cardId: string;
      playerId: string;
      sourceType?: string;
      energyCost?: number;
    };
