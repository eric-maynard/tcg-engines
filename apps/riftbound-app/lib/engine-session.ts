/**
 * EngineSession — the thinnest possible adapter between the Riftbound rule
 * engine and a UI/client.
 *
 * The engine speaks in `RuleEngine.executeMove(...)` + `getState()`, and the
 * internal-state (zones, cards) is reachable only via a private field. A UI
 * needs three things:
 *   1. a snapshot it can render (a *plain* JSON-safe view, no `Map`s, no
 *      `Date`s, no class instances),
 *   2. a list of moves the active player can legally take right now,
 *   3. one entry point to dispatch a move and get the next snapshot.
 *
 * This file is intentionally small. Everything game-logic lives in
 * `@tcg/riftbound`. The session does NOT enforce rules, just exposes them.
 */

import { type PlayerId, RuleEngine } from "@tcg/core";
import {
  PHASE_LABELS,
  TURN_PHASE_STRIP,
  getGlobalCardRegistry,
  riftboundDefinition,
} from "@tcg/riftbound";
import type {
  RiftboundCardMeta,
  RiftboundGameState,
  RiftboundMoves,
} from "@tcg/riftbound";
// Lazy-imported at runtime to avoid forcing the whole card pool into test
// Environments that never seed real decks. See `lookupCardDefinition` below.
type RiftboundCardsModule = typeof import("@tcg/riftbound-cards");
let _riftboundCardsModule: RiftboundCardsModule | null | undefined;
function getRiftboundCardsModule(): RiftboundCardsModule | null {
  if (_riftboundCardsModule !== undefined) {return _riftboundCardsModule;}
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _riftboundCardsModule = require("@tcg/riftbound-cards") as RiftboundCardsModule;
  } catch {
    _riftboundCardsModule = null;
  }
  return _riftboundCardsModule;
}

/**
 * Phase B batch 26 JJJ: defId -> imageUrl lookup. The card registry (built
 * from `cards/<set>/*.ts` modules) strips imageUrl, but the per-set raw
 * JSON in `data/sets/*.json` has it. We lazy-load these JSONs once on first
 * access so synthetic-deck tests (which never need card art) don't pay the
 * import cost.
 */
let _imageUrlByDefId: Map<string, string> | null | undefined;
function getImageUrlByDefId(): Map<string, string> | null {
  if (_imageUrlByDefId !== undefined) {return _imageUrlByDefId;}
  try {
    // The @tcg/riftbound-cards package's `exports` field doesn't expose the
    // Per-set JSON, so we read it via relative import from the monorepo
    // Source tree. Each JSON is shaped `{ set: {...}, cards: [{ id, imageUrl,
    // ... }] }`.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ogn = require("../../../packages/riftbound-cards/src/data/sets/ogn.json");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ogs = require("../../../packages/riftbound-cards/src/data/sets/ogs.json");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sfd = require("../../../packages/riftbound-cards/src/data/sets/sfd.json");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const unl = require("../../../packages/riftbound-cards/src/data/sets/unl.json");
    const all = [ogn, ogs, sfd, unl] as {
      cards?: readonly { id?: string; imageUrl?: string }[];
    }[];
    const map = new Map<string, string>();
    for (const setMod of all) {
      const cards = setMod?.cards ?? [];
      for (const c of cards) {
        if (c?.id && typeof c.imageUrl === "string" && c.imageUrl.length > 0) {
          map.set(c.id, c.imageUrl);
        }
      }
    }
    _imageUrlByDefId = map;
  } catch {
    _imageUrlByDefId = null;
  }
  return _imageUrlByDefId;
}

/**
 * Look up the image URL for a given card-pool id (e.g. `ogn-001-298`),
 * with the same instance-id-suffix fallback `getCardDefinition` uses for
 * real-deck instance IDs like `player-1-main-3-ogn-001-298`.
 */
export function lookupImageUrl(definitionId: string): string | undefined {
  const map = getImageUrlByDefId();
  if (!map) {return undefined;}
  const direct = map.get(definitionId);
  if (direct) {return direct;}
  const extracted = extractDefIdFromInstanceId(definitionId);
  return extracted ? map.get(extracted) : undefined;
}

// Public re-exports so an app importing engine-session doesn't have to also
// Reach into @tcg/riftbound to type-check its callers.
export type RiftboundEngine = RuleEngine<
  RiftboundGameState,
  RiftboundMoves,
  unknown,
  RiftboundCardMeta
>;

/**
 * Card-definition metadata copied into HandCard / BattlefieldUnit views so a
 * UI can render real card info (name, cost, might, rules text, ability
 * summaries) without a separate fetch. All fields optional — synthetic test
 * decks have no real-world card definitions, so the view degrades to bare
 * id / definitionId. Sourced from the engine's global card registry plus the
 * `@tcg/riftbound-cards` raw definition (for `rulesText`, which the engine
 * registry doesn't store).
 */
export interface CardDefinitionView {
  readonly name?: string;
  readonly cardType?: string;
  readonly might?: number;
  readonly energyCost?: number;
  readonly powerCost?: readonly string[];
  readonly rulesText?: string;
  /**
   * One-line summaries of each ability, max 5 entries. Formatted as
   *   "[Trigger: <event>] <effect-summary>"
   *   "[Activated] <cost> → <effect-summary>"
   *   "[Static] <effect-summary>"
   *   "[Keyword] <name>[ N]"
   *   "[Spell] <effect-summary>"
   *   "[Replacement] <replaces> → <replacement-summary>"
   */
  readonly abilities?: readonly string[];
  /**
   * Phase B batch 26 JJJ: official card-art URL (Riot CMS gallery, e.g.
   * `https://cmsassets.rgpub.io/.../<hash>.png`). Sourced from the raw set
   * JSON in `@tcg/riftbound-cards/data/sets/*.json` (the registry strips it,
   * but Eric wants the SPA to render real card art like RiftAtlas does).
   * `undefined` when no image is known — UI falls back to text chip.
   */
  readonly imageUrl?: string;
}

/** Simplified, JSON-safe game view suitable for rendering. */
export interface GameView {
  readonly gameId: string;
  readonly status: RiftboundGameState["status"];
  readonly winner: string | null;
  readonly victoryScore: number;
  readonly turn: {
    readonly number: number;
    readonly activePlayer: string;
    readonly phase: string;
    readonly phaseLabel: string;
  };
  readonly phaseStrip: readonly { id: string; label: string }[];
  readonly players: readonly {
    readonly id: string;
    readonly victoryPoints: number;
    readonly xp: number;
    readonly handSize: number;
    readonly deckSize: number;
    readonly runeDeckSize: number;
    readonly trashSize: number;
    readonly energy: number;
    readonly power: Record<string, number>;
    /**
     * Units currently in this player's `base` zone (Riftbound's home zone for
     * units played but not yet deployed to a battlefield). Enriched with the
     * same card-definition fields as `battlefields[].units`. Phase B batch 24
     * AAA — without this the SPA's `BaseZone` component always renders
     * "(empty)" because the engine's "base" zone is global (single zoneId
     * `"base"`) and cards there are tagged by `card.owner`, so the SPA can't
     * derive per-player base contents from `battlefields[]` alone.
     */
    readonly baseUnits: readonly BattlefieldUnitView[];
  }[];
  readonly battlefields: readonly {
    readonly id: string;
    readonly controller: string | null;
    readonly contested: boolean;
    readonly units: readonly BattlefieldUnitView[];
    /** Phase B batch 26 JJJ: BF card's display name (e.g. "The Grand Plaza"). */
    readonly name?: string;
    /** Phase B batch 26 JJJ: BF card's official art URL, for tile background. */
    readonly imageUrl?: string;
    /**
     * Verbatim `rulesText` from the BF card definition (e.g. "Action: Pay
     * 2 energy. Each player draws a card."). Sourced from the raw
     * `@tcg/riftbound-cards` registry via `getCardDefinition`. `undefined`
     * when the BF has no registered card definition (synthetic test decks).
     */
    readonly rulesText?: string;
  }[];
  /**
   * Iter-N+1: gears and equipment currently in play (base zone or attached
   * to a battlefield unit). Surfaced as a flat list so the TargetPicker can
   * enumerate gear targets for spells like `unl-070-219` Turn to Dust
   * ("Give a gear [Temporary].") whose `target.type === "gear"`.
   *
   * Each entry carries the gear's instance id, display name, controller, and
   * — when the gear is on a battlefield rather than in base — the
   * battlefield id it sits on. `attachedToUnitId` is reserved for a future
   * engine pass that wires unit↔gear attachment; today gears live in the
   * global `base` zone or on a battlefield zone directly.
   */
  readonly gearsInPlay: readonly {
    readonly id: string;
    readonly definitionId: string;
    readonly controller: string;
    readonly name?: string;
    readonly imageUrl?: string;
    /** `"base"` or a `player-N-bf-K` id when on a battlefield zone. */
    readonly location: string;
    /** Future: instance id of the unit this gear is attached to, if any. */
    readonly attachedToUnitId?: string;
  }[];
  /**
   * Iter-Q: cards currently in any player's trash zone, surfaced as a flat
   * list (owner-tagged). Used by the TargetPicker for spells whose target is
   * `{type: "card"/"unit"/"gear"/..., location: "trash"}` (e.g. Guerilla
   * Warfare — "Return up to two cards with [Hidden] from your trash to your
   * hand."). Each entry carries enough card-definition info so the picker can
   * render real card names rather than instance ids.
   */
  readonly cardsInTrash: readonly {
    readonly id: string;
    readonly definitionId: string;
    readonly owner: string;
    readonly cardType?: string;
    readonly name?: string;
    readonly imageUrl?: string;
  }[];
  /**
   * Iter-Q: runes currently in any player's runePool, surfaced as a flat
   * list. Used by the TargetPicker for spells whose target is
   * `{type: "rune"}` (e.g. Sona, Harmonious's triggered ability — "ready up
   * to 4 friendly runes"). Each entry carries owner + state so the picker
   * can label friendly vs. enemy and exhausted vs. ready.
   */
  readonly runesInPool: readonly {
    readonly id: string;
    readonly definitionId: string;
    readonly owner: string;
    readonly name?: string;
    readonly imageUrl?: string;
    /**
     * Iter-RunePoolUI: rune domain (one of body / mind / chaos / calm / fury /
     * order). Sourced from the engine card registry (or raw card module
     * fallback). Drives the RunePool chip's domain-colored background.
     * Omitted when not known (synthetic decks may register runes without
     * a domain field).
     */
    readonly domain?: string;
    /**
     * Iter-RunePoolUI: live exhausted/tapped state, sourced from the engine's
     * `internal.cardMetas[runeId].__flags.exhausted` (where the counter
     * system writes — see server.ts setFlag). Falls back to the seed
     * `meta.exhausted`. Drives the 90° rotation + dim styling on the chip.
     */
    readonly exhausted?: boolean;
  }[];
  /**
   * Combat / showdown view. Present when the engine's `state.interaction`
   * has an active showdown (`showdownStack` non-empty). Phase B batch 25 EEE:
   * without this the SPA can't render combat phase, attackers/defenders, or
   * which battlefield is in contest. Synthetic-deck / no-combat sessions
   * leave this `undefined`.
   */
  readonly combat?: CombatView;
  /**
   * Pending-choice view (Sabotage / Mindsplitter / Ashe Focused). When set,
   * the engine paused play after a `reveal-hand` effect — the prompter must
   * pick a card from `revealed` (filtered by `filter.excludeCardTypes`) and
   * resolve via `resolvePendingChoice`. The SPA uses this to reveal the
   * revealer's hand face-up.
   */
  readonly pendingChoice?:
    | {
        readonly type: "reveal-and-pick";
        readonly prompter: string;
        readonly revealer: string;
        readonly revealed: readonly string[];
        readonly onPicked: "recycle" | "banish" | "discard";
        readonly excludedCardTypes?: readonly string[];
      }
    | {
        // Stacked Deck pattern: prompter looks at top N of their own deck
        // And picks 1. Picked → destination (default `to-hand`); rest →
        // `onUnpicked` (default `recycle` — bottom of deck).
        readonly type: "look-and-pick";
        readonly prompter: string;
        readonly revealer: string;
        readonly revealed: readonly string[];
        readonly onPicked: "to-hand" | "to-trash" | "to-play" | "banish" | "recycle";
        readonly onUnpicked: "recycle" | "to-top" | "trash";
        /**
         * Per-revealed-card enrichment (name + image URL + cardType) so
         * the SPA can render the LookPicker face-up without doing its
         * own registry lookups. Same shape as `cardsInTrash`/HandCard.
         */
        readonly revealedCards: readonly {
          readonly id: string;
          readonly definitionId: string;
          readonly name?: string;
          readonly imageUrl?: string;
          readonly cardType?: string;
        }[];
      }
    | {
        // Modal "Choose one — A. B." spell (Flurry of Feathers et al.).
        // Caster picks an option index; the engine then fires that
        // Branch's effect through `resolvePendingChoice`.
        readonly type: "pick-mode";
        readonly prompter: string;
        readonly sourceCardId: string;
        readonly sourceCardName?: string;
        readonly options: readonly {
          readonly index: number;
          readonly label: string;
        }[];
      };
  /**
   * Chain (spell stack) view. Present when `state.interaction.chain` exists
   * and has any items. LIFO — items[items.length-1] resolves first.
   */
  readonly chain?: ChainView;
}

/**
 * A unit currently participating in combat (attacker or defender), with the
 * minimum info needed to render a chip: instance id, definition id,
 * controller, and the resolved card name (via card-registry lookup).
 */
export interface CombatUnitView {
  readonly id: string;
  readonly definitionId: string;
  readonly controller: string;
  readonly name?: string;
  readonly might?: number;
}

