/**
 * Typed fetch client for the v2 JSON API exposed by `server.ts`.
 *
 * The legacy `/api/demo/*` routes return HTML snippets (server-rendered);
 * the v2 routes return JSON so the SPA can re-render in React.
 */

export interface GameViewPlayer {
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
   * Units currently in this player's `base` zone (home zone for units
   * played but not yet deployed to a battlefield). Phase B batch 24 AAA —
   * threaded through from the engine so `BaseZone` can render real units
   * instead of always falling back to "(empty)". May be missing on legacy
   * mocked responses; callers should default to `[]`.
   */
  readonly baseUnits?: readonly BattlefieldUnit[];
}

/**
 * Card-definition fields copied through the API when the server can resolve
 * the underlying card definition. All optional — synthetic test decks have
 * no real-world definition, so the UI degrades gracefully to id-only.
 */
export interface CardDefinitionFields {
  readonly name?: string;
  readonly cardType?: string;
  readonly might?: number;
  readonly energyCost?: number;
  readonly powerCost?: readonly string[];
  readonly rulesText?: string;
  /**
   * One-line ability summaries (max 5). See engine-session
   * `summariseAbilities` for the format spec:
   *   "[Trigger: <event>] <effect-summary>"
   *   "[Activated] <cost> → <effect-summary>"
   *   "[Static] <effect-summary>"
   *   "[Keyword] <name>[ N]"
   *   "[Spell] <effect-summary>"
   */
  readonly abilities?: readonly string[];
  /**
   * Phase B batch 26 JJJ: official card-art URL (Riot CMS gallery). The SPA
   * renders this as a real image on hand chips, BF units, and BaseZone tiles
   * (RiftAtlas parity). Falls back to the text chip when undefined.
   */
  readonly imageUrl?: string;
}

export interface BattlefieldUnit extends CardDefinitionFields {
  readonly id: string;
  readonly definitionId: string;
  readonly controller: string;
  /**
   * Slice 5 (UX affordances): the unit's printed (base) might. `might`
   * (inherited from CardDefinitionFields) is the EFFECTIVE might after
   * Buffs/equipment/static abilities. The SPA renders a small +N/-N badge
   * Whenever `might !== baseMight`. Optional — synthetic decks have no
   * Registered definition so neither field is set.
   */
  readonly baseMight?: number;
  /**
   * Defect-1 fix: TCG visual convention — exhausted ("tapped") units render
   * rotated 90° clockwise. Sourced from
   * `engine.internalState.cardMetas[id].exhausted`. Optional; defaults to
   * `false` when missing (synthetic decks / pre-exhaustion-aware fixtures).
   */
  readonly exhausted?: boolean;
  /**
   * Admin feedback (2026-05-14, item A2): damage counters accumulated on the
   * unit. Sourced from `internalState.cardMetas[id].damage`. Surfaced as a
   * small red chip on the unit chip so the player can see "this unit has
   * taken N damage this combat / phase". Optional — synthetic decks default
   * to 0 (and we render no chip).
   */
  readonly damage?: number;
  /**
   * Admin feedback (2026-05-14, item A2): non-damage counters (+1/+1
   * counters, buff counters, etc.). The engine currently surfaces a binary
   * `buffed` flag; we promote that to a count when available, plus expose a
   * generic `counters` map for future per-type tokens. Optional.
   */
  readonly counters?: number;
}

export interface GameViewBattlefield {
  readonly id: string;
  readonly controller: string | null;
  readonly contested: boolean;
  readonly units: readonly BattlefieldUnit[];
  /** Phase B batch 26 JJJ: BF card display name. */
  readonly name?: string;
  /** Phase B batch 26 JJJ: BF card art URL — rendered as tile background. */
  readonly imageUrl?: string;
  /**
   * Verbatim rules text for the battlefield card (multi-line, newline-
   * preserved). The SPA renders this on the tile so a player doesn't have
   * to hover or click through to read what the BF actually does.
   */
  readonly rulesText?: string;
}

/**
 * One unit currently participating in combat. See engine-session
 * `CombatUnitView`. `name`/`might` are optional — synthetic decks degrade
 * to id-only.
 */
