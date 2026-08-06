/**
 * L3 — Scenario builder.
 *
 * A fluent builder accumulates a serialisable `ScenarioSpec`; `build()`
 * materialises it into a live RuleEngine positioned mid-game (given seat,
 * turn, phase, resources, battlefields and arbitrary card placements) and
 * wraps it in a `Game`.
 *
 * Placement writes engine internals directly — that is SETUP. Everything
 * the test then does goes through real moves via the harness.
 */

import { RuleEngine } from "@tcg/core";
import type { StaticAbilityContext } from "../abilities/static-abilities";
import { recalculateStaticEffects } from "../abilities/static-abilities";
import { riftboundDefinition } from "../game-definition/definition";
import { CardDefinitionRegistry, setGlobalCardRegistry, getGlobalCardRegistry } from "../operations/card-lookup";
import type { GamePhase, RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../types";
import { basicRuneDef, domainsOf, FILLER_UNIT_DEF, loadDefaultCardPool, toLookupPayload } from "./card-pool";
import type { HarnessEngine } from "./internal";
import { getInternalState, peekCurrentState, replaceCurrentState } from "./internal";
import type { Invariant } from "./invariants";
import { DEFAULT_INVARIANTS } from "./invariants";
import type { CardDefLike, CardPool, CardRef, ScriptedAnswer, Seat, ZoneKey } from "./types";
import { HarnessError, P1, P2, P3, P4 } from "./types";

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

/** Inline test definition. `cardType` defaults to "unit" when might is given. */
export interface InlineCardDef extends Partial<Omit<CardDefLike, "cardType">> {
  readonly cardType?: string;
}

/** A real definition id from the pool, or an inline definition. */
export type DefSpec = string | InlineCardDef;

export interface ScenarioCard {
  readonly id: CardRef;
  readonly def: DefSpec;
  readonly owner: Seat;
  readonly controller?: Seat;
  /** Zone key or shorthand ("bf1" for battlefield-bf1, "facedown:bf1"). */
  readonly zone: string;
  readonly meta?: Readonly<Partial<RiftboundCardMeta> & Record<string, unknown>>;
}

export interface ScenarioBattlefield {
  readonly id: string;
  readonly def?: DefSpec;
  readonly owner: Seat;
  readonly controller: Seat | null;
  /** Strip abilities so the battlefield is rules-inert (default true). */
  readonly inert: boolean;
  readonly contested?: boolean;
  readonly contestedBy?: Seat;
}

export interface ScenarioSpec {
  readonly seed: string;
  readonly players: readonly Seat[];
  readonly turn: number;
  readonly phase: GamePhase;
  readonly active: Seat;
  readonly resources: Readonly<Record<Seat, { energy: number; power: Readonly<Record<string, number>> }>>;
  readonly points?: Readonly<Record<Seat, number>>;
  readonly xp?: Readonly<Record<Seat, number>>;
  readonly victoryScore?: number;
  readonly battlefields: readonly ScenarioBattlefield[];
  readonly cards: readonly ScenarioCard[];
  readonly fillDecks: { readonly main: number; readonly runes: number } | false;
  readonly [key: string]: unknown;
}

const SEATS = [P1, P2, P3, P4];

// ---------------------------------------------------------------------------
// Materialisation
// ---------------------------------------------------------------------------

function resolveZone(spec: ScenarioSpec, zone: string): string {
  if (zone.startsWith("facedown:")) {
    return `facedown-${zone.slice("facedown:".length)}`;
  }
  if (zone.startsWith("battlefield:")) {
    return `battlefield-${zone.slice("battlefield:".length)}`;
  }
  if (spec.battlefields.some((b) => b.id === zone)) {
    return `battlefield-${zone}`;
  }
  return zone;
}

function resolveDef(pool: CardPool, def: DefSpec, fallbackName: string): CardDefLike {
  if (typeof def === "string") {
    const found = pool.get(def);
    if (!found) {
      throw new HarnessError({
        code: "CARD_NOT_FOUND",
        detail: { defId: def, poolSize: pool.size },
        message: `Definition "${def}" not in card pool (${pool.size} cards)`,
      });
    }
    return found;
  }
  const cardType = def.cardType ?? (def.might !== undefined ? "unit" : "spell");
  const inline: CardDefLike = {
    abilities: [],
    keywords: [],
    ...(def as Record<string, unknown>),
    cardType,
    id: (def.id as string | undefined) ?? `inline:${fallbackName}`,
    name: (def.name as string | undefined) ?? fallbackName,
  };
  return inline;
}

function ensureZone(engine: HarnessEngine, zoneId: string): void {
  const internal = getInternalState(engine);
  if (internal.zones[zoneId]) {
    return;
  }
  if (zoneId.startsWith("battlefield-")) {
    internal.zones[zoneId] = {
      cardIds: [],
      config: { faceDown: false, id: zoneId, name: `Battlefield ${zoneId}`, ordered: false, visibility: "public" },
    };
    return;
  }
  if (zoneId.startsWith("facedown-")) {
    internal.zones[zoneId] = {
      cardIds: [],
      config: { faceDown: true, id: zoneId, maxSize: 1, name: `Facedown ${zoneId}`, ordered: false, visibility: "private" },
    };
    return;
  }
  throw new HarnessError({
    code: "ILLEGAL_ARGS",
    detail: { zone: zoneId },
    message: `Zone "${zoneId}" does not exist (battlefield ids must be declared with .battlefield())`,
  });
}

function placeCard(
  engine: HarnessEngine,
  id: string,
  def: CardDefLike,
  owner: Seat,
  controller: Seat,
  zoneId: string,
  meta: Readonly<Record<string, unknown>> | undefined,
): void {
  const internal = getInternalState(engine);
  if (internal.cards[id]) {
    throw new HarnessError({ code: "ILLEGAL_ARGS", detail: { id }, message: `Duplicate card id/alias "${id}"` });
  }
  ensureZone(engine, zoneId);
  const isRune = def.cardType === "rune";
  getGlobalCardRegistry().register(id, toLookupPayload(def, id, isRune ? { cardType: "rune", energyCost: 0 } : undefined));
  internal.cards[id] = { controller, definitionId: def.id ?? id, owner, zone: zoneId };
  internal.zones[zoneId]?.cardIds.push(id);
  const m: Record<string, unknown> = {
    buffed: false,
    combatRole: null,
    damage: 0,
    exhausted: false,
    hidden: zoneId.startsWith("facedown-"),
    stunned: false,
    ...meta,
  };
  const flags: Record<string, boolean> = { ...((m.__flags as Record<string, boolean> | undefined) ?? {}) };
  for (const f of ["exhausted", "stunned", "buffed"] as const) {
    if (m[f] === true) {
      flags[f] = true;
    }
  }
  if (Object.keys(flags).length > 0) {
    m.__flags = flags;
  }
  if (isRune) {
    m.domain = m.domain ?? domainsOf(def)[0];
  }
  if (zoneId.startsWith("facedown-")) {
    m.hiddenAt = m.hiddenAt ?? zoneId.slice("facedown-".length);
  }
  internal.cardMetas[id] = m as unknown as RiftboundCardMeta & Record<string, unknown>;
}

export interface BuiltScenario {
  readonly engine: HarnessEngine;
  readonly spec: ScenarioSpec;
  readonly ids: readonly CardRef[];
}

/**
 * Materialise a spec. Resets the GLOBAL card registry (engine limitation:
 * one live game per process).
 */
export function buildScenarioEngine(spec: ScenarioSpec, pool: CardPool): BuiltScenario {
  setGlobalCardRegistry(new CardDefinitionRegistry());
  const engine: HarnessEngine = new RuleEngine<RiftboundGameState, RiftboundMoves, unknown, RiftboundCardMeta>(
    riftboundDefinition,
    spec.players.map((id) => ({ id, name: id })),
    { seed: spec.seed },
  );

  // 1. Patch the game-specific state into a mid-game position.
  const st = structuredClone(peekCurrentState(engine)) as {
    -readonly [K in keyof RiftboundGameState]: RiftboundGameState[K];
  } & Record<string, unknown>;
  st.status = "playing";
  st.setup = undefined;
  st.turn = { activePlayer: spec.active, number: spec.turn, phase: spec.phase };
  if (spec.victoryScore !== undefined) {
    st.victoryScore = spec.victoryScore;
  }
  const pools: Record<string, { energy: number; power: Record<string, number> }> = {};
  const players = { ...st.players } as Record<string, RiftboundGameState["players"][string]>;
  const conquered: Record<string, string[]> = {};
  const scored: Record<string, string[]> = {};
  const xpGained: Record<string, number> = {};
  const played: Record<string, number> = {};
  const moved: Record<string, number> = {};
  for (const pid of spec.players) {
    const r = spec.resources[pid];
    pools[pid] = { energy: r?.energy ?? 0, power: { ...(r?.power ?? {}) } };
    players[pid] = {
      ...(players[pid] ?? { id: pid, turnsTaken: 0, victoryPoints: 0, xp: 0 }),
      turnsTaken: Math.max(1, Math.floor(spec.turn / spec.players.length)),
      victoryPoints: spec.points?.[pid] ?? 0,
      xp: spec.xp?.[pid] ?? 0,
    };
    conquered[pid] = [];
    scored[pid] = [];
    xpGained[pid] = 0;
    played[pid] = 0;
    moved[pid] = 0;
  }
  st.runePools = pools;
  st.players = players;
  st.conqueredThisTurn = conquered;
  st.scoredThisTurn = scored;
  st.xpGainedThisTurn = xpGained;
  st.cardsPlayedThisTurn = played;
  st.unitsMovedThisTurn = moved;
  const bfs: Record<string, RiftboundGameState["battlefields"][string]> = {};
  for (const bf of spec.battlefields) {
    bfs[bf.id] = {
      contested: bf.contested ?? false,
      contestedBy: bf.contestedBy,
      controller: bf.controller,
      id: bf.id,
    };
  }
  st.battlefields = bfs;
  replaceCurrentState(engine, st as RiftboundGameState);

  // 2. Move the FlowManager into mainGame/main aligned with our state.
  const flow = engine.getFlowManager();
  if (flow) {
    if (flow.getCurrentGameSegment() === "setup") {
      flow.nextGameSegment();
    }
    // nextGameSegment ran hooks against a draft; push our position back in.
    replaceCurrentState(engine, st as RiftboundGameState);
    flow.syncState(peekCurrentState(engine));
    flow.setCurrentPlayer(spec.active);
    (flow as unknown as { turnNumber: number }).turnNumber = spec.turn;
    const fm = flow as unknown as { currentPhase?: string };
    if (fm.currentPhase !== spec.phase) {
      fm.currentPhase = spec.phase;
    }
  }

  // 3. Battlefields: card in battlefieldRow + zones.
  const ids: string[] = [];
  for (const bf of spec.battlefields) {
    const raw = bf.def ? resolveDef(pool, bf.def, bf.id) : { abilities: [], cardType: "battlefield", id: `inline:${bf.id}`, name: bf.id };
    const def: CardDefLike = { ...raw, abilities: bf.inert ? [] : raw.abilities, cardType: "battlefield" };
    placeCard(engine, bf.id, def, bf.owner, bf.controller ?? bf.owner, "battlefieldRow", undefined);
    ensureZone(engine, `battlefield-${bf.id}`);
    ensureZone(engine, `facedown-${bf.id}`);
    ids.push(bf.id);
  }

  // 4. Cards.
  for (const c of spec.cards) {
    const def = resolveDef(pool, c.def, c.id);
    placeCard(engine, c.id, def, c.owner, c.controller ?? c.owner, resolveZone(spec, c.zone), c.meta);
    ids.push(c.id);
  }

  // 5. Deck filler so turn advancement never burns out by accident.
  if (spec.fillDecks) {
    const internal = getInternalState(engine);
    for (const pid of spec.players) {
      const mainHave = internal.zones.mainDeck?.cardIds.filter((id) => internal.cards[id]?.owner === pid).length ?? 0;
      for (let i = mainHave; i < spec.fillDecks.main; i++) {
        placeCard(engine, `${pid}:filler${i}`, FILLER_UNIT_DEF, pid, pid, "mainDeck", undefined);
      }
      const legendId = internal.zones.legendZone?.cardIds.find((id) => internal.cards[id]?.owner === pid);
      const legendDef = legendId ? pool.get(internal.cards[legendId]?.definitionId ?? "") : undefined;
      const domain = domainsOf(legendDef)[0] ?? "fury";
      const runeHave = internal.zones.runeDeck?.cardIds.filter((id) => internal.cards[id]?.owner === pid).length ?? 0;
      const runeDef = basicRuneDef(pool, domain);
      for (let i = runeHave; i < spec.fillDecks.runes; i++) {
        placeCard(engine, `${pid}:rune${i}`, runeDef, pid, pid, "runeDeck", undefined);
      }
    }
  }

  // 6. Statics are continuous (rule 522) — the position a scenario describes
  // must already show them, without waiting for a chain item to resolve.
  applyStaticsToScenario(engine);

  return { engine, ids, spec };
}

/** Run one static-ability recalculation over the freshly placed board. */
function applyStaticsToScenario(engine: HarnessEngine): void {
  const internal = getInternalState(engine);
  const ctx = {
    cards: {
      getCardMeta: (cardId: string) => internal.cardMetas[cardId],
      getCardOwner: (cardId: string) => internal.cards[cardId]?.owner,
      updateCardMeta: (cardId: string, meta: Partial<RiftboundCardMeta>) => {
        internal.cardMetas[cardId] = {
          ...(internal.cardMetas[cardId] ?? {}),
          ...meta,
        } as RiftboundCardMeta & Record<string, unknown>;
      },
    },
    draft: peekCurrentState(engine),
    zones: {
      getCardsInZone: (zoneId: string, playerId?: string) => {
        const ids = internal.zones[zoneId]?.cardIds ?? [];
        return playerId === undefined ? ids : ids.filter((id) => internal.cards[id]?.owner === playerId);
      },
    },
  };
  recalculateStaticEffects(ctx as unknown as StaticAbilityContext);
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export interface ScenarioOptions {
  readonly seed?: string;
  readonly pool?: CardPool;
  readonly players?: 2 | 3 | 4;
}

export interface CardPlacement {
  readonly def: DefSpec;
  readonly owner: Seat;
  readonly zone: ZoneKey | string;
  readonly controller?: Seat;
  readonly meta?: Readonly<Partial<RiftboundCardMeta> & Record<string, unknown>>;
}

export interface BattlefieldOptions {
  readonly def?: DefSpec;
  readonly controller?: Seat | null;
  readonly owner?: Seat;
  readonly inert?: boolean;
  readonly contested?: boolean;
  readonly contestedBy?: Seat;
}

export interface ScriptSpec {
  readonly answers: ScriptedAnswer[];
  readonly strict: boolean;
}

/** What `build()` hands to the Game constructor (kept structural to avoid a cycle). */
export interface ScenarioBuildOutput {
  readonly built: BuiltScenario;
  readonly pool: CardPool;
  readonly scripts: ReadonlyMap<Seat, ScriptSpec>;
  readonly invariants?: readonly Invariant[];
  readonly strictInvariants: boolean;
  readonly autoProcedures: boolean;
}

type MutableSpec = {
  -readonly [K in keyof ScenarioSpec]: ScenarioSpec[K];
} & {
  battlefields: ScenarioBattlefield[];
  cards: ScenarioCard[];
  resources: Record<Seat, { energy: number; power: Record<string, number> }>;
  points: Record<Seat, number>;
  xp: Record<Seat, number>;
};

export class ScenarioBuilder {
  private readonly spec: MutableSpec;
  private readonly poolOpt?: CardPool;
  private readonly scripts = new Map<Seat, ScriptSpec>();
  private readonly extraInvariants: Invariant[] = [];
  private invariantSet?: Invariant[];
  private strictInv = false;
  private autoProc = true;
  private counter = 0;

  constructor(opts: ScenarioOptions = {}) {
    const players = SEATS.slice(0, opts.players ?? 2);
    this.poolOpt = opts.pool;
    this.spec = {
      active: players[0] as Seat,
      battlefields: [],
      cards: [],
      fillDecks: { main: 10, runes: 12 },
      phase: "main",
      players,
      points: {},
      resources: {},
      seed: opts.seed ?? "harness",
      turn: 2,
      xp: {},
    };
  }

  // --- position ------------------------------------------------------------

  turn(n: number): this {
    this.spec.turn = n;
    return this;
  }

  phase(p: GamePhase): this {
    this.spec.phase = p;
    return this;
  }

  active(seat: Seat): this {
    this.spec.active = seat;
    return this;
  }

  resources(seat: Seat, r: { energy?: number; power?: Readonly<Record<string, number>> }): this {
    const cur = this.spec.resources[seat] ?? { energy: 0, power: {} };
    this.spec.resources[seat] = {
      energy: r.energy ?? cur.energy,
      power: { ...cur.power, ...(r.power ?? {}) },
    };
    return this;
  }

  /** Alias of resources() matching the taxonomy's "rune pool" wording. */
  runePool(seat: Seat, r: { energy?: number; power?: Readonly<Record<string, number>> }): this {
    return this.resources(seat, r);
  }

  points(seat: Seat, n: number): this {
    this.spec.points[seat] = n;
    return this;
  }

  xp(seat: Seat, n: number): this {
    this.spec.xp[seat] = n;
    return this;
  }

  victoryScore(n: number): this {
    this.spec.victoryScore = n;
    return this;
  }

  // --- battlefields --------------------------------------------------------

  battlefield(id: string, opts: BattlefieldOptions = {}): this {
    if (this.spec.battlefields.some((b) => b.id === id)) {
      throw new HarnessError({ code: "ILLEGAL_ARGS", detail: { id }, message: `Battlefield "${id}" declared twice` });
    }
    const owner = opts.owner ?? opts.controller ?? (this.spec.players[0] as Seat);
    this.spec.battlefields.push({
      contested: opts.contested,
      contestedBy: opts.contestedBy,
      controller: opts.controller ?? null,
      def: opts.def,
      id,
      inert: opts.inert ?? true,
      owner,
    });
    return this;
  }

  // --- cards ---------------------------------------------------------------

  private nextId(): string {
    this.counter += 1;
    return `k${this.counter}`;
  }

  /** Generic placement. `alias` (if given) becomes the card's instance id. */
  card(alias: string | undefined, placement: CardPlacement): this {
    const id = alias ?? this.nextId();
    this.spec.cards.push({
      controller: placement.controller,
      def: placement.def,
      id,
      meta: placement.meta,
      owner: placement.owner,
      zone: placement.zone,
    });
    return this;
  }

  /** Place several definitions in one zone (no aliases). */
  cards(owner: Seat, zone: ZoneKey | string, defs: readonly DefSpec[]): this {
    for (const def of defs) {
      this.card(undefined, { def, owner, zone });
    }
    return this;
  }

  hand(owner: Seat, def: DefSpec, alias?: string, meta?: CardPlacement["meta"]): this {
    return this.card(alias, { def, meta, owner, zone: "hand" });
  }

  base(owner: Seat, def: DefSpec, alias?: string, meta?: CardPlacement["meta"]): this {
    return this.card(alias, { def, meta, owner, zone: "base" });
  }

  trash(owner: Seat, def: DefSpec, alias?: string): this {
    return this.card(alias, { def, owner, zone: "trash" });
  }

  banishment(owner: Seat, def: DefSpec, alias?: string): this {
    return this.card(alias, { def, owner, zone: "banishment" });
  }

  /**
   * A unit at a location ("base" or a battlefield id). `def` may be a real
   * id or an inline `{ might, keywords, … }` (cardType defaults to unit).
   */
  unit(owner: Seat, location: string, def: DefSpec, alias?: string, meta?: CardPlacement["meta"]): this {
    const inline = typeof def === "string" ? def : { cardType: "unit", ...def };
    return this.card(alias, { def: inline, meta, owner, zone: location === "base" ? "base" : location });
  }

  gear(owner: Seat, def: DefSpec, alias?: string, meta?: CardPlacement["meta"]): this {
    const inline = typeof def === "string" ? def : { cardType: "gear", ...def };
    return this.card(alias, { def: inline, meta, owner, zone: "base" });
  }

  legend(owner: Seat, def: DefSpec, alias?: string): this {
    const inline = typeof def === "string" ? def : { cardType: "legend", ...def };
    return this.card(alias, { def: inline, owner, zone: "legendZone" });
  }

  champion(owner: Seat, def: DefSpec, alias?: string): this {
    return this.card(alias, { def, owner, zone: "championZone" });
  }

  /** A rune in the rune pool (channeled). `def` may be a domain name. */
  rune(owner: Seat, defOrDomain: DefSpec, opts: { alias?: string; exhausted?: boolean } = {}): this {
    const def =
      typeof defOrDomain === "string" && !defOrDomain.includes("-")
        ? ({ cardType: "rune", domain: defOrDomain, name: `${defOrDomain} Rune` } as InlineCardDef)
        : defOrDomain;
    return this.card(opts.alias, {
      def,
      meta: opts.exhausted ? { exhausted: true } : undefined,
      owner,
      zone: "runePool",
    });
  }

  runes(owner: Seat, domain: string, count: number, opts: { exhausted?: boolean } = {}): this {
    for (let i = 0; i < count; i++) {
      this.rune(owner, domain, { exhausted: opts.exhausted });
    }
    return this;
  }

  /** Facedown (hidden) card at a battlefield. */
  facedown(owner: Seat, battlefield: string, def: DefSpec, alias?: string, meta?: CardPlacement["meta"]): this {
    return this.card(alias, {
      def,
      meta: { hidden: true, hiddenOnTurn: 0, ...meta },
      owner,
      zone: `facedown:${battlefield}`,
    });
  }

  /** Main deck contents, top first. Disables filler for this seat only if you also call fillDecks(false). */
  deck(owner: Seat, defs: readonly DefSpec[], aliases?: readonly (string | undefined)[]): this {
    defs.forEach((def, i) => this.card(aliases?.[i], { def, owner, zone: "mainDeck" }));
    return this;
  }

  deckTop(owner: Seat, def: DefSpec, alias?: string): this {
    return this.card(alias, { def, owner, zone: "mainDeck" });
  }

  runeDeck(owner: Seat, defs: readonly DefSpec[]): this {
    return this.cards(owner, "runeDeck", defs);
  }

  fillDecks(v: { main: number; runes: number } | false): this {
    this.spec.fillDecks = v;
    return this;
  }

  // --- behaviour -----------------------------------------------------------

  /** Queue answers for a seat (consumed by settle()/advanceTurn()/verbs' follow-ups). */
  script(seat: Seat, answers: readonly ScriptedAnswer[], opts: { strict?: boolean } = {}): this {
    this.scripts.set(seat, { answers: [...answers], strict: opts.strict ?? false });
    return this;
  }

  /** Add invariants on top of the default starter set. */
  use(...invariants: Invariant[]): this {
    this.extraInvariants.push(...invariants);
    return this;
  }

  /** Replace the invariant set entirely ([] disables checking). */
  invariants(set: readonly Invariant[]): this {
    this.invariantSet = [...set];
    return this;
  }

  strictInvariants(v = true): this {
    this.strictInv = v;
    return this;
  }

  autoProcedures(v: boolean): this {
    this.autoProc = v;
    return this;
  }

  seed(s: string): this {
    this.spec.seed = s;
    return this;
  }

  // --- output --------------------------------------------------------------

  toSpec(): ScenarioSpec {
    return structuredClone(this.spec) as ScenarioSpec;
  }

  /** Materialise (loads the default card pool on first use unless one was given). */
  async materialize(): Promise<ScenarioBuildOutput> {
    const pool = this.poolOpt ?? (await loadDefaultCardPool());
    const built = buildScenarioEngine(this.toSpec(), pool);
    return {
      autoProcedures: this.autoProc,
      built,
      invariants: [...(this.invariantSet ?? DEFAULT_INVARIANTS), ...this.extraInvariants],
      pool,
      scripts: new Map(this.scripts),
      strictInvariants: this.strictInv,
    };
  }
}