/**
 * Combat/showdown snapshot. Mirrors the engine's active showdown
 * (`state.interaction.showdownStack[top]`) with attackers/defenders
 * partitioned by `cardMetas[cardId].combatRole`.
 */
export interface CombatView {
  /** Engine turn phase at snapshot time (e.g. "main"). Used for breadcrumb. */
  readonly phase: string;
  /** Battlefield id where the showdown is happening. */
  readonly battlefieldId: string;
  /** Player who currently has focus (may play action/reaction). */
  readonly focusOwner: string;
  /** Attacking player id (combat showdowns only — may equal "" if unknown). */
  readonly attackingPlayer?: string;
  /** Defending player id (combat showdowns only). */
  readonly defendingPlayer?: string;
  /** Whether this showdown was opened as part of combat (vs. a non-combat showdown). */
  readonly isCombat: boolean;
  /** Units with combatRole === "attacker" on the showdown battlefield. */
  readonly attackers: readonly CombatUnitView[];
  /** Units with combatRole === "defender" on the showdown battlefield. */
  readonly defenders: readonly CombatUnitView[];
  /**
   * Iter-15 Gap 1: explicit attacker→defender pair assignments. The Riftbound
   * engine currently tracks only per-unit `cardMetas[id].combatRole` and a
   * top-of-stack ShowdownState (battlefield + focus + attacking/defending
   * player) — there is NO per-pair mapping in either source. So `pairs` stays
   * `undefined` here and the SPA falls back to cartesian-product matchup
   * lines. The field is reserved on the view contract so a future engine
   * patch (e.g. adding `combatTarget` to RiftboundCardMeta or a
   * `damageAssignments` field on ShowdownState) can be surfaced with a one-
   * line view-builder change.
   */
  readonly pairs?: readonly {
    readonly attackerId: string;
    readonly defenderId: string;
  }[];
}

/** One item on the chain, summarised for UI rendering. */
export interface ChainItemView {
  readonly id: string;
  readonly source: {
    readonly playerId: string;
    readonly cardId: string;
    readonly cardName?: string;
  };
  /** One-line summary — "[Spell] burn 3" / "[Trigger: dies] draw 1". */
  readonly summary: string;
  readonly countered: boolean;
  readonly type: "spell" | "permanent" | "ability";
}

/**
 * Chain view. `items` is in LIFO order — `items[items.length-1]` is the top
 * of the stack and resolves first.
 */
export interface ChainView {
  readonly items: readonly ChainItemView[];
  /** Player who currently has priority on the chain (may add or pass). */
  readonly focusOwner: string;
}

/** A unit currently on a battlefield, enriched with card-definition fields. */
export interface BattlefieldUnitView extends CardDefinitionView {
  readonly id: string;
  readonly definitionId: string;
  readonly controller: string;
  /**
   * Slice 5 (UX affordances): the card's *base* (printed) might from its
   * Definition. `might` (inherited from CardDefinitionView) is the EFFECTIVE
   * Might after buffs, equipment, static abilities, and runtime modifiers.
   * The SPA renders a small `+N` / `-N` badge whenever `might !== baseMight`
   * So the human can see at a glance that a unit is buffed/debuffed.
   *
   * `undefined` when the card has no registered definition (synthetic test
   * Decks), in which case the badge is suppressed.
   */
  readonly baseMight?: number;
  /**
   * Defect-1 fix: TCG visual convention — an exhausted ("tapped") unit is
   * rotated 90° in the SPA. The engine already tracks this on
   * `internalState.cardMetas[unitId].exhausted`; we surface it on the view so
   * `BattlefieldList` / `BaseZone` can apply `.bf-mini-chip-exhausted`
   * without having to reach into engine internals.
   * Defaults to `false` when the meta is missing.
   */
  readonly exhausted?: boolean;
  /**
   * Admin feedback (2026-05-14, item A2): damage counters accumulated on the
   * unit (carries through showdowns until end-of-phase per Riftbound rules).
   * Sourced from `internalState.cardMetas[id].damage`. Omitted when zero so
   * the SPA can chip-check on truthy.
   */
  readonly damage?: number;
  /**
   * Admin feedback (2026-05-14, item A2): non-damage counter tally
   * (+1/+1 counters, buff counters, etc.). Today the engine tracks a binary
   * `buffed` flag and a `mightModifier` number; we surface the truthy
   * `buffed` flag as a "1" count plus any positive `mightModifier` so the
   * SPA can render a green +N chip when buffs are active. Omitted when zero.
   */
  readonly counters?: number;
}

/**
 * A card in some player's hand, enriched with the same card-definition fields
 * as battlefield units. `legalLocations` is filled in by callers (server.ts
 * augments hand cards with the set of `playUnit` location params currently
 * legal for each card) and is intentionally not populated here — the engine
 * session has no notion of "current player's pending move targets".
 */
export interface HandCardView extends CardDefinitionView {
  readonly id: string;
  readonly definitionId: string;
  /**
   * Phase B batch 25 DDD: true when this card is a SPELL whose first effect
   * targets a non-self game object (e.g. `target: {type: "unit", controller:
   * "enemy"}`). The SPA uses this to decide whether to open the TargetPicker
   * instead of POSTing playFromHand immediately. Spells with no target
   * descriptor, or a `{type: "self"}` target, do NOT require a picker
   * (the engine resolves the target implicitly).
   */
  readonly requiresTarget?: boolean;
  /**
   * Iter-N: surface the spell's first-effect target descriptor so the SPA
   * can pick the RIGHT TargetPicker variant. In particular, player-target
   * spells (e.g. Sabotage's `target: {type:"player", which:"opponent"}`)
   * need a You/Opponent picker, not a unit picker. Only `type` and `which`
   * are surfaced — the rest of the descriptor is engine-internal.
   */
  readonly targetDescriptor?: {
    readonly type: string;
    readonly which?: string;
    /**
     * Iter-Q: spell target's `location` axis (e.g. `"trash"`, `"hand"`,
     * `"deck"`, `"battlefield"`). Surfaced so the SPA can choose between the
     * card-in-trash / card-in-hand / card-in-deck TargetPicker variants for
     * spells whose `target.type` is generic-card but whose location field
     * narrows the candidate set.
     */
    readonly location?: string;
    /**
     * Iter-Q: controller axis (`"friendly"` / `"enemy"` / `"any"`). The SPA
     * uses this to filter trash/hand/rune lists when the spell only legally
     * targets one side (e.g. Sabotage targets `controller: "enemy"`).
     */
    readonly controller?: string;
  };
}

/** Internal-state shape the engine exposes via its private `internalState`. */
interface InternalSnapshot {
  zones: Record<string, { cardIds: string[]; config: unknown }>;
  cards: Record<
    string,
    {
      definitionId: string;
      owner: string;
      controller: string;
      zone: string;
      position?: number;
    }
  >;
  cardMetas: Record<string, RiftboundCardMeta>;
}

/**
 * Reach into the rule engine's private `internalState` to read zone contents.
 * This is the same pattern `server.ts` already uses for the live HTTP UI.
 * Kept in one place so when core eventually exposes a getter, we change it
 * here.
 */
export function getInternalSnapshot(engine: RiftboundEngine): InternalSnapshot {
  return (engine as unknown as { internalState: InternalSnapshot })
    .internalState;
}

/** Move record returned by `legalMoves`. */
export interface LegalMove {
  readonly moveId: string;
  readonly params: Record<string, unknown>;
  readonly playerId: string;
}

/** One step in the session trail. */
export interface SessionStep {
  readonly seq: number;
  readonly playerId: string;
  readonly moveId: string;
  readonly params: Record<string, unknown>;
  readonly success: boolean;
  readonly error?: string;
  readonly viewAfter: GameView;
  /**
   * Slice 4 (undo/rewind): when set true, indicates this step was undone
   * by a later `undoLastMove` call. The SPA renders it as a strike-through
   * line in the MoveLog so the player can see what was rewound. Original
   * step records are preserved (not deleted) so the trail seq is
   * monotonic across undos.
   */
  readonly undone?: boolean;
}

/**
 * Slice 4 (undo/rewind): a serialized engine state snapshot. We treat it as
 * an opaque blob — the session pushes one onto `moveHistory` before every
 * `applyMove` and `restore`s it on undo. Defined as a typed record (rather
 * than `unknown`) so adjacent helpers can build mock snapshots in tests
 * without `as any` casts.
 */
export interface SerializedState {
  readonly currentState: RiftboundGameState;
  readonly internalState: InternalSnapshot;
  readonly seq: number;
  /**
   * Number of items resolved off the chain since session start. Recorded
   * here so `canUndo` can detect "a chain item resolved after my move",
   * which is one of the gates that blocks undo.
   */
  readonly chainResolveCount: number;
}

/** Slice 4: one entry in the per-session undo stack. */
export interface MoveHistoryEntry {
  readonly moveId: string;
  readonly params: Record<string, unknown>;
  readonly playerId: string;
  readonly snapshotBefore: SerializedState;
  /** Display label for the SPA's "Undo (last: X)" affordance. */
  readonly label: string;
  /** Sequence number of the corresponding step in `trail`. */
  readonly stepSeq: number;
}

export interface EngineSessionOptions {
  readonly playerIds?: readonly [string, string];
  readonly playerNames?: readonly [string, string];
  readonly seed?: string;
  /**
   * Hand size after `drawInitialHand`. The engine deals 4 by default; tests may
   * want to skip the initial-hand draw, in which case pass `skipInitialHand`.
   */
  readonly handSize?: number;
  readonly skipInitialHand?: boolean;
  /** Deck size. Default 40 (legal-minimum for synthetic test decks). */
  readonly deckSize?: number;
  /** Rune deck size. Default 12 (Riftbound min). */
  readonly runeDeckSize?: number;
  /** Number of battlefields to place at start. Default 2. */
  readonly battlefieldCount?: number;
  /**
   * If true, after deck init the session calls `transitionToPlay` so the game
   * enters `playing` status with the active player ready to move. If false,
   * the caller drives `rollForFirst` / `chooseFirst` / mulligan themselves.
   * Default: true (we want a turn-driving demo, not a setup demo).
   */
  readonly autoStartPlaying?: boolean;
  /**
   * If true, seed the session with real card definitions / deck instances
   * via `getPrebuiltDecks()` instead of synthetic placeholder IDs. Enables
   * bots to play actual units / spells via `standardMove`. Defaults to
   * false to preserve the existing synthetic-deck contract used by unit
   * tests + the bot-vs-bot smoke test's deterministic baseline.
   */
  readonly realDecks?: boolean;
}

/* --- card-definition lookup ------------------------------------------------ */

/** Engine-registry lookup payload type (CardDefinitionLookup not exported). */
type EngineCardLookup = NonNullable<
  ReturnType<ReturnType<typeof getGlobalCardRegistry>["get"]>
>;

/**
 * Look up card-definition data for a given card instance id. Tries the engine's
 * per-instance registry first (populated by `registerDeckCardsWithEngine`); if
 * that's empty (e.g. synthetic test decks), falls back to interpreting
 * `definitionId` as a card-pool id and looking it up in `@tcg/riftbound-cards`'s
 * raw registry — that's where `rulesText` lives.
 *
 * Returns the merged subset of fields the SPA needs. Never throws; missing
 * card definitions just return an empty object and the view degrades.
 *
 * Exported so adjacent modules (tests, alternative view-builders) can reuse
 * the same enrichment shape without duplicating the lookup logic.
 */
export function getCardDefinition(
  cardInstanceId: string,
  definitionId: string,
): CardDefinitionView {
  // 1. Engine instance registry — has the per-instance copy of cost/might/etc.
  let engineLookup: EngineCardLookup | undefined;
  try {
    engineLookup = getGlobalCardRegistry().get(cardInstanceId);
  } catch {
    engineLookup = undefined;
  }

  // 2. Raw card-pool registry — has `rulesText` (engine lookup doesn't).
  //
  // Batch 23 ZZ fix (VV's blocker from batch 22): when `realDecks` is on,
  // `real-decks.ts` constructs instance IDs of the form
  //   `${playerId}-main-${i}-${defId}` / `${playerId}-rune-${i}-${defId}`
  // (defId is itself like `ogn-097-298`) and the engine's
  // `initializeMainDeck` reducer stores `definitionId = cardId` (the
  // Instance ID) — so the raw registry lookup via `definitionId` MISSES
  // Every real-deck card and `rulesText` is never populated. The original
  // Instance-ID is the only signal we have at this layer (we don't want
  // To plumb a separate map through internalState just for this), so we
  // Try the literal `definitionId` first and fall back to extracting the
  // Trailing card-pool id from the well-known instance-ID pattern.
  let raw: { rulesText?: string; abilities?: unknown } | undefined;
  const cardsModule = getRiftboundCardsModule();
  if (cardsModule) {
    try {
      const reg = cardsModule.getCardRegistry();
      let def = reg.get(definitionId);
      if (!def) {
        const extracted = extractDefIdFromInstanceId(definitionId);
        if (extracted) {
          def = reg.get(extracted);
        }
      }
      if (def) {
        raw = def as unknown as { rulesText?: string; abilities?: unknown };
      }
    } catch {
      raw = undefined;
    }
  }

  if (!engineLookup && !raw) {
    return {};
  }

  const abilities = engineLookup?.abilities ?? (raw?.abilities as EngineCardLookup["abilities"] | undefined);
  const view: CardDefinitionView = {
    abilities: abilities ? summariseAbilities(abilities) : undefined,
    cardType: engineLookup?.cardType,
    energyCost: engineLookup?.energyCost,
    imageUrl: lookupImageUrl(definitionId),
    might: engineLookup?.might,
    name: engineLookup?.name,
    powerCost: engineLookup?.powerCost,
    rulesText: raw?.rulesText,
  };
  // Drop undefined keys so JSON round-trips stay clean.
  return stripUndefined(view);
}

