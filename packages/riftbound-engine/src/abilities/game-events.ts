/**
 * Game Events
 *
 * Events that can trigger abilities during gameplay.
 * Maps to TriggerEvent types from @tcg/riftbound-types.
 *
 * Two flavours live here:
 *  - **Card-facing trigger events** — the names the card parser maps onto
 *    `trigger.event` (`play-self`, `attack`, `die`, …). These have existed
 *    since before the event bus.
 *  - **Engine-bus events** — emitted through `dispatchEvent` so the event
 *    log (and future listeners) can see state changes that no card text
 *    triggers off *today* (`counterChanged`, `controlChanged`, `phaseBegan`,
 *    `combatStaged`/`combatOpened`/`combatResolved`, `chainItemAdded`/
 *    `chainItemResolved`, `xpGained`, `damageDealt`). These are part of the
 *    event-bus convergence: every state-changing action funnels through one
 *    chokepoint, even if nothing currently subscribes.
 */

/**
 * All game events that can trigger abilities or that flow through the
 * engine event bus.
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
  | { type: "gain-xp"; playerId: string; amount: number }
  // --- engine-bus events (emitted through dispatchEvent; no card text
  // --- subscribes to these yet, but the event log and future listeners do) ---
  /** A counter / damage / buff value on a card changed (rule 540.x SBA input). */
  | {
      type: "counterChanged";
      cardId: string;
      counter: string;
      delta: number;
      cause?: string;
    }
  /** Damage was dealt to a card (distinct from the `take-damage` trigger event). */
  | { type: "damageDealt"; cardId: string; amount: number; sourceId?: string }
  /** XP was gained by a player (first-class form of the `gain-xp` trigger event). */
  | { type: "xpGained"; playerId: string; amount: number }
  /** Control of a battlefield changed (Establish-Control / Conquer / lose-control-when-empty). */
  | {
      type: "controlChanged";
      battlefieldId: string;
      controller: string | null;
      previousController: string | null;
      cause?: string;
    }
  /**
   * Control of a CARD changed (rule 309.x — take-control effects like
   * Hostile Takeover, until-leaves reverts). Distinct from `controlChanged`
   * (battlefield) so listeners can subscribe to one without the other.
   */
  | {
      type: "cardControlChanged";
      cardId: string;
      controller: string;
      previousController: string;
      cause?: string;
    }
  /** A flow phase began. */
  | { type: "phaseBegan"; phase: string; playerId?: string }
  /** A flow phase ended. */
  | { type: "phaseEnded"; phase: string; playerId?: string }
  /** A combat was staged at a battlefield (battlefield became Contested). */
  | { type: "combatStaged"; battlefieldId: string; contestedBy: string }
  /** A staged combat was opened (a Combat Showdown began at the battlefield). */
  | { type: "combatOpened"; battlefieldId: string; attackingPlayer?: string }
  /** A combat at a battlefield was resolved (damage + resolution steps done). */
  | { type: "combatResolved"; battlefieldId: string; winner?: string | null }
  /** A new item was added to the chain (spell / activated ability / triggered ability). */
  | {
      type: "chainItemAdded";
      chainItemId: string;
      cardId: string;
      controller: string;
      triggered: boolean;
    }
  /** A chain item resolved (after all players passed priority). */
  | {
      type: "chainItemResolved";
      chainItemId: string;
      cardId: string;
      controller: string;
      countered: boolean;
    };