export interface CombatUnit {
  readonly id: string;
  readonly definitionId: string;
  readonly controller: string;
  readonly name?: string;
  readonly might?: number;
  readonly imageUrl?: string;
}

/**
 * Combat / showdown snapshot. Present (i.e. not undefined) only when the
 * engine has an active showdown. Phase B batch 25 EEE — see CombatPanel.
 */
export interface CombatView {
  readonly phase: string;
  readonly battlefieldId: string;
  readonly focusOwner: string;
  readonly attackingPlayer?: string;
  readonly defendingPlayer?: string;
  readonly isCombat: boolean;
  readonly attackers: readonly CombatUnit[];
  readonly defenders: readonly CombatUnit[];
  /**
   * Iter-15 Gap 1: explicit attacker→defender pair assignments, when the
   * engine surfaces them. Today the engine only tracks `cardMetas[id]
   * .combatRole` ("attacker" | "defender" | null) on the active showdown
   * battlefield — there is no per-pair mapping in ShowdownState or
   * RiftboundCardMeta. Until the engine exposes one (e.g. via a damage-
   * assignment hook or a `combatTarget` meta field), this stays
   * `undefined` and the SPA falls back to a cartesian-product visual.
   * Documenting the field on the view contract now so the wiring lands in
   * a single small change once the engine catches up.
   */
  readonly pairs?: readonly {
    readonly attackerId: string;
    readonly defenderId: string;
  }[];
}

/** One item on the chain stack — used by ChainPanel. */
export interface ChainItem {
  readonly id: string;
  readonly source: {
    readonly playerId: string;
    readonly cardId: string;
    readonly cardName?: string;
  };
  readonly summary: string;
  readonly countered: boolean;
  readonly type: "spell" | "permanent" | "ability";
}

/** Chain (spell stack) snapshot. items in LIFO order — last resolves first. */
export interface ChainView {
  readonly items: readonly ChainItem[];
  readonly focusOwner: string;
}