/**
 * Slice 5 (UX affordances): compute a unit's *effective* might by mirroring
 * The engine's `computeEffectiveMight` formula at the app layer (the engine
 * Package is closed scope so we can't import the internal helper directly).
 *
 * Sums: base might (from registered card) + 1-if-buffed + mightModifier +
 * combatMightModifier + staticMightBonus + sum of equipped gear mightBonus.
 * Floored at 0 (Rule 141 — Might can't go negative).
 *
 * Returns `undefined` when the card isn't registered (synthetic decks) —
 * The SPA falls back to base might and suppresses the +N badge.
 */
function computeEffectiveMightAppLayer(
  cardInstanceId: string,
  meta:
    | {
        buffed?: boolean;
        mightModifier?: number;
        combatMightModifier?: number;
        staticMightBonus?: number;
        equippedWith?: readonly string[];
      }
    | undefined,
): { baseMight?: number; effectiveMight?: number } {
  let lookup: EngineCardLookup | undefined;
  try {
    lookup = getGlobalCardRegistry().get(cardInstanceId);
  } catch {
    lookup = undefined;
  }
  if (!lookup || typeof lookup.might !== "number") {
    return {};
  }
  const baseMight = lookup.might;
  if (baseMight === 0) {
    // Non-units (or 0-might cards): no badge, no effective math.
    return { baseMight, effectiveMight: 0 };
  }
  const buffBonus = meta?.buffed ? 1 : 0;
  const mightMod = meta?.mightModifier ?? 0;
  const combatMightMod = meta?.combatMightModifier ?? 0;
  const staticBonus = meta?.staticMightBonus ?? 0;
  let equipBonus = 0;
  for (const equipId of meta?.equippedWith ?? []) {
    try {
      const equipLookup = getGlobalCardRegistry().get(equipId);
      equipBonus += equipLookup?.mightBonus ?? 0;
    } catch {
      // Ignore — equipment not registered, skip its contribution.
    }
  }
  const effectiveMight = Math.max(
    0,
    baseMight + buffBonus + mightMod + combatMightMod + staticBonus + equipBonus,
  );
  return { baseMight, effectiveMight };
}

/**
 * Phase B batch 25 DDD: derive whether a hand card is a SPELL whose first
 * effect needs an explicit non-self target. The SPA uses this to decide
 * whether to open the TargetPicker.
 *
 * Returns true iff:
 *   - card is registered AND `cardType === "spell"`, AND
 *   - the first `type: "spell"` ability has an `effect.target` object whose
 *     `type !== "self"`.
 *
 * Conservative on missing data (returns false) — the engine still validates
 * legality at apply time, and a one-click play of a target-needing spell will
 * cleanly error out rather than silently corrupting state.
 */
export function spellRequiresExplicitTarget(cardInstanceId: string): boolean {
  let lookup: EngineCardLookup | undefined;
  try {
    lookup = getGlobalCardRegistry().get(cardInstanceId);
  } catch {
    lookup = undefined;
  }
  if (!lookup) {return false;}
  const abilities = lookup.abilities ?? [];
  let ability: NonNullable<EngineCardLookup["abilities"]>[number] | undefined;
  if (lookup.cardType === "spell") {
    ability = abilities.find((a) => a.type === "spell");
  } else if (lookup.cardType === "gear" || lookup.cardType === "equipment") {
    // Iter-N+1: gears/equipment whose activated ability targets a non-self
    // Game object also need the TargetPicker to open at play-time so the
    // Human can pre-pick the target. Without this gate the Syren-style gear
    // (`[1], [Exhaust]: Move a friendly unit ...`) bypasses the picker and
    // The hand chip just casts the gear into base with no target choice.
    ability = abilities.find((a) => a.type === "activated");
  } else {
    return false;
  }
  const target = (ability?.effect as {
    target?: { type?: string } | string;
  } | undefined)?.target;
  // Iter-R follow-up: some abilities encode `target: "self"` as a bare string
  // Rather than `{ type: "self" }`. Treat both forms as "no explicit target
  // Needed". This unblocks Time Warp (`ogn-122-298`) and any other card with
  // A string-shape self target — the random tester flagged it as MISMATCH at
  // Seed=42 N=240 because the picker opened for a self-banish spell.
  if (!target) {return false;}
  if (typeof target === "string") {return target !== "self";}
  return target.type !== undefined && target.type !== "self";
}

/**
 * Iter-N: read a card's first relevant ability target descriptor (just the
 * `type` and `which`/`controller` axes the SPA cares about). Returns
 * `undefined` when the card is missing or has no target descriptor —
 * matching `spellRequiresExplicitTarget`'s conservative-on-missing-data
 * stance. The SPA uses this to choose between unit-pick / player-pick /
 * gear-pick TargetPicker variants without re-reading the card registry itself.
 *
 * Extended (iter-N+1) to inspect non-spell cards too: gears whose primary
 * gameplay is via an `activated` ability (e.g. The Syren — "[1], [Exhaust]:
 * Move a friendly unit at a battlefield to its base.") now surface their
 * activated-effect target descriptor here so the SPA can open the right
 * TargetPicker variant when the gear is clicked in hand.
 */
export function spellTargetDescriptor(
  cardInstanceId: string,
): { type: string; which?: string; location?: string; controller?: string } | undefined {
  let lookup: EngineCardLookup | undefined;
  try {
    lookup = getGlobalCardRegistry().get(cardInstanceId);
  } catch {
    lookup = undefined;
  }
  if (!lookup) {return undefined;}
  const abilities = lookup.abilities ?? [];
  // Spells: first `spell`-type ability carries the target.
  // Gear / equipment: the first `activated` ability is the one the SPA
  // Surfaces a picker for (gears are typically played to base and then
  // Activated to apply their effect — but for UI purposes the human picks
  // The target at play-time so the engine can route it once activated-from-
  // Hand or activated-from-base is wired up).
  // Other ability containers (units/legends with activated abilities) can
  // Also surface a descriptor — but PlayPage only consults this when the
  // Card needs an explicit target picker (see `spellRequiresExplicitTarget`).
  let ability: NonNullable<EngineCardLookup["abilities"]>[number] | undefined;
  if (lookup.cardType === "spell") {
    ability = abilities.find((a) => a.type === "spell");
  } else if (lookup.cardType === "gear" || lookup.cardType === "equipment") {
    ability = abilities.find((a) => a.type === "activated")
      ?? abilities.find((a) => a.type === "spell");
  }
  if (!ability) {return undefined;}
  const target = (ability.effect as {
    target?: { type?: string; which?: string; location?: string; controller?: string };
  } | undefined)?.target;
  if (!target || typeof target.type !== "string") {return undefined;}
  // Iter-Q: surface `location` (e.g. "trash"/"hand"/"deck") + `controller`
  // (e.g. "friendly"/"enemy"/"any") so the SPA can dispatch to the
  // Card-in-trash / card-in-hand / card-in-deck / rune picker variants.
  const out: { type: string; which?: string; location?: string; controller?: string } =
    { type: target.type };
  if (target.which !== undefined) {out.which = target.which;}
  if (typeof target.location === "string") {out.location = target.location;}
  if (typeof target.controller === "string") {out.controller = target.controller;}
  return out;
}

/**
 * Extract the trailing card-pool `defId` from a real-decks instance ID.
 *
 * Instance IDs look like `player-1-main-7-ogn-097-298` or
 * `player-2-rune-3-fury-rune` (see `real-decks.ts`). The defId itself
 * contains dashes, so we match the fixed prefix and return everything
 * after the per-deck index.
 *
 * Returns `undefined` for synthetic IDs (`player-1-card-0`, raw card IDs,
 * etc.) so the caller can leave `rulesText` empty in those cases.
 */
function extractDefIdFromInstanceId(instanceId: string): string | undefined {
  const match = /^player-\d+-(?:main|rune)-\d+-(.+)$/.exec(instanceId);
  return match ? match[1] : undefined;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}

/**
 * Format up to 5 abilities as one-line strings. Designed for hover-popovers,
 * not for rules-accurate display. Falls back to a bare `[<type>]` tag when an
 * ability is too complex to summarise on one line.
 */
export function summariseAbilities(
  abilities: NonNullable<EngineCardLookup["abilities"]>,
): string[] {
  const out: string[] = [];
  for (const ab of abilities) {
    if (out.length >= 5) {break;}
    out.push(summariseAbility(ab));
  }
  return out;
}

function summariseAbility(ab: NonNullable<EngineCardLookup["abilities"]>[number]): string {
  const {type} = ab;
  const effectSummary = formatEffect(ab.effect);
  switch (type) {
    case "triggered": {
      const trigger = ab.trigger
        ? `Trigger: ${ab.trigger.event}${ab.trigger.on ? ` (${ab.trigger.on})` : ""}`
        : "Trigger";
      return `[${trigger}] ${effectSummary}`.trim();
    }
    case "activated": {
      const cost = formatCost(ab.cost);
      return `[Activated]${cost ? ` ${cost} →` : ""} ${effectSummary}`.trim();
    }
    case "static": {
      return `[Static] ${effectSummary}`.trim();
    }
    case "spell": {
      return `[Spell] ${effectSummary}`.trim();
    }
    case "replacement": {
      return `[Replacement] ${ab.replaces ?? ""} → ${formatEffect(ab.replacement)}`.trim();
    }
    case "keyword": {
      const v = ab.value;
      return `[Keyword] ${ab.keyword ?? ""}${v !== undefined ? ` ${v}` : ""}`.trim();
    }
    default: {
      return `[${String(type)}]`;
    }
  }
}

function formatEffect(effect: unknown): string {
  if (!effect || typeof effect !== "object") {return "";}
  const e = effect as Record<string, unknown>;
  const t = typeof e.type === "string" ? e.type : "";
  if (!t) {return "";}
  // Surface a couple of common numeric/string fields if present.
  const extras: string[] = [];
  if (typeof e.amount === "number") {extras.push(String(e.amount));}
  if (typeof e.value === "number") {extras.push(String(e.value));}
  if (typeof e.keyword === "string") {extras.push(e.keyword);}
  if (Array.isArray(e.keywords)) {extras.push((e.keywords as string[]).join(","));}
  return extras.length > 0 ? `${t} ${extras.join(" ")}` : t;
}

function formatCost(cost: unknown): string {
  if (!cost || typeof cost !== "object") {return "";}
  const c = cost as Record<string, unknown>;
  const parts: string[] = [];
  if (c.exhaust === true) {parts.push("exhaust");}
  if (typeof c.energy === "number" && c.energy > 0) {parts.push(`${c.energy}E`);}
  if (Array.isArray(c.power)) {parts.push((c.power as string[]).join("+"));}
  return parts.join(" ");
}

/** The session — one game in flight, plus a trail of every move taken. */
/**
 * Slice 4 (undo/rewind) helper: collect the set of currently-on-the-chain
 * item ids from a RiftboundGameState. Returns an empty set when the chain
 * is absent / cleared. Used by `EngineSession` to detect items that
 * resolved (or were countered) between two states.
 */
function currentChainItemIds(state: RiftboundGameState): Set<string> {
  const out = new Set<string>();
  const items = state.interaction?.chain?.items ?? [];
  for (const it of items) {
    const {id} = (it as { id?: string });
    if (typeof id === "string") {out.add(id);}
  }
  return out;
}

export class EngineSession {
  readonly engine: RiftboundEngine;
  readonly playerIds: readonly [string, string];
  private trail: SessionStep[] = [];
  private seq = 0;
  /**
   * Slice 4 (undo/rewind): bounded stack of move history with pre-move
   * snapshots. Only successful moves get pushed (failed moves leave state
   * untouched, so there's nothing to undo). Capped at `MOVE_HISTORY_CAP`
   * to avoid unbounded memory growth across a long match.
   */
  private moveHistory: MoveHistoryEntry[] = [];
  /**
   * Slice 4: monotonic counter of chain items that have resolved since
   * session start. Captured into each snapshot so `canUndo` can detect a
   * chain resolution between your last move and now. Chain item identity
   * is tracked via state.interaction.chain.items[].id; we recompute the
   * count from a snapshot diff so the engine doesn't need to expose a
   * dedicated counter.
   */
  private chainResolveCount = 0;
  /**
   * Slice 4: previous chain-item id set, so applyMove can detect items
   * that disappeared (resolved) between snapshots and bump
   * `chainResolveCount`. Stored as a Set for O(1) membership checks.
   */
  private prevChainItemIds = new Set<string>();

  /**
   * Slice 4: cap on `moveHistory` length. Old entries are dropped FIFO
   * once we exceed the cap so a long match can't OOM the server.
   * 50 covers every realistic undo distance (you don't undo 30 turns ago).
   */
  private static readonly MOVE_HISTORY_CAP = 50;

  constructor(opts: EngineSessionOptions = {}) {
    const playerIds = opts.playerIds ?? ["player-1", "player-2"];
    const playerNames = opts.playerNames ?? ["Player 1", "Player 2"];
    const seed = opts.seed ?? "engine-session";
    const deckSize = opts.deckSize ?? 40;
    const runeDeckSize = opts.runeDeckSize ?? 12;
    const battlefieldCount = opts.battlefieldCount ?? 2;
    const autoStart = opts.autoStartPlaying ?? true;

    this.playerIds = playerIds;
    this.engine = new RuleEngine<
      RiftboundGameState,
      RiftboundMoves,
      unknown,
      RiftboundCardMeta
    >(
      riftboundDefinition,
      [
        { id: playerIds[0], name: playerNames[0] },
        { id: playerIds[1], name: playerNames[1] },
      ],
      { seed },
    );

    // Decide deck contents: real cards from @tcg/riftbound-cards or synthetic
    // Placeholder IDs. Real decks are gated on `opts.realDecks` so existing
    // Tests keep their deterministic synthetic-deck behaviour.
    const mainDeckIdsByPlayer: Record<string, string[]> = {};
    const runeDeckIdsByPlayer: Record<string, string[]> = {};
    let battlefieldIdsForSetup: string[] | undefined;
    if (opts.realDecks) {
      // Lazy-import so test environments that never enable realDecks aren't
      // Forced to load the whole card pool.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const realDecksModule = require("./real-decks") as typeof import("./real-decks");
      const decks = realDecksModule.getPrebuiltDecks();
      for (let i = 0; i < playerIds.length; i++) {
        const pid = playerIds[i];
        const deck = decks[i] ?? decks[0];
        const reg = realDecksModule.registerDeckCardsWithEngine(this.engine, {
          ...deck,
          playerId: pid,
        });
        mainDeckIdsByPlayer[pid] = reg.mainDeckInstanceIds;
        runeDeckIdsByPlayer[pid] = reg.runeDeckInstanceIds;
        if (!battlefieldIdsForSetup) {
          battlefieldIdsForSetup = reg.battlefieldInstanceIds;
        }
      }
    } else {
      for (const pid of playerIds) {
        mainDeckIdsByPlayer[pid] = Array.from(
          { length: deckSize },
          (_, i) => `${pid}-card-${i}`,
        );
        runeDeckIdsByPlayer[pid] = Array.from(
          { length: runeDeckSize },
          (_, i) => `${pid}-rune-${i}`,
        );
      }
    }

    for (const pid of playerIds) {
      this.engine.executeMove("initializeMainDeck", {
        params: {
          cardIds: mainDeckIdsByPlayer[pid],
          playerId: pid,
        },
        playerId: pid as PlayerId,
      });
      this.engine.executeMove("initializeRuneDeck", {
        params: {
          playerId: pid,
          runeIds: runeDeckIdsByPlayer[pid],
        },
        playerId: pid as PlayerId,
      });
      if (!opts.skipInitialHand) {
        this.engine.executeMove("drawInitialHand", {
          params: { playerId: pid },
          playerId: pid as PlayerId,
        });
      }
    }

    if (battlefieldCount > 0) {
      const battlefieldIds =
        battlefieldIdsForSetup
          ?? Array.from({ length: battlefieldCount }, (_, i) => `bf-${i + 1}`);
      this.engine.executeMove("placeBattlefields", {
        params: { battlefieldIds: battlefieldIds.slice(0, battlefieldCount) },
        playerId: playerIds[0] as PlayerId,
      });
    }

    if (autoStart) {
      this.engine.executeMove("transitionToPlay", {
        params: {},
        playerId: playerIds[0] as PlayerId,
      });

      // Drive the pregame -> first-turn main-phase transition explicitly.
      // After `transitionToPlay` the flow's `mainGame.onBegin` puts the
      // Turn into `awaken` and auto-advances through
      // `awaken -> beginning -> channel`, running channel's `onBegin`
      // (which channels the first player's two starting runes) — but
      // Stops at `channel` awaiting a player move because the flow
      // Manager only advances one phase per move dispatch (see
      // RuleEngine.executeMove -> checkEndConditions, which cascades only
      // Once before yielding back to the caller).
      //
      // For a vanilla bot that's a deadlock: the bot would have to spend
      // A channel-phase rune (via `exhaustRune` or `recycleRune`) just to
      // Advance into `draw`, then spend another rune to advance into
      // `main`, by which point all of its starting runes are exhausted
      // And the draw-phase `onEnd` has wiped any energy gained — so the
      // Bot never converts pool runes into a card play.
      //
      // We bypass this by driving the flow forward directly via the
      // Public `flowManager.nextPhase()` API: channel -> draw -> main.
      // We deliberately stop ONCE we reach main (or run out of cascadable
      // Phases) so we don't end up driving the entire turn.
      //
      // NOTE: this skips channel-phase rune-channel for the first turn
      // Only if channel.onBegin was somehow not yet run by the cascade.
      // In practice the cascade does fire channel.onBegin (it's `endIf
      // () => true`), so the active player enters `main` with 2 ready
      // Runes in pool. The draw-phase `onBegin` (1-card draw, rule
      // 515.4.b) is also fired by the cascade.
      const flow = this.engine.getFlowManager?.();
      if (flow) {
        const SAFETY_CAP = 8;
        for (let i = 0; i < SAFETY_CAP; i++) {
          const currentPhase = flow.getCurrentPhase?.();
          if (currentPhase === "main") {break;}
          if (!currentPhase) {break;}
          flow.nextPhase();
        }
        // Back-sync the flow manager's gameState into the engine. The flow
        // Manager's phase/draw/onBegin hooks mutated its internal gameState
        // (drawCards, energy resets, phase pointer, etc.) but the engine's
        // `currentState` only auto-syncs from the flow during executeMove
        // (see RuleEngine.executeMove's flow back-sync at the end of the
        // Patch-collection block). Without this manual write the engine
        // Would still serve a stale "still in channel" snapshot to
        // `getView` / `enumerateMoves`, even though the flow has
        // Internally advanced to `main`.
        const flowState = flow.getGameState() as RiftboundGameState;
        if (flowState) {
          (this.engine as unknown as { currentState: RiftboundGameState }).currentState =
            flowState;
        }
      }
    }
  }

  /** Render-friendly snapshot of the current state. */
  getView(): GameView {
    return buildView(this.engine);
  }

  /**
   * Per-player hand view, enriched with card-definition fields
   * (name/cardType/might/energyCost/powerCost/rulesText/abilities) so a UI
   * can render full card info on hover. `legalLocations` is intentionally
   * not populated — the caller (typically `server.ts`) augments each card
   * with the set of currently-legal `playUnit` location params.
   */
  buildHandView(): Record<string, readonly HandCardView[]> {
    const internal = getInternalSnapshot(this.engine);
    const out: Record<string, HandCardView[]> = {};
    for (const pid of this.playerIds) {
      out[pid] = [];
    }
    for (const [cardId, card] of Object.entries(internal.cards ?? {})) {
      if (card.zone !== "hand") {continue;}
      const ownerBucket = out[card.owner];
      if (!ownerBucket) {continue;}
      const def = getCardDefinition(cardId, card.definitionId);
      const entry: HandCardView = {
        definitionId: card.definitionId,
        id: cardId,
        ...def,
      };
      // Phase B batch 25 DDD: only spells with a non-self target descriptor
      // Require the SPA to open the TargetPicker. Other cards (units, gear,
      // Self-target spells, no-target spells) can be played in one click.
      const reqTarget = spellRequiresExplicitTarget(cardId);
      if (reqTarget) {
        // Iter-N: also surface the target descriptor so the SPA can pick
        // The player-target picker variant for spells like Sabotage.
        const td = spellTargetDescriptor(cardId);
        ownerBucket.push({
          ...entry,
          requiresTarget: true,
          ...(td ? { targetDescriptor: td } : {}),
        });
      } else {
        ownerBucket.push(entry);
      }
    }
    return out;
  }

  /** Moves legal *right now* for `playerId`. */
  legalMoves(playerId: string): LegalMove[] {
    try {
      const moves = this.engine.enumerateMoves(playerId as PlayerId, {
        validOnly: true,
      });
      return moves.map((m) => ({
        moveId: m.moveId,
        params: (m.params ?? {}) as Record<string, unknown>,
        playerId: (m.playerId ?? playerId) as string,
      }));
    } catch {
      // Fallback: every player can at least try to end the turn. The engine
      // Itself will reject if it's not actually their turn.
      return [
        {
          moveId: "endTurn",
          params: { playerId },
          playerId,
        },
      ];
    }
  }

  /**
   * Execute a move on behalf of `playerId`. Returns the step record, including
   * a fresh view snapshot. Records into the trail even on failure so the UI
   * can surface validation errors.
   */
  applyMove(playerId: string, move: { moveId: string; params: Record<string, unknown> }): SessionStep {
    let success = false;
    let error: string | undefined;
    // Slice 4: capture pre-move snapshot up front. We push it to history
    // Only on `success === true` so failed moves don't bloat the undo
    // Stack (and so `canUndo` doesn't return a no-op snapshot).
    const snapshotBefore = this.snapshot();
    try {
      const result = this.engine.executeMove(move.moveId, {
        params: move.params,
        playerId: playerId as PlayerId,
      });
      ({ success } = result);
      if (!result.success && "error" in result) {
        const e = (result as { error: unknown }).error;
        error = typeof e === "string" ? e : JSON.stringify(e);
      }
    } catch (error) {
      success = false;
      error = error instanceof Error ? error.message : String(error);
    }

    // Slice 4: detect chain items that resolved during this move. If any
    // Previously-tracked chain item id is no longer present, it resolved
    // (or was countered — same effect for undo gating). Bump the running
    // Counter so future snapshots compare correctly.
    this.recomputeChainResolveCount();

    const step: SessionStep = {
      error,
      moveId: move.moveId,
      params: move.params,
      playerId,
      seq: ++this.seq,
      success,
      viewAfter: this.getView(),
    };
    this.trail.push(step);

    // Slice 4: record successful moves in the undo stack. We label the
    // Entry with the moveId — the SPA enriches it with card name via the
    // Trail's existing cardName lookup if it wants.
    if (success) {
      this.moveHistory.push({
        label: move.moveId,
        moveId: move.moveId,
        params: move.params,
        playerId,
        snapshotBefore,
        stepSeq: step.seq,
      });
      if (this.moveHistory.length > EngineSession.MOVE_HISTORY_CAP) {
        // Drop the oldest entry — the snapshot inside is no longer
        // Reachable so V8 will GC it on the next pass.
        this.moveHistory.shift();
      }
    }

    return step;
  }

  /**
   * Slice 4 (undo/rewind): deep-clone the engine's mutable state into a
   * standalone snapshot blob. We reach into the same private fields the
   * SPA already uses elsewhere (`engine.currentState`, `engine.internalState`)
   * because the engine package is closed scope for this slice.
   *
   * `structuredClone` handles nested Maps/Sets/Arrays without any
   * serializer plumbing, and produces a fresh tree (no aliasing with the
   * Live engine state). Cheap relative to a move dispatch — measured at
   * ~1-2 ms on a real-decks session.
   */
  snapshot(): SerializedState {
    const e = this.engine as unknown as {
      currentState: RiftboundGameState;
      internalState: InternalSnapshot;
    };
    return {
      chainResolveCount: this.chainResolveCount,
      currentState: structuredClone(e.currentState),
      internalState: structuredClone(e.internalState),
      seq: this.seq,
    };
  }

  /**
   * Slice 4 (undo/rewind): replace the engine's current state with `snap`.
   * Restores the engine's `currentState` and `internalState` (the two
   * Mutable buckets the engine maintains) plus the session's `seq` /
   * `chainResolveCount` bookkeeping. Also calls `flow.syncState` so the
   * FlowManager sees the rewound state on its next `getGameState` / phase
   * Check — without that, `endIf` evaluators would still read the
   * Pre-undo state.
   *
   * Note: we deep-clone the snapshot on the way out so a caller can
   * Restore the SAME snapshot multiple times without state aliasing
   * across restores. This matters for repeated undo of the same move
   * (e.g. if the test fixture restores a baseline snapshot twice).
   */
  restore(snap: SerializedState): void {
    const e = this.engine as unknown as {
      currentState: RiftboundGameState;
      internalState: InternalSnapshot;
    };
    e.currentState = structuredClone(snap.currentState);
    e.internalState = structuredClone(snap.internalState);
    this.seq = snap.seq;
    this.chainResolveCount = snap.chainResolveCount;
    this.prevChainItemIds = currentChainItemIds(e.currentState);

    // Back-sync into the flow manager so phase end-conditions evaluate
    // Against the rewound state. Without this, `flowManager.getGameState()`
    // Would still serve the pre-undo state for its next phase check.
    const flow = this.engine.getFlowManager?.();
    if (flow && typeof (flow as unknown as { syncState?: (s: unknown) => void }).syncState === "function") {
      (flow as unknown as { syncState: (s: RiftboundGameState) => void }).syncState(e.currentState);
    }
  }

  /**
   * Slice 4: can `playerId` undo their last move right now?
   *
   * Gates (all must hold):
   *   1. There is a move in history with `playerId === <caller>`
   *   2. That move is at the TOP of the history (no opponent move since)
   *   3. No chain item has resolved between the move and now
   *      (`chainResolveCount` matches the snapshot's count)
   *   4. The session is not finished (game over)
   *
   * Returns `false` (not an error) when any gate fails so the SPA can
   * Disable the button cleanly.
   */
  canUndo(playerId: string): boolean {
    if (this.moveHistory.length === 0) {return false;}
    if (this.isGameOver()) {return false;}
    const top = this.moveHistory[this.moveHistory.length - 1];
    if (!top) {return false;}
    if (top.playerId !== playerId) {return false;}
    // Step 3 gate: no chain item resolved between snapshot and now.
    if (top.snapshotBefore.chainResolveCount !== this.chainResolveCount) {
      return false;
    }
    return true;
  }

  /**
   * Slice 4: size of the undo stack. Surfaced to the SPA so the button
   * Can show "Undo (3 moves left)" if a designer wants. Tests use it to
   * Assert the stack drains correctly.
   */
  get undoCount(): number {
    return this.moveHistory.length;
  }

  /**
   * Slice 4: peek the top-of-history entry without popping (used by the
   * SPA to render the "Undo: <last move>" label). Returns a shallow copy
   * Of the metadata; the snapshot itself is intentionally NOT exposed.
   */
  peekLastMove(): Pick<MoveHistoryEntry, "moveId" | "params" | "playerId" | "label" | "stepSeq"> | undefined {
    const top = this.moveHistory[this.moveHistory.length - 1];
    if (!top) {return undefined;}
    return {
      label: top.label,
      moveId: top.moveId,
      params: top.params,
      playerId: top.playerId,
      stepSeq: top.stepSeq,
    };
  }