export interface GameView {
  readonly gameId: string;
  readonly status: string;
  readonly winner: string | null;
  readonly victoryScore: number;
  readonly turn: {
    readonly number: number;
    readonly activePlayer: string;
    readonly phase: string;
    readonly phaseLabel: string;
  };
  readonly phaseStrip: readonly { id: string; label: string }[];
  readonly players: readonly GameViewPlayer[];
  readonly battlefields: readonly GameViewBattlefield[];
  /**
   * Iter-N+1: gears and equipment currently in play (base zone or attached
   * to a battlefield unit). Surfaced as a flat list so the TargetPicker can
   * enumerate gear targets for spells like Turn to Dust whose
   * `target.type === "gear"`.
   */
  readonly gearsInPlay?: readonly {
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
   * Iter-Q: cards in any player's trash, flat list (owner-tagged). Used by
   * the TargetPicker's card-in-trash variant for spells targeting trash
   * (e.g. Guerilla Warfare, Cemetery Attendant).
   */
  readonly cardsInTrash?: readonly {
    readonly id: string;
    readonly definitionId: string;
    readonly owner: string;
    readonly cardType?: string;
    readonly name?: string;
    readonly imageUrl?: string;
  }[];
  /**
   * Iter-Q: runes in any player's runePool, flat list (owner-tagged). Used
   * by the TargetPicker's rune variant for spells targeting runes.
   */
  readonly runesInPool?: readonly {
    readonly id: string;
    readonly definitionId: string;
    readonly owner: string;
    readonly name?: string;
    readonly imageUrl?: string;
  }[];
  /** Phase B batch 25 EEE: optional combat snapshot when a showdown is active. */
  readonly combat?: CombatView;
  /** Phase B batch 25 EEE: optional chain snapshot when items are on the chain. */
  readonly chain?: ChainView;
  /**
   * Pending-choice snapshot (e.g. Sabotage). When present the prompter must
   * resolve the choice; SPA reveals the revealer's hand.
   */
  readonly pendingChoice?: {
    readonly type: "reveal-and-pick";
    readonly prompter: string;
    readonly revealer: string;
    readonly revealed: readonly string[];
    readonly onPicked: "recycle" | "banish" | "discard";
    readonly excludedCardTypes?: readonly string[];
  };
}

export interface TrailStep {
  readonly seq: number;
  readonly playerId: string;
  readonly moveId: string;
  readonly params: Record<string, unknown>;
  readonly success: boolean;
  readonly error?: string;
  /**
   * Slice 4 (undo/rewind): true when this step was rewound by a later
   * `POST /api/v2/undo` call. The MoveLog renders these with a
   * strike-through and slightly dimmed color so a viewer can see the
   * full trail (including undone moves) at a glance.
   */
  readonly undone?: boolean;
}

/**
 * Slice 4 (undo/rewind): per-session undo affordance state, threaded
 * through the SPA state response. The SPA uses `canUndoBy[playerId]` to
 * decide whether to enable the local player's "Undo" button, and
 * `lastMove.label` to label the button ("Undo (Sabotage)").
 */
export interface UndoState {
  readonly canUndoBy: Record<string, boolean>;
  readonly undoCount: number;
  readonly lastMove?: {
    readonly moveId: string;
    readonly playerId: string;
    readonly label: string;
    readonly stepSeq: number;
    readonly cardId?: string;
  };
}

export interface HandCard extends CardDefinitionFields {
  readonly id: string;
  readonly definitionId: string;
  /**
   * Battlefield-style location ids legal for this card right now ("base",
   * "player-1-bf-1", etc.). Empty array = no legal play right now.
   * Sourced from the engine's `playUnit` legal moves; non-unit cards
   * generally return [] here and the SPA falls back to a single click.
   */
  readonly legalLocations?: readonly string[];
  /**
   * Phase B batch 25 DDD: true when this spell needs an explicit non-self
   * target. The SPA uses this to decide whether to open the TargetPicker.
   * Derived from the registered card's first spell-ability `effect.target`.
   */
  readonly requiresTarget?: boolean;
  /**
   * Phase B batch 25 DDD: per-card list of legal target tuples, sourced from
   * `playSpell` enumeration. Each inner array is one legal `targets` array
   * the UI may forward to `playFromHand`. The TargetPicker uses the
   * FLATTENED union of these tuples to restrict the option set to
   * engine-validated ids. Empty / absent = picker falls back to "every
   * battlefield unit" (legacy).
   */
  readonly legalTargets?: readonly (ReadonlyArray<string>)[];
  /**
   * Iter-N: spell-effect target descriptor (just `type` and `which`). The
   * SPA uses this to pick the TargetPicker variant — unit-target spells
   * get the battlefield-unit picker (legacy), player-target spells (e.g.
   * Sabotage's `{type:"player", which:"opponent"}`) get the You/Opponent
   * picker. Absent on units / gear / no-target spells.
   */
  readonly targetDescriptor?: {
    readonly type: string;
    readonly which?: string;
    /**
     * Iter-Q: location axis (`"trash"` / `"hand"` / `"deck"` / `"battlefield"`).
     * The SPA uses this together with `type` to choose between the
     * card-in-trash / card-in-hand / card-in-deck TargetPicker variants.
     */
    readonly location?: string;
    /**
     * Iter-Q: controller axis (`"friendly"` / `"enemy"` / `"any"`). Used by
     * the SPA to filter trash/hand/rune candidates to the legal side.
     */
    readonly controller?: string;
  };
}

/**
 * Phase B batch 24 AAA: server-reported "whose turn is it really" + which
 * top-level buttons are legal right now. The SPA uses these to disable
 * End Turn / Step Bot when the engine would reject the action, and to
 * surface a transient toast when a move comes back illegal.
 */
export interface ActionsLegal {
  readonly endTurn: boolean;
  readonly stepBot: boolean;
  /**
   * Phase B batch 26 GGG — combat / chain action legality flags. All
   * optional for backward compatibility with legacy mocked StateResponse
   * fixtures in tests; defaults are `false`.
   */
  readonly contestBattlefield?: boolean;
  readonly startShowdown?: boolean;
  readonly passShowdownFocus?: boolean;
  readonly passChainPriority?: boolean;
  readonly resolveCombat?: boolean;
  readonly assignAttacker?: boolean;
  readonly assignDefender?: boolean;
}

export interface StateResponse {
  readonly view: GameView;
  readonly trail: readonly TrailStep[];
  readonly hand: Record<string, readonly HandCard[]>;
  readonly isGameOver: boolean;
  readonly whoseTurnNow?: "human" | "bot";
  readonly actionsLegal?: ActionsLegal;
  /** Slice 4 (undo/rewind): per-session undo affordance state. */
  readonly undo?: UndoState;
}

export interface MoveResponse {
  readonly ok: boolean;
  readonly view: GameView;
  readonly trail: readonly TrailStep[];
  readonly hand: Record<string, readonly HandCard[]>;
  readonly isGameOver: boolean;
  readonly error?: string;
  readonly whoseTurnNow?: "human" | "bot";
  readonly actionsLegal?: ActionsLegal;
  /** Slice 4 (undo/rewind): per-session undo affordance state. */
  readonly undo?: UndoState;
  /**
   * Set on `/api/v2/step/:id` when Step Bot was called but the active
   * player is human — the server refuses to advance and includes a
   * human-readable `reason`. The SPA surfaces this as a transient toast.
   */
  readonly skipped?: boolean;
  readonly reason?: string;
  /**
   * Slice 4 (undo/rewind): set on a successful POST /api/v2/undo. The
   * SPA uses this to render a "Move undone" toast naming the move.
   */
  readonly undone?: {
    readonly moveId: string;
    readonly playerId: string;
    readonly label: string;
    readonly stepSeq: number;
  };
}

export interface MoveRequest {
  readonly moveId: string;
  readonly playerId?: string;
  /** Convenience top-level fields the server merges into `params`. */
  readonly cardId?: string;
  readonly location?: string;
  readonly params?: Record<string, unknown>;
}

const BASE = "/api/v2";

export async function fetchState(sessionId: string): Promise<StateResponse> {
  const res = await fetch(`${BASE}/state/${encodeURIComponent(sessionId)}`);
  if (!res.ok) {
    throw new Error(`fetchState failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as StateResponse;
}

export async function postMove(
  sessionId: string,
  move: MoveRequest,
): Promise<MoveResponse> {
  const res = await fetch(`${BASE}/move/${encodeURIComponent(sessionId)}`, {
    body: JSON.stringify(move),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`postMove failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as MoveResponse;
}

export async function postStep(sessionId: string): Promise<MoveResponse> {
  const res = await fetch(`${BASE}/step/${encodeURIComponent(sessionId)}`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`postStep failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as MoveResponse;
}

/**
 * Slice 4 (undo/rewind): rewind the local player's last move. Server
 * Validates the same gates `canUndo` checks (own-move only, no opponent
 * Action since, no chain item resolved); on success it broadcasts the
 * Rewound state via SSE so the opponent's UI catches up too.
 */
/**
 * Slice 5 (UX affordances): ping payload. Sent by `postPing` and received
 * Via the `ping` SSE event. Coords are optional (right-click position) for
 * Future cursor-anchored animations; today the receiver just adds a CSS
 * Pulse class to the element matching `targetId`.
 */
export interface PingPayload {
  readonly playerId: string;
  readonly targetType: "card" | "zone";
  readonly targetId: string;
  readonly ts: number;
  readonly x?: number;
  readonly y?: number;
}

/**
 * Slice 5 (UX affordances): broadcast a ping for the named card/zone. The
 * Server fans the event out over the existing SSE stream as a named `ping`
 * Event (distinct from the `state` event channel). Pings are NOT persisted
 * Into game state.
 */
export async function postPing(
  sessionId: string,
  ping: {
    readonly playerId: string;
    readonly targetType: "card" | "zone";
    readonly targetId: string;
    readonly x?: number;
    readonly y?: number;
  },
): Promise<{ ok: boolean; error?: string; ping?: PingPayload }> {
  const res = await fetch(`${BASE}/ping/${encodeURIComponent(sessionId)}`, {
    body: JSON.stringify(ping),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!res.ok) {
    return { error: `postPing failed: ${res.status} ${res.statusText}`, ok: false };
  }
  return (await res.json()) as { ok: boolean; error?: string; ping?: PingPayload };
}

export async function postUndo(
  sessionId: string,
  playerId: string,
): Promise<MoveResponse> {
  const res = await fetch(`${BASE}/undo/${encodeURIComponent(sessionId)}`, {
    body: JSON.stringify({ playerId }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`postUndo failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as MoveResponse;
}