  /**
   * Slice 4: undo the top move on the history stack. Validates the same
   * Gates as `canUndo` and either restores the snapshot + pops the entry
   * (returning `{ok: true, undone: <metadata>}`), or returns
   * `{ok: false, error: <reason>}` without touching state.
   *
   * Marks the corresponding trail step's `undone = true` so the SPA's
   * MoveLog renders it strike-through (we keep the step record so seq
   * Stays monotonic and tests can assert on it).
   */
  undoLastMove(playerId: string): {
    ok: boolean;
    error?: string;
    undone?: Pick<MoveHistoryEntry, "moveId" | "params" | "playerId" | "label" | "stepSeq">;
  } {
    if (this.moveHistory.length === 0) {
      return { error: "no move to undo", ok: false };
    }
    if (this.isGameOver()) {
      return { error: "cannot undo after game over", ok: false };
    }
    const top = this.moveHistory[this.moveHistory.length - 1];
    if (!top) {return { error: "no move to undo", ok: false };}
    if (top.playerId !== playerId) {
      return {
        error: `cannot undo: last move was by ${top.playerId}, not ${playerId}`,
        ok: false,
      };
    }
    if (top.snapshotBefore.chainResolveCount !== this.chainResolveCount) {
      return {
        error: "cannot undo: a chain item resolved after your move",
        ok: false,
      };
    }

    // Snapshot/restore path. Note we DON'T mutate `trail` retroactively
    // Except to flag `undone = true` on the corresponding step.
    this.restore(top.snapshotBefore);
    this.moveHistory.pop();
    const undone = {
      label: top.label,
      moveId: top.moveId,
      params: top.params,
      playerId: top.playerId,
      stepSeq: top.stepSeq,
    };

    // Flip `undone = true` on the trail entry so the MoveLog can render
    // It strike-through. SessionStep is `readonly` in the type, but the
    // Array itself is mutable; we replace the entry with a copy.
    const idx = this.trail.findIndex((s) => s.seq === top.stepSeq);
    if (idx !== -1) {
      this.trail[idx] = { ...this.trail[idx]!, undone: true };
    }

    return { ok: true, undone };
  }

  /**
   * Slice 4 internal: walk the current chain items, diff against
   * `prevChainItemIds`, and bump `chainResolveCount` for each item that
   * Disappeared. New items added to the chain don't count — only
   * Resolution / counter / clear bumps the counter. Idempotent on a
   * Steady state (no chain change → no bump).
   */
  private recomputeChainResolveCount(): void {
    const state = this.engine.getState();
    const next = currentChainItemIds(state);
    for (const id of this.prevChainItemIds) {
      if (!next.has(id)) {
        this.chainResolveCount += 1;
      }
    }
    this.prevChainItemIds = next;
  }

  /** All steps taken so far. Copy — caller can't mutate. */
  getTrail(): readonly SessionStep[] {
    return [...this.trail];
  }

  /** Convenience: who's active right now. */
  getActivePlayer(): string {
    return this.engine.getState().turn.activePlayer;
  }

  /** Convenience: is the game decided? */
  isGameOver(): boolean {
    const state = this.engine.getState();
    if (state.status === "finished") {return true;}
    for (const p of Object.values(state.players)) {
      if (p.victoryPoints >= state.victoryScore) {return true;}
    }
    return false;
  }

  /**
   * Iter 12: directly seed a mid-combat board state for the SPA's
   * mid-combat screenshot scenario. Bypasses the normal move pipeline
   * because driving a vanilla bot-vs-bot game to a contested showdown
   * is non-deterministic on real decks.
   *
   * Effect:
   *   - Places the first hand-unit from each player's hand onto
   *     `battlefield-<battlefieldId>` (creating a 1v1 contest).
   *   - Marks `state.battlefields[battlefieldId].contested = true`.
   *   - Pushes a combat-showdown frame onto `state.interaction.showdownStack`.
   *   - Tags the attacker's unit with `cardMetas[unitId].combatRole = "attacker"`.
   *
   * Returns the chosen unit ids so callers can assert against them. If the
   * board doesn't have at least one unit per player available (no real
   * decks, or hands are empty), returns `{ seeded: false }` and leaves
   * state untouched.
   *
   * Intentionally generic — picks "the first eligible unit" rather than
   * a specific card-id, so this never devolves into per-card logic.
   */
  seedCombatState(opts: {
    attackerId?: string;
    defenderId?: string;
    battlefieldId?: string;
  } = {}): {
    seeded: boolean;
    battlefieldId?: string;
    attackerUnitId?: string;
    defenderUnitId?: string;
  } {
    const attackerPid = opts.attackerId ?? this.playerIds[0];
    const defenderPid = opts.defenderId ?? this.playerIds[1];
    const state = this.engine.getState();
    const internal = getInternalSnapshot(this.engine);
    const bfIds = Object.keys(state.battlefields ?? {});
    const battlefieldId = opts.battlefieldId ?? bfIds[0];
    if (!battlefieldId) {return { seeded: false };}

    // Find the first unit card in each player's hand.
    const firstUnitInHand = (pid: string): string | undefined => {
      for (const [cardId, card] of Object.entries(internal.cards ?? {})) {
        if (!card || card.owner !== pid || card.zone !== "hand") {continue;}
        const def = getCardDefinition(cardId, card.definitionId);
        if (def.cardType === "Unit" || def.cardType === "unit") {return cardId;}
      }
      // Fallback: ANY card in the player's hand. Synthetic decks have no
      // CardType, so for them we just grab the first thing. We still tag it
      // As a unit-on-the-battlefield so the showdown frame is valid.
      for (const [cardId, card] of Object.entries(internal.cards ?? {})) {
        if (card?.owner === pid && card?.zone === "hand") {return cardId;}
      }
      return undefined;
    };

    const attackerUnitId = firstUnitInHand(attackerPid);
    const defenderUnitId = firstUnitInHand(defenderPid);
    if (!attackerUnitId || !defenderUnitId) {return { seeded: false };}

    // Mutate zones: pull units from hand → battlefield.
    const bfZoneId = `battlefield-${battlefieldId}`;
    const handZoneId = "hand";
    const zones = internal.zones ?? {};
    const handZone = zones[handZoneId];
    const bfZone = zones[bfZoneId];
    if (!bfZone) {return { seeded: false };}
    const ensureMeta = (unitId: string, role: "attacker" | "defender") => {
      const metas = internal.cardMetas ?? (internal.cardMetas = {});
      const existing = metas[unitId];
      if (existing) {
        existing.combatRole = role;
      } else {
        metas[unitId] = {
          buffed: false,
          combatRole: role,
          damage: 0,
          exhausted: false,
          hidden: false,
          stunned: false,
        };
      }
    };
    for (const [unitId, role] of [
      [attackerUnitId, "attacker"] as const,
      [defenderUnitId, "defender"] as const,
    ]) {
      if (handZone) {
        const idx = handZone.cardIds.indexOf(unitId);
        if (idx !== -1) {handZone.cardIds.splice(idx, 1);}
      }
      if (!bfZone.cardIds.includes(unitId)) {bfZone.cardIds.push(unitId);}
      const cardRec = internal.cards?.[unitId];
      if (cardRec) {cardRec.zone = bfZoneId;}
      ensureMeta(unitId, role);
    }

    // Mutate state.battlefields[battlefieldId].contested and
    // State.interaction.showdownStack via the same currentState write
    // Path used by the constructor when it back-syncs flow state.
    const nextState: RiftboundGameState = {
      ...state,
      battlefields: {
        ...state.battlefields,
        [battlefieldId]: {
          ...state.battlefields[battlefieldId],
          contested: true,
          contestedBy: attackerPid as PlayerId,
        },
      },
      interaction: {
        chain: state.interaction?.chain ?? null,
        nextChainItemId: state.interaction?.nextChainItemId ?? 1,
        showdownStack: [
          ...(state.interaction?.showdownStack ?? []),
          {
            active: true,
            attackingPlayer: attackerPid,
            battlefieldId,
            defendingPlayer: defenderPid,
            focusPlayer: attackerPid,
            isCombatShowdown: true,
            passedPlayers: [],
            relevantPlayers: [attackerPid, defenderPid],
          },
        ],
      },
    };
    (this.engine as unknown as { currentState: RiftboundGameState }).currentState =
      nextState;

    return { attackerUnitId, battlefieldId, defenderUnitId, seeded: true };
  }

  /**
   * Generic single-card cast seed: place ANY card from the registered card
   * pool into `casterId`'s hand with enough energy/power to cast it. Also
   * places a friendly unit on a battlefield (so unit-targeting spells have
   * something to target) AND an enemy unit on the same battlefield (so
   * enemy-target spells have an opponent's unit to choose). Used by the
   * random card flow tester to drive arbitrary spell/gear cast flows.
   *
   * Returns the instance id of the seeded card so the UI driver can click
   * the corresponding hand-chip selector.
   *
   * Generic — no per-card branching. If the card is a spell, the resulting
   * hand chip will have `requiresTarget` derived from its first effect's
   * target descriptor (the same path `seedSabotageState` uses).
   */
  seedSingleCardCast(opts: {
    cardId: string;
    casterId?: string;
    energy?: number;
  }): {
    seeded: boolean;
    instanceId?: string;
    cardId: string;
    casterId: string;
    cardName?: string;
    cardType?: string;
    targetType?: string;
    firstAbilityType?: string;
  } {
    const casterId = opts.casterId ?? this.playerIds[0];
    const opponentId = casterId === this.playerIds[0] ? this.playerIds[1] : this.playerIds[0];
    const energy = opts.energy ?? 10;

    let cardsModule: RiftboundCardsModule | null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cardsModule = require("@tcg/riftbound-cards") as RiftboundCardsModule;
    } catch {
      cardsModule = null;
    }
    if (!cardsModule) {return { cardId: opts.cardId, casterId, seeded: false };}
    const cardRegistry = cardsModule.getCardRegistry();
    const def = cardRegistry.get(opts.cardId) as
      | ({ name: string; cardType: string; abilities?: { effect?: { target?: { type?: string } }; type?: string }[] } & Record<string, unknown>)
      | undefined;
    if (!def) {return { cardId: opts.cardId, casterId, seeded: false };}

    const internal = getInternalSnapshot(this.engine);
    const handZone = internal.zones?.["hand"];
    if (!handZone) {return { cardId: opts.cardId, casterId, seeded: false };}
    const cardReg = getGlobalCardRegistry();
    const instanceId = `castdemo-${opts.cardId}-${casterId}`;
    const friendlyUnitId = `castdemo-friendly-${casterId}`;
    const enemyUnitId = `castdemo-enemy-${opponentId}`;

    // Register the card under the synthetic instance id so engine
    // Enumeration sees real ability/cost/etc.
    cardReg.register(instanceId, {
      abilities: def.abilities as Parameters<ReturnType<typeof getGlobalCardRegistry>["register"]>[1]["abilities"],
      cardType: def.cardType as string,
      domain: def.domain as string | string[] | undefined,
      energyCost: def.energyCost as number | undefined,
      id: instanceId,
      keywords: def.keywords as string[] | undefined,
      might: def.might as number | undefined,
      name: def.name,
      powerCost: def.powerCost as string[] | undefined,
      timing: def.timing as string | undefined,
    });

    // Also register a vanilla unit definition for the friendly/enemy units
    // So they render with a name in the battlefield. Pick the first unit
    // From the all-cards pool to use as the prop unit.
    const allCards = cardsModule.getAllCards();
    const propUnitDef = allCards.find((c) => c.cardType === "unit");
    if (propUnitDef) {
      const unitPayload = (id: string) => ({
        abilities: undefined as unknown as Parameters<ReturnType<typeof getGlobalCardRegistry>["register"]>[1]["abilities"],
        cardType: "unit",
        domain: (propUnitDef as Record<string, unknown>).domain as string | string[] | undefined,
        energyCost: (propUnitDef as Record<string, unknown>).energyCost as number | undefined,
        id,
        keywords: (propUnitDef as Record<string, unknown>).keywords as string[] | undefined,
        might: ((propUnitDef as Record<string, unknown>).might as number | undefined) ?? 2,
        name: (propUnitDef as { name: string }).name,
        powerCost: undefined,
        timing: undefined,
      });
      cardReg.register(friendlyUnitId, unitPayload(friendlyUnitId));
      cardReg.register(enemyUnitId, unitPayload(enemyUnitId));
    }

    // Place the cast card in caster's hand.
    if (!handZone.cardIds.includes(instanceId)) {handZone.cardIds.push(instanceId);}
    internal.cards = internal.cards ?? {};
    internal.cards[instanceId] = {
      controller: casterId,
      definitionId: opts.cardId,
      owner: casterId,
      zone: "hand",
    };
    internal.cardMetas = internal.cardMetas ?? {};
    internal.cardMetas[instanceId] = {
      buffed: false,
      combatRole: null,
      damage: 0,
      exhausted: false,
      hidden: false,
      stunned: false,
    };

    // Place friendly + enemy prop units on the first battlefield so
    // Unit-target spells have something to target.
    const state0 = this.engine.getState();
    const bfIds = Object.keys(state0.battlefields ?? {});
    const bfId = bfIds[0];
    if (bfId && propUnitDef) {
      const bfZoneId = `battlefield-${bfId}`;
      const bfZone = internal.zones?.[bfZoneId];
      if (bfZone) {
        for (const [uid, owner] of [
          [friendlyUnitId, casterId] as const,
          [enemyUnitId, opponentId] as const,
        ]) {
          if (!bfZone.cardIds.includes(uid)) {bfZone.cardIds.push(uid);}
          internal.cards[uid] = {
            controller: owner,
            definitionId: (propUnitDef as { id: string }).id,
            owner,
            zone: bfZoneId,
          };
          internal.cardMetas[uid] = {
            buffed: false,
            combatRole: null,
            damage: 0,
            exhausted: false,
            hidden: false,
            stunned: false,
          };
        }
      }
    }

    // Bump caster's energy + a generous spread of power so the card is
    // Playable regardless of domain.
    const state = this.engine.getState();
    const casterPool = state.runePools[casterId] ?? { energy: 0, power: {} };
    const allDomains = ["body", "mind", "calm", "chaos", "fury", "order"];
    const powerSpread: Record<string, number> = { ...casterPool.power };
    for (const d of allDomains) {
      powerSpread[d] = Math.max(powerSpread[d] ?? 0, 3);
    }
    const nextRunePools = {
      ...state.runePools,
      [casterId]: {
        ...casterPool,
        energy: Math.max(casterPool.energy, energy),
        power: powerSpread,
      },
    };
    const nextState: RiftboundGameState = {
      ...state,
      runePools: nextRunePools,
    };
    (this.engine as unknown as { currentState: RiftboundGameState }).currentState = nextState;

    // Surface a small summary so the harness can classify expectations.
    const firstAbility = def.abilities?.[0];
    const firstEffect = (firstAbility?.effect ?? {}) as Record<string, unknown>;
    const targetDescriptor = (firstEffect.target ?? {}) as Record<string, unknown>;
    const targetType = typeof targetDescriptor.type === "string" ? targetDescriptor.type : undefined;
    const firstAbilityType = typeof firstAbility?.type === "string" ? firstAbility.type : undefined;

    return {
      cardId: opts.cardId,
      cardName: def.name,
      cardType: def.cardType,
      casterId,
      firstAbilityType,
      instanceId,
      seeded: true,
      targetType,
    };
  }

  /**
   * Sabotage screenshot scenario: seed state so the active player has the
   * Sabotage spell (`ogn-156-298`) in hand with energy to cast, and the
   * opponent has a non-unit card available as a legal recycle target.
   *
   * Unlike `seedCombatState`, this seed PUSHES a fresh sabotage card
   * instance into the active player's hand zone (rather than picking from
   * an existing real-deck instance — Sabotage may not be in the prebuilt
   * Calm/Mind/Fury/Chaos decks). Same goes for the opponent's recycle
   * target.
   *
   * Returns:
   *   - `sabotageCardId`: instance id pushed into player-1's hand
   *   - `targetCardId`: non-unit instance id pushed into player-2's hand
   *     (the legal recycle target the resolution step picks)
   *   - `pendingChoice`: when `step === "revealed"`, also writes a
   *     `pendingChoice` onto `currentState` so the SPA renders the
   *     post-cast revealed-hand state.
   *
   * `step`:
   *   - `precast`   — Sabotage in hand, opponent hand face-down. (default)
   *   - `revealed`  — pendingChoice set; opponent hand revealed.
   *   - `resolved`  — pendingChoice cleared; target card has been moved
   *                   to the bottom of opponent's main deck (recycled).
   */
  seedSabotageState(opts: {
    casterId?: string;
    opponentId?: string;
    step?: "precast" | "revealed" | "resolved";
  } = {}): {
    seeded: boolean;
    sabotageCardId?: string;
    targetCardId?: string;
    step: "precast" | "revealed" | "resolved";
  } {
    const casterId = opts.casterId ?? this.playerIds[0];
    const opponentId = opts.opponentId ?? this.playerIds[1];
    const step = opts.step ?? "precast";

    // Lazy-import the cards module so synthetic-deck tests don't pay this.
    let cardsModule: RiftboundCardsModule | null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cardsModule = require("@tcg/riftbound-cards") as RiftboundCardsModule;
    } catch {
      cardsModule = null;
    }
    if (!cardsModule) {return { seeded: false, step };}
    const cardRegistry = cardsModule.getCardRegistry();
    const sabotageDef = cardRegistry.get("ogn-156-298");
    if (!sabotageDef) {return { seeded: false, step };}

    // Pick a non-unit card as the recycle target. Any spell works — we
    // Grab another low-cost OGN spell so it renders alongside Sabotage
    // With real card art. We DELIBERATELY avoid Sabotage itself so the
    // Two hand chips visually differ.
    const allCards = cardsModule.getAllCards();
    const targetDef =
      allCards.find(
        (c) =>
          c.cardType === "spell"
          && c.id !== "ogn-156-298"
          && (c.setId ?? "").toLowerCase() === "ogn",
      )
      ?? allCards.find((c) => c.cardType === "spell" && c.id !== "ogn-156-298")
      ?? allCards.find((c) => c.cardType === "gear");
    if (!targetDef) {return { seeded: false, step };}

    const internal = getInternalSnapshot(this.engine);
    const handZone = internal.zones?.["hand"];
    if (!handZone) {return { seeded: false, step };}

    const cardReg = getGlobalCardRegistry();
    // Stable instance ids so reseeds (same session) overwrite cleanly
    // Rather than stacking duplicates.
    const sabotageId = `sabotage-demo-${casterId}`;
    const targetId = `sabotage-target-${opponentId}`;

    // Register lookup payloads so move-enumeration sees real card data.
    const mkPayload = (def: { name: string; cardType: string } & Record<string, unknown>, instanceId: string) => ({
      abilities: def.abilities as Parameters<ReturnType<typeof getGlobalCardRegistry>["register"]>[1]["abilities"],
      cardType: def.cardType as string,
      domain: def.domain as string | string[] | undefined,
      energyCost: def.energyCost as number | undefined,
      id: instanceId,
      keywords: def.keywords as string[] | undefined,
      might: def.might as number | undefined,
      name: def.name,
      powerCost: def.powerCost as string[] | undefined,
      timing: def.timing as string | undefined,
    });
    cardReg.register(
      sabotageId,
      mkPayload(sabotageDef as unknown as { name: string; cardType: string } & Record<string, unknown>, sabotageId),
    );
    cardReg.register(
      targetId,
      mkPayload(targetDef as unknown as { name: string; cardType: string } & Record<string, unknown>, targetId),
    );

    // Helper: place a card instance into the hand zone with metadata.
    const placeInHand = (cardId: string, defId: string, owner: string) => {
      if (!handZone.cardIds.includes(cardId)) {
        handZone.cardIds.push(cardId);
      }
      internal.cards = internal.cards ?? {};
      internal.cards[cardId] = {
        controller: owner,
        definitionId: defId,
        owner,
        zone: "hand",
      };
      internal.cardMetas = internal.cardMetas ?? {};
      internal.cardMetas[cardId] = {
        buffed: false,
        combatRole: null,
        damage: 0,
        exhausted: false,
        hidden: false,
        stunned: false,
      };
    };

    placeInHand(sabotageId, "ogn-156-298", casterId);
    placeInHand(targetId, (targetDef as { id: string }).id, opponentId);

    // Bump caster's energy + body power so Sabotage is playable.
    const state = this.engine.getState();
    const casterPool = state.runePools[casterId] ?? { energy: 0, power: {} };
    const nextRunePools = {
      ...state.runePools,
      [casterId]: {
        ...casterPool,
        energy: Math.max(casterPool.energy, 2),
        power: { ...casterPool.power, body: Math.max(casterPool.power?.body ?? 0, 1) },
      },
    };
    let nextState: RiftboundGameState = {
      ...state,
      runePools: nextRunePools,
    };

    if (step === "revealed") {
      // Compute the revealed-hand snapshot: every card currently in the
      // Opponent's hand. Includes our just-placed target plus any cards
      // The engine deck-deal already put there.
      const revealed: string[] = [];
      for (const [cid, card] of Object.entries(internal.cards ?? {})) {
        if (card.owner === opponentId && card.zone === "hand") {revealed.push(cid);}
      }
      nextState = {
        ...nextState,
        pendingChoice: {
          filter: { excludeCardTypes: ["unit"] },
          onPicked: "recycle",
          prompter: casterId,
          revealed,
          revealer: opponentId,
          type: "reveal-and-pick",
        },
      } as RiftboundGameState;
    } else if (step === "resolved") {
      // Simulate the post-resolution state: the target card has been
      // Recycled (moved to bottom of opponent's main deck), and pending
      // Choice is cleared.
      const handIdx = handZone.cardIds.indexOf(targetId);
      if (handIdx !== -1) {handZone.cardIds.splice(handIdx, 1);}
      const mainDeck = internal.zones?.["mainDeck"];
      if (mainDeck && !mainDeck.cardIds.includes(targetId)) {
        // Bottom of deck per recycle semantics.
        mainDeck.cardIds.push(targetId);
      }
      const targetRec = internal.cards?.[targetId];
      if (targetRec) {targetRec.zone = "mainDeck";}
      nextState = { ...nextState, pendingChoice: undefined } as RiftboundGameState;
    }

    (this.engine as unknown as { currentState: RiftboundGameState }).currentState =
      nextState;

    return { sabotageCardId: sabotageId, seeded: true, step, targetCardId: targetId };
  }

  /**
   * Diana, Lunari vs Ezreal, Dashing showdown demo seed.
   *
   * Sets the board to:
   *   - Diana, Lunari (`unl-079-219`, 3 might, mind/blue) on `casterId`'s
   *     side of battlefield-bf-1.
   *   - Ezreal, Dashing (`sfd-082-221`, 3 might, mind/blue) on
   *     `opponentId`'s side of the same battlefield.
   *
   * Two seed steps:
   *   - `pre-attack` (default): both units on the battlefield, NO showdown
   *     active yet. The bf is uncontested. This mirrors the state right
   *     before `casterId` (turn player) declares the attack.
   *   - `showdown-open`: same board, plus the bf is contested + a
   *     combat showdown is open at bf-1 with focus = attacker. This is
   *     the state right after attack is declared. From here the headless
   *     driver passes focus (both sides) to drive `resolveFullCombat`,
   *     which fires attack/defend events → Diana + Ezreal triggers go
   *     onto the chain (APNAP order) → chain resolves.
   *
   * Generic mutation pattern matches `seedSabotageState` / `seedCombatState`.
   * No per-card logic in `executeMove` paths — once seeded, the normal
   * engine machinery runs the showdown.
   *
   * Returns instance ids of the placed units so the headless driver can
   * target them by data-testid in the SPA.
   */
  seedDianaVsEzrealShowdown(opts: {
    casterId?: string;
    opponentId?: string;
    battlefieldId?: string;
    step?: "pre-attack" | "showdown-open";
  } = {}): {
    seeded: boolean;
    dianaCardId?: string;
    ezrealCardId?: string;
    battlefieldId?: string;
    step: "pre-attack" | "showdown-open";
  } {
    const casterId = opts.casterId ?? this.playerIds[0];
    const opponentId = opts.opponentId ?? this.playerIds[1];
    const step = opts.step ?? "pre-attack";

    let cardsModule: RiftboundCardsModule | null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cardsModule = require("@tcg/riftbound-cards") as RiftboundCardsModule;
    } catch {
      cardsModule = null;
    }
    if (!cardsModule) {return { seeded: false, step };}
    const cardRegistry = cardsModule.getCardRegistry();
    const dianaDef = cardRegistry.get("unl-079-219");
    const ezrealDef = cardRegistry.get("sfd-082-221");
    if (!dianaDef || !ezrealDef) {return { seeded: false, step };}

    const state0 = this.engine.getState();
    const bfIds = Object.keys(state0.battlefields ?? {});
    const battlefieldId = opts.battlefieldId ?? bfIds[0];
    if (!battlefieldId) {return { seeded: false, step };}
    const bfZoneId = `battlefield-${battlefieldId}`;

    const internal = getInternalSnapshot(this.engine);
    const bfZone = internal.zones?.[bfZoneId];
    if (!bfZone) {return { seeded: false, step };}
    const handZone = internal.zones?.["hand"];

    const cardReg = getGlobalCardRegistry();
    const dianaId = `diana-demo-${casterId}`;
    const ezrealId = `ezreal-demo-${opponentId}`;

    const mkPayload = (
      def: { name: string; cardType: string } & Record<string, unknown>,
      instanceId: string,
    ) => ({
      abilities: def.abilities as Parameters<
        ReturnType<typeof getGlobalCardRegistry>["register"]
      >[1]["abilities"],
      cardType: def.cardType as string,
      domain: def.domain as string | string[] | undefined,
      energyCost: def.energyCost as number | undefined,
      id: instanceId,
      keywords: def.keywords as string[] | undefined,
      might: def.might as number | undefined,
      name: def.name,
      powerCost: def.powerCost as string[] | undefined,
      timing: def.timing as string | undefined,
    });
    cardReg.register(
      dianaId,
      mkPayload(
        dianaDef as unknown as { name: string; cardType: string } & Record<string, unknown>,
        dianaId,
      ),
    );
    cardReg.register(
      ezrealId,
      mkPayload(
        ezrealDef as unknown as { name: string; cardType: string } & Record<string, unknown>,
        ezrealId,
      ),
    );

    // Place each unit on the battlefield. Strip them from hand if they
    // Happen to have ended up there (real-deck random placement).
    const placeOnBf = (cardId: string, defId: string, owner: string) => {
      if (handZone) {
        const idx = handZone.cardIds.indexOf(cardId);
        if (idx !== -1) {handZone.cardIds.splice(idx, 1);}
      }
      if (!bfZone.cardIds.includes(cardId)) {bfZone.cardIds.push(cardId);}
      internal.cards = internal.cards ?? {};
      internal.cards[cardId] = {
        controller: owner,
        definitionId: defId,
        owner,
        zone: bfZoneId,
      };
      internal.cardMetas = internal.cardMetas ?? {};
      internal.cardMetas[cardId] = {
        buffed: false,
        combatRole: null,
        damage: 0,
        exhausted: false,
        hidden: false,
        stunned: false,
      };
    };
    placeOnBf(dianaId, "unl-079-219", casterId);
    placeOnBf(ezrealId, "sfd-082-221", opponentId);

    // Give the caster a stash of energy / power so any "pay 1" optional
    // Trigger (Diana's "you may pay 1 to Predict") is affordable. Spread
    // 3 of every domain in case the engine consults a different cost-domain
    // Lookup for `cost.energy = 1`.
    const state = this.engine.getState();
    const casterPool = state.runePools[casterId] ?? { energy: 0, power: {} };
    const allDomains = ["body", "mind", "calm", "chaos", "fury", "order"];
    const powerSpread: Record<string, number> = { ...casterPool.power };
    for (const d of allDomains) {
      powerSpread[d] = Math.max(powerSpread[d] ?? 0, 3);
    }
    const nextRunePools = {
      ...state.runePools,
      [casterId]: {
        ...casterPool,
        energy: Math.max(casterPool.energy, 5),
        power: powerSpread,
      },
    };
    let nextState: RiftboundGameState = {
      ...state,
      runePools: nextRunePools,
    };

    if (step === "showdown-open") {
      // Tag combat roles so the SPA's CombatPanel populates attackers/
      // Defenders. Without these, `buildCombatView` returns empty lists
      // (it filters on `cardMetas[id].combatRole`).
      const metas = internal.cardMetas!;
      metas[dianaId] = { ...metas[dianaId]!, combatRole: "attacker" };
      metas[ezrealId] = { ...metas[ezrealId]!, combatRole: "defender" };

      // Mark the bf contested by the caster, and start a combat showdown
      // At that bf with focus = caster. Mirrors the post-`contestBattlefield`
      // State.
      nextState = {
        ...nextState,
        battlefields: {
          ...nextState.battlefields,
          [battlefieldId]: {
            ...nextState.battlefields[battlefieldId],
            contested: true,
            contestedBy: casterId as PlayerId,
          },
        },
        interaction: {
          chain: nextState.interaction?.chain ?? null,
          nextChainItemId: nextState.interaction?.nextChainItemId ?? 1,
          showdownStack: [
            ...(nextState.interaction?.showdownStack ?? []),
            {
              active: true,
              attackingPlayer: casterId,
              battlefieldId,
              defendingPlayer: opponentId,
              focusPlayer: casterId,
              isCombatShowdown: true,
              passedPlayers: [],
              relevantPlayers: [casterId, opponentId],
            },
          ],
        },
      };
    }

    (this.engine as unknown as { currentState: RiftboundGameState }).currentState =
      nextState;

    return {
      battlefieldId,
      dianaCardId: dianaId,
      ezrealCardId: ezrealId,
      seeded: true,
      step,
    };
  }

  /**
   * Iter 16: directly seed a finished/game-over state for the SPA's
   * game-over screenshot scenario. Same justification as `seedCombatState`
   * — driving a real bot-vs-bot game to a winning VP threshold is slow and
   * non-deterministic on real decks, and we want the screenshot to be
   * cheap and stable.
   *
   * Effect:
   *   - Sets `state.status = "finished"`.
   *   - Sets `state.winner = winnerId`.
   *   - Bumps `state.players[winnerId].victoryPoints` to `victoryScore` so
   *     `buildView` reports the same `effectiveWinner` whether it derives
   *     game-over from `status` or from the VP threshold.
   *
   * Generic — no per-card or per-set branching. Returns the chosen winner
   * for callers to assert against.
   */
  seedFinishedState(opts: { winnerId?: string } = {}): {
    seeded: boolean;
    winnerId?: string;
  } {
    const winnerId = opts.winnerId ?? this.playerIds[0];
    if (!winnerId) {return { seeded: false };}
    const state = this.engine.getState();
    const winnerPlayer = state.players[winnerId];
    if (!winnerPlayer) {return { seeded: false };}
    const target = state.victoryScore ?? winnerPlayer.victoryPoints;
    const nextState: RiftboundGameState = {
      ...state,
      players: {
        ...state.players,
        [winnerId]: {
          ...winnerPlayer,
          victoryPoints: Math.max(winnerPlayer.victoryPoints, target),
        },
      },
      status: "finished",
      winner: winnerId as PlayerId,
    };
    (this.engine as unknown as { currentState: RiftboundGameState }).currentState =
      nextState;
    return { seeded: true, winnerId };
  }
}

/* --- view builder ---------------------------------------------------------- */

function buildView(engine: RiftboundEngine): GameView {
  const state = engine.getState();
  const internal = getInternalSnapshot(engine);

  const playerIds = Object.keys(state.players);
  const zones = internal.zones ?? {};

  // Zones are global; cards carry an `owner` field. Index cards-per-zone-per-
  // Owner once so each player summary is O(1).
  const ownerZoneCounts = countCardsByOwnerAndZone(internal);

  // Per-player base units. The "base" zone is GLOBAL in the riftbound engine
  // (zone-configs.ts defines a single `id: "base"` zone, not `base-<pid>`),
  // So we partition by `card.owner` the same way `buildHandView` does for
  // Hand cards. Cards in zone === "base" are enriched with the same card-
  // Definition lookup used by battlefield units so the SPA can show
  // Name/might/etc.
  const baseUnitsByOwner: Record<string, BattlefieldUnitView[]> = {};
  for (const pid of playerIds) {
    baseUnitsByOwner[pid] = [];
  }
  for (const [cardId, card] of Object.entries(internal.cards ?? {})) {
    if (card?.zone !== "base") {continue;}
    const bucket = baseUnitsByOwner[card.owner];
    if (!bucket) {continue;}
    const definitionId = card.definitionId ?? cardId;
    const def = getCardDefinition(cardId, definitionId);
    // Defect-1 fix: propagate per-unit exhausted from cardMetas so the
    // SPA can render exhausted units rotated 90° (TCG visual convention).
    // The authoritative live exhausted state lives on the counter system's
    // `__flags.exhausted` (see server.ts line 984+: setFlag writes there);
    // `meta.exhausted` is the initial-seed value and may be stale. Read
    // Both and OR them so the view reflects the live state.
    const meta = internal.cardMetas?.[cardId] as
      | { exhausted?: boolean; __flags?: Record<string, boolean> }
      | undefined;
    const isExhausted = Boolean(
      meta?.__flags?.exhausted ?? meta?.exhausted,
    );
    bucket.push({
      controller: card.controller ?? card.owner,
      definitionId,
      id: cardId,
      ...def,
      ...(isExhausted ? { exhausted: true } : {}),
    });
  }

  const players = playerIds.map((pid) => {
    const player = state.players[pid];
    const pool = state.runePools[pid];
    const counts = ownerZoneCounts[pid] ?? {};
    return {
      baseUnits: baseUnitsByOwner[pid] ?? [],
      deckSize: counts.mainDeck ?? 0,
      energy: pool?.energy ?? 0,
      handSize: counts.hand ?? 0,
      id: pid,
      power: { ...pool?.power },
      runeDeckSize: counts.runeDeck ?? 0,
      trashSize: counts.trash ?? 0,
      victoryPoints: player?.victoryPoints ?? 0,
      xp: player?.xp ?? 0,
    };
  });

  // Iter-N+1: enumerate gears in play for the TargetPicker. Gears live in
  // The global `base` zone (alongside units) or, when "attached" to a
  // Battlefield unit, in the per-battlefield zone. We classify by the
  // Card's registered `cardType` so synthetic / unregistered cards drop
  // Out cleanly. `attachedToUnitId` is left undefined for now — the engine
  // Doesn't expose a unit↔gear attachment map, so a future pass can fill
  // This in once that link exists.
  const gearsInPlay: GameView["gearsInPlay"] = [];
  for (const [cardId, card] of Object.entries(internal.cards ?? {})) {
    if (!card) {continue;}
    const z = card.zone;
    const inBase = z === "base";
    const inBattlefield = typeof z === "string" && z.startsWith("battlefield-");
    if (!inBase && !inBattlefield) {continue;}
    let cardType: string | undefined;
    try {
      cardType = getGlobalCardRegistry().get(cardId)?.cardType;
    } catch {
      cardType = undefined;
    }
    if (cardType !== "gear" && cardType !== "equipment") {continue;}
    const definitionId = card.definitionId ?? cardId;
    const def = getCardDefinition(cardId, definitionId);
    gearsInPlay.push({
      controller: card.controller ?? card.owner,
      definitionId,
      id: cardId,
      location: inBase ? "base" : (z as string).slice("battlefield-".length),
      ...(def.name ? { name: def.name } : {}),
      ...(def.imageUrl ? { imageUrl: def.imageUrl } : {}),
    });
  }

  // Iter-Q: enumerate trash zone for the card-in-trash TargetPicker variant.
  // Trash is a single global zone (`trash`), with cards tagged by owner — same
  // Pattern as base/hand above. We surface cardType so the picker can filter
  // By the spell's target sub-type (e.g. only show units when the descriptor
  // Is `{type: "unit", location: "trash"}`).
  const cardsInTrash: GameView["cardsInTrash"] = [];
  for (const [cardId, card] of Object.entries(internal.cards ?? {})) {
    if (!card || card.zone !== "trash") {continue;}
    let cardType: string | undefined;
    try {
      cardType = getGlobalCardRegistry().get(cardId)?.cardType;
    } catch {
      cardType = undefined;
    }
    const definitionId = card.definitionId ?? cardId;
    const def = getCardDefinition(cardId, definitionId);
    cardsInTrash.push({
      definitionId,
      id: cardId,
      owner: card.owner,
      ...(cardType ? { cardType } : {}),
      ...(def.name ? { name: def.name } : {}),
      ...(def.imageUrl ? { imageUrl: def.imageUrl } : {}),
    });
  }

  // Iter-Q / Iter-RunePoolUI: enumerate runePool for both the rune-target
  // TargetPicker AND the visible RunePool component on the play page. The
  // RunePool needs per-rune `domain` (chip color) + `exhausted` (rotation)
  // So players can SEE each rune individually and CLICK to tap. The
  // RunePool zone is global; cards are tagged by owner. Domain comes from
  // Either the engine registry (preferred — populated by registerDeckCardsWithEngine)
  // Or the raw `@tcg/riftbound-cards` module as a fallback. Exhausted state
  // Mirrors the unit pattern: __flags.exhausted wins, seed meta.exhausted falls back.
  const runesInPool: GameView["runesInPool"] = [];
  for (const [cardId, card] of Object.entries(internal.cards ?? {})) {
    if (!card || card.zone !== "runePool") {continue;}
    const definitionId = card.definitionId ?? cardId;
    const def = getCardDefinition(cardId, definitionId);
    // Domain lookup. Engine registry first (per-instance), raw module second
    // (for synthetic / unregistered decks). Both paths use the same extractor
    // Logic that `getCardDefinition` does.
    let domain: string | undefined;
    try {
      const lookup = getGlobalCardRegistry().get(cardId);
      const dom = (lookup as { domain?: string | string[] } | undefined)?.domain;
      if (typeof dom === "string") {domain = dom;}
      else if (Array.isArray(dom) && dom.length > 0) {domain = dom[0];}
    } catch { /* Registry miss — try raw next */ }
    if (!domain) {
      const cardsModule = getRiftboundCardsModule();
      if (cardsModule) {
        try {
          const reg = cardsModule.getCardRegistry();
          let rawDef = reg.get(definitionId);
          if (!rawDef) {
            const extracted = extractDefIdFromInstanceId(definitionId);
            if (extracted) {rawDef = reg.get(extracted);}
          }
          const rawDom = (rawDef as { domain?: string | string[] } | undefined)?.domain;
          if (typeof rawDom === "string") {domain = rawDom;}
          else if (Array.isArray(rawDom) && rawDom.length > 0) {domain = rawDom[0];}
        } catch { /* Synthetic deck — no domain */ }
      }
    }
    // Exhausted state — mirror the unit pattern.
    const meta = internal.cardMetas?.[cardId] as
      | { exhausted?: boolean; __flags?: Record<string, boolean> }
      | undefined;
    const isExhausted = Boolean(
      meta?.__flags?.exhausted ?? meta?.exhausted,
    );
    runesInPool.push({
      definitionId,
      id: cardId,
      owner: card.owner,
      ...(def.name ? { name: def.name } : {}),
      ...(def.imageUrl ? { imageUrl: def.imageUrl } : {}),
      ...(domain ? { domain: domain.toLowerCase() } : {}),
      ...(isExhausted ? { exhausted: true } : {}),
    });
  }

  // Battlefields: derive units from per-battlefield zones (`battlefield-<id>`).
  // Phase B batch 26 JJJ: also resolve the BF card's own definition (name +
  // ImageUrl) so the SPA can render real BF card art behind the tile.
  const battlefields = Object.entries(state.battlefields).map(([bfId, bf]) => {
    const bfZoneId = `battlefield-${bfId}`;
    const cardIds = zones[bfZoneId]?.cardIds ?? [];
    const units = cardIds.map((cid) => {
      const card = internal.cards?.[cid];
      const definitionId = card?.definitionId ?? cid;
      const def = getCardDefinition(cid, definitionId);
      // Slice 5 (UX affordances): compute effective vs base might so the
      // SPA can surface a +N/-N counter badge when buffs/equipment apply.
      const meta = internal.cardMetas?.[cid] as
        | {
            buffed?: boolean;
            mightModifier?: number;
            combatMightModifier?: number;
            staticMightBonus?: number;
            equippedWith?: readonly string[];
            exhausted?: boolean;
            damage?: number;
            __flags?: Record<string, boolean>;
          }
        | undefined;
      const mightInfo = computeEffectiveMightAppLayer(cid, meta);
      // When effective differs from base, override `might` with the
      // Effective value so combat-panel + BF chip displays match the live
      // Value; `baseMight` carries the printed value for the +N badge math.
      const mightFields =
        mightInfo.baseMight !== undefined
          ? {
              baseMight: mightInfo.baseMight,
              might: mightInfo.effectiveMight ?? mightInfo.baseMight,
            }
          : {};
      // Defect-1 fix: read live exhausted from `__flags.exhausted` (where
      // The counter system writes via setFlag — see server.ts line 984+),
      // Falling back to the seed `meta.exhausted` so older fixtures still
      // Work. SPA rotates the chip 90° when this is true.
      const isExhausted = Boolean(
        meta?.__flags?.exhausted ?? meta?.exhausted,
      );
      // Admin feedback A2: surface damage + buff/might-modifier counters so
      // The BattlefieldList can render visible chips. Damage is a raw counter
      // From the engine; counters folds the binary `buffed` flag together
      // With any positive `mightModifier` so a single green "+N" chip
      // Communicates accumulated buffs. Both omitted when zero so falsy
      // Checks in the view layer chip-suppress correctly.
      const damageVal = typeof meta?.damage === "number" ? meta.damage : 0;
      const buffCount =
        (meta?.buffed ? 1 : 0)
        + (typeof meta?.mightModifier === "number" && meta.mightModifier > 0
          ? meta.mightModifier
          : 0);
      return {
        controller: card?.controller ?? "",
        definitionId,
        id: cid,
        ...def,
        ...mightFields,
        ...(isExhausted ? { exhausted: true } : {}),
        ...(damageVal > 0 ? { damage: damageVal } : {}),
        ...(buffCount > 0 ? { counters: buffCount } : {}),
      };
    });
    // The battlefield IS itself a card — bfId is the CardId (see
    // BattlefieldState.id: CardId). For real decks, `real-decks.ts` registers
    // BFs under stable instance ids (`bf-1`, `bf-2`) but stores the *real*
    // DefId in `internal.cards[bfId].definitionId`, so we use that for the
    // ImageUrl lookup (the registered engine payload supplies the name).
    const bfCardRec = internal.cards?.[bfId];
    const bfRealDefId = bfCardRec?.definitionId ?? bfId;
    const bfDef = getCardDefinition(bfId, bfRealDefId);
    return {
      contested: bf.contested ?? false,
      controller: bf.controller ?? null,
      id: bfId,
      ...(bfDef.name ? { name: bfDef.name } : {}),
      ...(bfDef.imageUrl ? { imageUrl: bfDef.imageUrl } : {}),
      ...(bfDef.rulesText ? { rulesText: bfDef.rulesText } : {}),
      units,
    };
  });

  const {phase} = state.turn;
  const phaseLabel =
    (PHASE_LABELS as Record<string, string>)[phase] ?? String(phase);

  // Phase B batch 23 Goal D — snapshot-lag fix.
  //
  // `EngineSession.isGameOver()` already derives game-over from BOTH
  // `state.status === "finished"` AND the VP threshold (any player at
  // `victoryScore`). The view, however, used to mirror `state.status`
  // Verbatim, which meant the engine's "I haven't run the end-condition
  // Hook yet" lag would leak into the SPA as `status:"playing"` even
  // When a winning `scorePoint` had just been applied. The SPA's
  // `isGameOver` checks `view.winner !== null || view.status === "finished"`,
  // And the BotDriver's outer loop also reads the view — so a stale
  // `status:"playing"` would let the bot keep stepping past a finished
  // Game.
  //
  // Fix: derive `effectiveStatus` + `effectiveWinner` from VP if the engine
  // Hasn't finalised yet. This is the SAME source-of-truth `isGameOver()`
  // Already uses; the view simply mirrors it now.
  let effectiveStatus: RiftboundGameState["status"] = state.status;
  let effectiveWinner: string | null = state.winner ?? null;
  if (effectiveStatus !== "finished") {
    for (const p of players) {
      if (p.victoryPoints >= state.victoryScore) {
        effectiveStatus = "finished";
        if (!effectiveWinner) {effectiveWinner = p.id;}
        break;
      }
    }
  }

  const combat = buildCombatView(state, internal, phase);
  const chain = buildChainView(state, internal);
  // Pending-choice (Sabotage et al.) — surface to the SPA so it can reveal
  // The revealer's hand.
  const pc = (
    state as RiftboundGameState & {
      pendingChoice?:
        | {
            type: "reveal-and-pick";
            prompter: string;
            revealer: string;
            revealed: string[];
            onPicked: "recycle" | "banish" | "discard";
            filter?: { excludeCardTypes?: readonly string[] };
          }
        | {
            type: "look-and-pick";
            prompter: string;
            revealer: string;
            revealed: string[];
            onPicked: "to-hand" | "to-trash" | "to-play" | "banish" | "recycle";
            onUnpicked: "recycle" | "to-top" | "trash";
          }
        | {
            type: "pick-mode";
            prompter: string;
            sourceCardId: string;
            sourceZone?: string;
            options: readonly {
              index: number;
              label: string;
              effect: unknown;
            }[];
          };
    }
  ).pendingChoice;
  let pendingChoice:
    | {
        type: "reveal-and-pick";
        prompter: string;
        revealer: string;
        revealed: string[];
        onPicked: "recycle" | "banish" | "discard";
        excludedCardTypes?: readonly string[];
      }
    | {
        type: "look-and-pick";
        prompter: string;
        revealer: string;
        revealed: string[];
        onPicked: "to-hand" | "to-trash" | "to-play" | "banish" | "recycle";
        onUnpicked: "recycle" | "to-top" | "trash";
        revealedCards: {
          id: string;
          definitionId: string;
          name?: string;
          imageUrl?: string;
          cardType?: string;
        }[];
      }
    | {
        type: "pick-mode";
        prompter: string;
        sourceCardId: string;
        sourceCardName?: string;
        options: { index: number; label: string }[];
      }
    | undefined;
  if (pc?.type === "pick-mode") {
    // Don't surface `effect` (the opaque ExecutableEffect payload) to
    // The SPA — the client only needs `index` and `label` to render the
    // Modal; the chosen index is round-tripped via `resolvePendingChoice`
    // And the engine's stored `effect` fires server-side.
    let sourceCardName: string | undefined;
    try {
      const sourceCard = internal.cards?.[pc.sourceCardId];
      const definitionId = sourceCard?.definitionId ?? pc.sourceCardId;
      const def = getCardDefinition(pc.sourceCardId, definitionId);
      sourceCardName = def.name;
    } catch {
      sourceCardName = undefined;
    }
    pendingChoice = {
      options: pc.options.map((o) => ({ index: o.index, label: o.label })),
      prompter: pc.prompter,
      sourceCardId: pc.sourceCardId,
      type: "pick-mode" as const,
      ...(sourceCardName ? { sourceCardName } : {}),
    };
  } else if (pc?.type === "look-and-pick") {
    const revealedCards: {
      id: string;
      definitionId: string;
      name?: string;
      imageUrl?: string;
      cardType?: string;
    }[] = [];
    for (const cardId of pc.revealed) {
      const card = internal.cards?.[cardId];
      const definitionId = card?.definitionId ?? cardId;
      const def = getCardDefinition(cardId, definitionId);
      let cardType: string | undefined;
      try {
        cardType = getGlobalCardRegistry().get(cardId)?.cardType;
      } catch {
        cardType = undefined;
      }
      revealedCards.push({
        definitionId,
        id: cardId,
        ...(def.name ? { name: def.name } : {}),
        ...(def.imageUrl ? { imageUrl: def.imageUrl } : {}),
        ...(cardType ? { cardType } : {}),
      });
    }
    pendingChoice = {
      onPicked: pc.onPicked,
      onUnpicked: pc.onUnpicked,
      prompter: pc.prompter,
      revealed: [...pc.revealed],
      revealedCards,
      revealer: pc.revealer,
      type: "look-and-pick" as const,
    };
  } else if (pc) {
    pendingChoice = {
      excludedCardTypes: pc.filter?.excludeCardTypes
        ? [...pc.filter.excludeCardTypes]
        : undefined,
      onPicked: pc.onPicked,
      prompter: pc.prompter,
      revealed: [...pc.revealed],
      revealer: pc.revealer,
      type: "reveal-and-pick" as const,
    };
  }

  return {
    battlefields,
    cardsInTrash,
    ...(chain ? { chain } : {}),
    ...(combat ? { combat } : {}),
    ...(pendingChoice ? { pendingChoice } : {}),
    gameId: state.gameId,
    gearsInPlay,
    phaseStrip: TURN_PHASE_STRIP.map((p) => ({ id: p.id, label: p.label })),
    players,
    runesInPool,
    status: effectiveStatus,
    turn: {
      activePlayer: state.turn.activePlayer,
      number: state.turn.number,
      phase,
      phaseLabel,
    },
    victoryScore: state.victoryScore,
    winner: effectiveWinner,
  };
}

/**
 * Build the CombatView from `state.interaction.showdownStack[top]`. Returns
 * `undefined` if there's no active showdown — the SPA's CombatPanel will
 * simply not render in that case.
 *
 * Attackers/defenders are derived by scanning the showdown battlefield's
 * card list and partitioning by `cardMetas[cardId].combatRole`. This is the
 * authoritative source per `types/game-state.ts` (the `CombatRole` field on
 * RiftboundCardMeta is set by the combat moves).
 */
function buildCombatView(
  state: RiftboundGameState,
  internal: InternalSnapshot,
  phase: string,
): CombatView | undefined {
  const {interaction} = state;
  if (!interaction) {return undefined;}
  const stack = interaction.showdownStack ?? [];
  if (stack.length === 0) {return undefined;}
  const top = stack[stack.length - 1];
  // QA v2 Defect 2 (D-showdown-no-ui): previously we returned undefined as
  // Soon as `top.active === false`, but the engine flips that flag during
  // The focus-pass loop (rules 545-553) — both players pass focus, then the
  // Stack frame becomes inactive while the strike effects still run. Keep
  // The CombatView populated as long as there's a top frame with a
  // Battlefield id so the SPA renders the attackers/defenders panel for
  // The duration of the showdown, not just the assign-roles window.
  if (!top || !top.battlefieldId) {return undefined;}

  const bfZoneId = `battlefield-${top.battlefieldId}`;
  const cardIds = internal.zones?.[bfZoneId]?.cardIds ?? [];
  const attackers: CombatUnitView[] = [];
  const defenders: CombatUnitView[] = [];
  for (const cid of cardIds) {
    const card = internal.cards?.[cid];
    if (!card) {continue;}
    const meta = internal.cardMetas?.[cid];
    const role = meta?.combatRole;
    if (role !== "attacker" && role !== "defender") {continue;}
    const def = getCardDefinition(cid, card.definitionId);
    const unit: CombatUnitView = stripUndefined({
      controller: card.controller ?? card.owner,
      definitionId: card.definitionId,
      id: cid,
      might: def.might,
      name: def.name,
    });
    if (role === "attacker") {attackers.push(unit);}
    else {defenders.push(unit);}
  }

  return stripUndefined({
    attackers,
    attackingPlayer: top.attackingPlayer,
    battlefieldId: top.battlefieldId,
    defenders,
    defendingPlayer: top.defendingPlayer,
    focusOwner: top.focusPlayer,
    isCombat: top.isCombatShowdown,
    phase,
  });
}

/**
 * Build the ChainView from `state.interaction.chain`. Returns `undefined`
 * when no chain is active or it has no items.
 *
 * Each chain item is summarised via the engine card registry (for source
 * card name) plus a generic `[Spell]/[Ability]/[Permanent]` tag — the
 * underlying `effect` is opaque to the SPA layer, so we fall back to the
 * item `type`. Countered items are flagged so the UI can render them
 * struck-through.
 */
function buildChainView(
  state: RiftboundGameState,
  internal: InternalSnapshot,
): ChainView | undefined {
  const {interaction} = state;
  if (!interaction) {return undefined;}
  const {chain} = interaction;
  if (!chain || !chain.items || chain.items.length === 0) {return undefined;}

  const items: ChainItemView[] = chain.items.map((it) => {
    const card = internal.cards?.[it.cardId];
    const def = card
      ? getCardDefinition(it.cardId, card.definitionId)
      : ({} as CardDefinitionView);
    const cardName = def.name;
    const tag =
      it.type === "spell" ? "Spell" : (it.type === "ability" ? "Ability" : "Permanent");
    const summary = cardName ? `[${tag}] ${cardName}` : `[${tag}] ${it.cardId}`;
    return stripUndefined({
      countered: Boolean(it.countered),
      id: it.id,
      source: stripUndefined({
        cardId: it.cardId,
        cardName,
        playerId: it.controller,
      }),
      summary,
      type: it.type,
    });
  });

  return {
    focusOwner: chain.activePlayer ?? "",
    items,
  };
}

function countCardsInZone(
  zones: Record<string, { cardIds: string[]; config: unknown }>,
  zoneId: string,
): number {
  return zones[zoneId]?.cardIds?.length ?? 0;
}

/**
 * Count cards grouped by owner then by zone. The Riftbound zones are global
 * (one `hand`, one `mainDeck`, …) and cards carry their owner, so per-player
 * sizes have to be derived by filtering the card index.
 */
function countCardsByOwnerAndZone(
  internal: InternalSnapshot,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  const cards = internal.cards ?? {};
  for (const card of Object.values(cards)) {
    if (!card || !card.owner || !card.zone) {continue;}
    const byZone = out[card.owner] ?? (out[card.owner] = {});
    byZone[card.zone] = (byZone[card.zone] ?? 0) + 1;
  }
  return out;
}
