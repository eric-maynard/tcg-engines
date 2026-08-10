/**
 * L2 — the ergonomic `Game` / `Seat` API (the mockup vocabulary).
 *
 * Reads are synchronous; actions are async and THROW `HarnessError` so a
 * failing test points at the offending line. `game.act()` is the
 * non-throwing L0 passthrough.
 */

import type { PlayerId } from "@tcg/core";
import { getGlobalCardRegistry } from "../operations/card-lookup";
import { getDepartedOwner } from "../operations/leave-board";
import { readTurnTrace } from "../game-definition/flow/expiration-step";
import type { TurnTrace } from "../game-definition/flow/expiration-step";
import { createPlayableGame } from "../testing/playtest/game-setup";
import type { DeckConfig } from "../testing/playtest/game-setup";
import type { RiftboundGameState } from "../types";
import { getActingSeat } from "../views/acting-seat";
import { loadDefaultCardPool } from "./card-pool";
import { locationOfZone } from "./card-state";
import { coerceAnswer, isAnswerObject } from "./decision";
import { EngineBackend } from "./engine-backend";
import type { EngineBackendOptions } from "./engine-backend";
import type { HarnessEngine } from "./internal";
import { getInternalState } from "./internal";
import type { Invariant } from "./invariants";
import { listZoneSummaries } from "./observation";
import { ScenarioBuilder } from "./scenario";
import type { ScenarioOptions, ScenarioSpec, ScriptSpec } from "./scenario";
import { buildScenarioEngine } from "./scenario";
import type { Transcript } from "./transcript-types";
import type {
  ActResult,
  ActionDecision,
  ActionOption,
  Answer,
  AnswerShorthand,
  CardPool,
  CardRef,
  CardState,
  Decision,
  LocationRef,
  Observation,
  PlayArgs,
  ScriptedAnswer,
  Seat,
  Viewer,
  Violation,
  ZoneKey,
  ZoneRef,
  ZoneSummary,
} from "./types";
import { HarnessError, P1, P2, SPECTATOR } from "./types";

// ---------------------------------------------------------------------------
// Policies for settle()
// ---------------------------------------------------------------------------

export type Policy = (decision: Decision, game: Game) => AnswerShorthand | undefined;

/** Pass priority/focus; answer only forced prompts (single legal pick). */
export const passivePolicy: Policy = (d) => {
  if (d.kind === "action") {
    if ((d.context === "chain" || d.context === "showdown") && d.passKey) {
      return { key: d.passKey, kind: "action" };
    }
    if (d.context === "procedure" && d.options[0]) {
      return { key: d.options[0].key, kind: "action" };
    }
    return undefined;
  }
  // rule 753 — a "you MAY make new choices" slot nobody answers keeps its value.
  if (d.kind === "pick" && d.newChoices !== undefined && d.allowDecline) {
    return { kind: "decline" };
  }
  // rule 359.3.e.6 — "play a card from your trash/banishment" is compulsory
  // (min 1, no decline), but WHICH card is played is still the performer's
  // announced choice: hand the offer back instead of taking it silently, so the
  // caller can see the pile the engine offered even when only one card fits.
  const isPlayFromPile = d.kind === "pick" && d.semantics === "from-revealed" && d.meta?.onPicked === "play";
  if (d.kind === "pick" && d.options.length === 1 && d.min === 1 && !isPlayFromPile) {
    return { keys: [d.options[0]?.key as string], kind: "pick" };
  }
  // rule 383.3.d — a soft trigger-order offer nobody answered keeps the
  // listed (scan) order.
  if (d.kind === "order" && d.defaultable) {
    return { keys: [], kind: "order" };
  }
  if (d.kind === "pick" && d.options.length === 0 && d.allowDecline) {
    return { kind: "decline" };
  }
  // rule 465.2.c.3 — a combat damage assignment always has a forced/greedy
  // legal line; settling takes it rather than stalling the combat.
  if (d.kind === "distribute" && d.defaultAllocation !== undefined) {
    return { allocation: { ...d.defaultAllocation }, kind: "distribute" };
  }
  // rule 355.13 (sfd-043-221) — a CONTINUATION of an "any number of" target
  // pick (the chooser already named a set) is declined, never silently
  // extended: settling must not add targets the answer did not name.
  // A finalization-time target SET (355.13 / 355.14.b — `targeting`) is the
  // controller's announced choice and is handed back unanswered instead.
  if (d.kind === "pick" && d.min === 0 && d.allowDecline && d.semantics === "target" && d.targeting === undefined) {
    return { kind: "decline" };
  }
  return undefined;
};

/** Like passive, but resolves every prompt with the first option / yes / minimum. */
export const firstOptionPolicy: Policy = (d, g) => {
  // "first option" keeps draining an "any number" continuation rather than
  // declining it (the passive policy stops there — rule 355.13).
  if (d.kind === "pick" && d.min === 0 && d.allowDecline && d.semantics === "target" && d.options.length > 0) {
    return { keys: [d.options[0]?.key as string], kind: "pick" };
  }
  const passive = passivePolicy(d, g);
  if (passive !== undefined) {
    return passive;
  }
  switch (d.kind) {
    case "pick": {
      return d.options.length > 0 ? { keys: d.options.slice(0, Math.max(1, d.min)).map((o) => o.key), kind: "pick" } : { kind: "decline" };
    }
    case "yes-no": {
      return { kind: "yes-no", value: d.canAccept !== false };
    }
    case "integer": {
      return { kind: "integer", value: d.min };
    }
    case "distribute": {
      return d.buckets[0] ? { allocation: { [d.buckets[0].key]: d.total }, kind: "distribute" } : undefined;
    }
    case "order": {
      return { keys: d.items.map((i) => i.key), kind: "order" };
    }
    case "deck-arrange": {
      return { kind: "deck-arrange", recycle: [], top: d.cards.map((c) => c.key) };
    }
    case "name": {
      return d.vocabulary[0] !== undefined ? { kind: "name", name: d.vocabulary[0] } : undefined;
    }
    default: {
      return undefined;
    }
  }
};

export interface SettleOptions {
  readonly policy?: Policy | "passive" | "first";
  readonly maxSteps?: number;
}

export interface SettleResult {
  readonly steps: number;
  readonly decision: Decision | null;
  readonly reason: "open" | "game-over" | "unanswered" | "max-steps";
}

export interface CardQuery {
  readonly name?: string | RegExp;
  readonly defId?: string;
  readonly owner?: Seat;
  readonly zone?: ZoneKey | string;
  readonly nth?: number;
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

export interface GameOptions extends EngineBackendOptions {
  readonly scripts?: ReadonlyMap<Seat, ScriptSpec>;
}

export class Game {
  readonly backend: EngineBackend;
  private readonly scripts = new Map<Seat, { answers: ScriptedAnswer[]; strict: boolean }>();
  private readonly handles = new Map<Seat, SeatHandle>();
  /** Battlefield whose Cleanup-begun showdown settle() already handed back once. */
  private autoShowdownHandedBack: string | undefined;
  /** rule 404.2: ids of canAccept:false opt-ins settle() already handed back once (it declines them next time). */
  private readonly unacceptableOptInsHandedBack = new Set<string>();

  constructor(backend: EngineBackend, scripts?: ReadonlyMap<Seat, ScriptSpec>) {
    this.backend = backend;
    for (const [seat, s] of scripts ?? []) {
      this.scripts.set(seat, { answers: [...s.answers], strict: s.strict });
    }
  }

  /** Wrap an existing engine (e.g. from createPlayableGame or rules-audit helpers). */
  static attach(engine: HarnessEngine, opts: GameOptions = {}): Game {
    return new Game(new EngineBackend(engine, opts), opts.scripts);
  }

  /** Full constructed-deck game at P1 turn 1 main phase (pregame skipped). */
  static async fromDecks(opts: {
    p1: DeckConfig;
    p2: DeckConfig;
    seed?: string;
    pool?: CardPool;
    autoProcedures?: boolean;
    invariants?: readonly Invariant[];
  }): Promise<Game> {
    const pool = opts.pool ?? (await loadDefaultCardPool());
    const seed = opts.seed ?? "harness";
    const { engine } = createPlayableGame(
      pool.all() as Parameters<typeof createPlayableGame>[0],
      opts.p1,
      opts.p2,
      seed,
    );
    return Game.attach(engine, {
      autoProcedures: opts.autoProcedures,
      invariants: opts.invariants,
      origin: { decks: { [P1]: opts.p1, [P2]: opts.p2 }, kind: "decks", seed },
      players: [P1, P2],
      pool,
    });
  }

  static async fromScenario(spec: ScenarioSpec, opts: Omit<GameOptions, "origin" | "players"> = {}): Promise<Game> {
    const pool = opts.pool ?? (await loadDefaultCardPool());
    const built = buildScenarioEngine(spec, pool);
    return Game.attach(built.engine, { ...opts, origin: { kind: "scenario", spec }, players: spec.players, pool });
  }

  /** Drive the LIVE web app through a browser (see harness/browser). Loaded lazily; needs Playwright at runtime. */
  static async fromBrowser(opts: import("./browser/browser-backend").BrowserLaunchOptions = {}): Promise<Game> {
    const mod = await import("./browser/game-browser");
    return mod.launchBrowserGame(opts);
  }

  // ---- accessors ------------------------------------------------------------

  /** Escape hatch. Prefer the harness API; needed only for engine-internal assertions. */
  get engine(): HarnessEngine {
    this.backend.activate();
    return this.backend.engine;
  }

  get gameState(): RiftboundGameState {
    return this.engine.getState();
  }

  get seq(): number {
    return this.backend.seq();
  }

  seats(): readonly Seat[] {
    return this.backend.seats();
  }

  seat(seat: Seat): SeatHandle {
    let h = this.handles.get(seat);
    if (!h) {
      if (!this.gameState.players[seat]) {
        throw new HarnessError({ code: "ILLEGAL_ARGS", detail: { seat }, message: `No seat "${seat}"` });
      }
      h = new SeatHandle(this, seat);
      this.handles.set(seat, h);
    }
    return h;
  }

  get p1(): SeatHandle {
    return this.seat(P1);
  }

  get p2(): SeatHandle {
    return this.seat(P2);
  }

  /** The seat that must decide now (pendingChoice > chain > showdown > turn). */
  actingSeat(): Seat | undefined {
    return getActingSeat(this.gameState);
  }

  acting(): SeatHandle {
    const s = this.actingSeat();
    if (!s) {
      throw new HarnessError({ code: "NO_DECISION", message: "Nobody is acting (game over?)" });
    }
    return this.seat(s);
  }

  turnPlayer(): Seat {
    return this.gameState.turn.activePlayer;
  }

  turnNumber(): number {
    return this.gameState.turn.number;
  }

  phase(): RiftboundGameState["turn"]["phase"] {
    return this.gameState.turn.phase;
  }

  /**
   * Per-turn procedure trace written by the flow: `expiration` lists every pass
   * of the last Ending Phase's Expiration Step (rule 317.2 — heal → expire →
   * empty pools; a pass whose `itemsProcessed > 0` was followed by another,
   * 317.2.f). Survives into the next turn until its own Ending Phase begins.
   */
  trace(): TurnTrace {
    return readTurnTrace(this.gameState);
  }

  isOver(): boolean {
    return this.gameState.status !== "playing";
  }

  winner(): Seat | undefined {
    return this.gameState.winner;
  }

  decision(): Decision | null {
    return this.backend.decision();
  }

  view(viewer: Viewer = SPECTATOR): Observation {
    return this.backend.view(viewer);
  }

  chain(): Observation["chain"] {
    return this.view().chain;
  }

  battlefields(): string[] {
    return Object.keys(this.gameState.battlefields ?? {});
  }

  // ---- cards ------------------------------------------------------------------

  has(card: CardRef): boolean {
    return this.backend.hasCard(card);
  }

  /** Resolve an alias / id, asserting it exists. */
  card(idOrAlias: CardRef): CardRef {
    if (!this.has(idOrAlias)) {
      throw new HarnessError({ code: "CARD_NOT_FOUND", detail: { id: idOrAlias }, message: `No card "${idOrAlias}"` });
    }
    return idOrAlias;
  }

  state(card: CardRef): CardState {
    return this.backend.cardState(card);
  }

  /**
   * Zone of a card. A token that left the board has ceased to exist (rule
   * 186.1) and reads as `"gone"` (so does any other card removed from the
   * game); an id the game never knew still throws CARD_NOT_FOUND.
   */
  zoneOf(card: CardRef): ZoneKey {
    if (!this.has(card) && getDepartedOwner(this.gameState, card) !== undefined) {
      return "gone";
    }
    return this.state(card).zone;
  }

  locationOf(card: CardRef): LocationRef | undefined {
    const zone = this.zoneOf(card);
    return zone === "gone" ? undefined : locationOfZone(zone);
  }

  /** Omniscient zone listing. `zone` may be a battlefield id shorthand. */
  cardsAt(zone: ZoneKey | string, owner?: Seat): CardRef[] {
    return [...this.backend.cardsIn(this.normalizeZone(zone), owner)];
  }

  normalizeZone(zone: string): string {
    if (this.gameState.battlefields?.[zone]) {
      return `battlefield-${zone}`;
    }
    if (zone.startsWith("battlefield:")) {
      return `battlefield-${zone.slice("battlefield:".length)}`;
    }
    if (zone.startsWith("facedown:")) {
      return `facedown-${zone.slice("facedown:".length)}`;
    }
    return zone;
  }

  findAll(q: CardQuery): CardRef[] {
    this.backend.activate();
    const internal = getInternalState(this.engine);
    const registry = getGlobalCardRegistry();
    const zone = q.zone ? this.normalizeZone(q.zone) : undefined;
    const out: CardRef[] = [];
    for (const [id, inst] of Object.entries(internal.cards)) {
      if (q.owner && inst.owner !== q.owner) {
        continue;
      }
      if (zone && inst.zone !== zone) {
        continue;
      }
      if (q.defId && inst.definitionId !== q.defId) {
        continue;
      }
      if (q.name !== undefined) {
        const name = registry.get(id)?.name ?? "";
        const ok = typeof q.name === "string" ? name.toLowerCase() === q.name.toLowerCase() : q.name.test(name);
        if (!ok) {
          continue;
        }
      }
      out.push(id);
    }
    return out;
  }

  find(q: CardQuery): CardRef {
    const all = this.findAll(q);
    if (q.nth !== undefined) {
      const c = all[q.nth];
      if (!c) {
        throw new HarnessError({ code: "CARD_NOT_FOUND", detail: { query: String(JSON.stringify({ ...q, name: String(q.name) })) }, message: `find(): no match #${q.nth}` });
      }
      return c;
    }
    if (all.length !== 1) {
      throw new HarnessError({
        code: "CARD_NOT_FOUND",
        detail: { matches: all },
        message: `find(): expected exactly one match, got ${all.length} (${all.join(", ")})`,
      });
    }
    return all[0] as CardRef;
  }

  // ---- acting -----------------------------------------------------------------

  /** L0 passthrough; never throws for game-level failures. */
  act(seat: Seat, answer: Answer): Promise<ActResult> {
    return this.backend.act(seat, answer);
  }

  expectOk(result: ActResult): asserts result is Extract<ActResult, { ok: true }> {
    if (!result.ok) {
      throw new HarnessError(result.error);
    }
  }

  // ---- scripts ------------------------------------------------------------------

  script(seat: Seat, answers: readonly ScriptedAnswer[], opts: { strict?: boolean; replace?: boolean } = {}): this {
    const cur = this.scripts.get(seat);
    if (!cur || opts.replace) {
      this.scripts.set(seat, { answers: [...answers], strict: opts.strict ?? cur?.strict ?? false });
    } else {
      cur.answers.push(...answers);
      if (opts.strict !== undefined) {
        cur.strict = opts.strict;
      }
    }
    return this;
  }

  /** Push answers to the FRONT of a seat's queue (used by verbs' `answers` option). */
  scriptNext(seat: Seat, answers: readonly ScriptedAnswer[]): this {
    const cur = this.scripts.get(seat) ?? { answers: [], strict: false };
    cur.answers.unshift(...answers);
    this.scripts.set(seat, cur);
    return this;
  }

  clearScript(seat: Seat): this {
    this.scripts.delete(seat);
    return this;
  }

  pendingScript(seat: Seat): number {
    return this.scripts.get(seat)?.answers.length ?? 0;
  }

  isStrict(seat: Seat): boolean {
    return this.scripts.get(seat)?.strict === true;
  }

  /**
   * Pop the next scripted answer for `d.seat`, coerced; undefined if none
   * applies. Scripted values target PROMPTS: on an action decision only
   * "pass" or an explicit `{kind:"action"}` answer is consumed, so a queued
   * card pick is not swallowed by an intervening priority window. A script
   * function returning undefined is left in the queue.
   */
  takeScripted(d: Decision): Answer | undefined {
    const s = this.scripts.get(d.seat);
    if (!s || s.answers.length === 0) {
      return undefined;
    }
    const next = s.answers[0] as ScriptedAnswer;
    const value = typeof next === "function" ? next(d) : next;
    if (value === undefined) {
      return undefined;
    }
    if (d.kind === "action" && !(value === "pass" || (isAnswerObject(value) && value.kind === "action"))) {
      return undefined;
    }
    // An EXPLICIT answer object of a different kind targets a later prompt just
    // like a wrong-shaped shorthand (a queued combat `distribute` must not be
    // handed to an intervening `pick`) — leave it queued instead of erroring.
    // `decline` answers a prompt of any kind, so they are never deferred.
    if (isAnswerObject(value) && value.kind !== "decline" && value.kind !== d.kind) {
      return undefined;
    }
    const coerced = coerceAnswer(d, value);
    if (!isAnswerObject(coerced)) {
      // A shorthand of the wrong SHAPE for this decision targets a later
      // prompt (a card key queued for a discard choice must not be swallowed
      // by an intervening yes/no) — leave it queued and stop here instead.
      if (coerced.code === "WRONG_ANSWER_KIND") {
        return undefined;
      }
      s.answers.shift();
      throw new HarnessError({ ...coerced, message: `scripted answer for ${d.seat}: ${coerced.message}` });
    }
    // Same rule for a shorthand naming an option this prompt does not offer: it
    // belongs to a LATER prompt (a battlefield key queued for a play-time
    // choice must not be swallowed by an intervening reveal-and-pick).
    if (d.kind === "pick" && coerced.kind === "pick") {
      const offered = new Set<string>();
      const add = (v: string | undefined): void => {
        if (v === undefined) {
          return;
        }
        offered.add(v);
        // Destinations are zone ids ("battlefield-bf2") but every other harness
        // surface names a battlefield by its bare id — accept both spellings,
        // exactly as the destination resolver does.
        offered.add(v.startsWith("battlefield-") ? v.slice("battlefield-".length) : `battlefield-${v}`);
      };
      for (const o of d.options) {
        add(o.key);
        add(o.card);
        add(o.zone);
        add(o.label);
      }
      if (offered.size > 0 && !coerced.keys.every((k) => offered.has(k))) {
        return undefined;
      }
    }
    s.answers.shift();
    return coerced;
  }

  // ---- settle / turn ------------------------------------------------------------

  /**
   * Drain everything that is not an open main-phase decision: scripted
   * answers first, then the policy (default passive: pass priority/focus,
   * take forced single picks). Stops at an open decision, an unanswerable
   * prompt (throws UNSCRIPTED_DECISION if that seat is strict), or game over.
   */
  async settle(opts: SettleOptions = {}): Promise<SettleResult> {
    const policy: Policy =
      opts.policy === "first" ? firstOptionPolicy : typeof opts.policy === "function" ? opts.policy : passivePolicy;
    const max = opts.maxSteps ?? 200;
    for (let steps = 0; steps < max; steps++) {
      const d = this.decision();
      if (!d) {
        return { decision: null, reason: "game-over", steps };
      }
      let answer = this.takeScripted(d);
      if (!answer) {
        // rule 404.2 — an opt-in whose "yes" is not legal (an unpayable "you may pay [cost]
        // to …") is answerable only with "no", so it must never block settle() for good. It is
        // handed back ONCE so the caller can observe it (DESIGN.md §Paying costs keeps the
        // prompt open — a live player may tap runes first and only then accept); settling again
        // on the same prompt declines it and moves on.
        if (d.kind === "yes-no" && d.canAccept === false && this.unacceptableOptInsHandedBack.has(d.id)) {
          const c = coerceAnswer(d, { kind: "yes-no", value: false });
          if (!isAnswerObject(c)) {
            throw new HarnessError(c);
          }
          answer = c;
        } else if (d.kind === "yes-no" && d.canAccept === false) {
          this.unacceptableOptInsHandedBack.add(d.id);
        }
      }
      if (!answer) {
        if (d.kind === "action" && (d.context === "main" || d.context === "free")) {
          return { decision: d, reason: "open", steps };
        }
        // rule 344.2 — a Non-Combat Showdown the Cleanup began on its own
        // (nobody chose it) is handed back once so the caller can observe it;
        // settling again passes focus as usual.
        if (d.kind === "action") {
          const sd = this.gameState.interaction?.showdownStack?.at(-1);
          if (
            sd?.active &&
            sd.autoBegun === true &&
            sd.isCombatShowdown !== true &&
            this.autoShowdownHandedBack !== sd.battlefieldId
          ) {
            this.autoShowdownHandedBack = sd.battlefieldId;
            return { decision: d, reason: "open", steps };
          }
        }
        const p = policy(d, this);
        if (p !== undefined) {
          const c = coerceAnswer(d, p);
          if (!isAnswerObject(c)) {
            throw new HarnessError(c);
          }
          answer = c;
        }
      }
      if (!answer) {
        if (this.isStrict(d.seat)) {
          throw new HarnessError({
            code: "UNSCRIPTED_DECISION",
            detail: { decision: summarize(d) },
            message: `${d.seat} was asked "${d.prompt}" (${d.kind}) with no scripted answer`,
          });
        }
        return { decision: d, reason: "unanswered", steps };
      }
      const r = await this.act(d.seat, answer);
      if (!r.ok) {
        throw new HarnessError({ ...r.error, detail: { ...(r.error.detail ?? {}), during: "settle", decision: summarize(d) } });
      }
    }
    return { decision: this.decision(), reason: "max-steps", steps: max };
  }

  /**
   * End the current turn player's turn and settle into the next player's
   * open main phase (start-of-turn triggers are passed/answered via scripts
   * and the policy). Returns the new turn player.
   */
  async advanceTurn(opts: SettleOptions = {}): Promise<{ next: Seat; turn: number }> {
    const before = await this.settle(opts);
    if (before.reason === "game-over") {
      throw new HarnessError({ code: "GAME_OVER", message: "advanceTurn(): game is over" });
    }
    const d = this.decision();
    if (!d || d.kind !== "action" || d.context !== "main") {
      throw new HarnessError({
        code: "NO_DECISION",
        detail: { decision: d ? summarize(d) : null },
        message: `advanceTurn(): cannot end turn while "${d?.prompt ?? "nothing"}" is pending for ${d?.seat ?? "?"}`,
      });
    }
    if (!d.endTurnKey) {
      const contested = Object.values(this.gameState.battlefields ?? {}).filter((b) => b.contested).map((b) => b.id);
      throw new HarnessError({
        code: "UNKNOWN_OPTION",
        detail: { contested, options: d.options.map((o) => o.key) },
        message: `advanceTurn(): endTurn is not legal for ${d.seat}${contested.length ? ` (contested: ${contested.join(", ")})` : ""}`,
      });
    }
    const r = await this.act(d.seat, { key: d.endTurnKey, kind: "action" });
    this.expectOk(r);
    await this.settle(opts);
    return { next: this.turnPlayer(), turn: this.turnNumber() };
  }

  /**
   * rule 383.3.d — accept the LISTED order of a pending soft trigger-order
   * offer (`decision().kind === "order" && defaultable`). Any other verb does
   * this implicitly; call it when a test inspects `decision()` right after a
   * batch of same-controller triggers and wants the priority window. Returns
   * whether an offer was pending.
   */
  async acceptTriggerOrder(): Promise<boolean> {
    const d = this.decision();
    if (d?.kind !== "order" || d.defaultable !== true) {
      return false;
    }
    const r = await this.act(d.seat, { keys: [], kind: "order" });
    this.expectOk(r);
    return true;
  }

  /** Advance turns until it is `seat`'s open main phase (bounded). */
  async advanceToTurnOf(seat: Seat, opts: SettleOptions = {}): Promise<void> {
    for (let i = 0; i < 8; i++) {
      await this.settle(opts);
      if (this.turnPlayer() === seat && this.phase() === "main") {
        return;
      }
      await this.advanceTurn(opts);
    }
    throw new HarnessError({ code: "TIMEOUT", message: `advanceToTurnOf(${seat}) did not converge` });
  }

  // ---- L4 ---------------------------------------------------------------------

  violations(): readonly Violation[] {
    return this.backend.violations();
  }

  transcript(): Transcript {
    return this.backend.transcript();
  }

  /**
   * Rewind the last action (move + automatic procedures) — see
   * `EngineBackend.undo`. Sandbox semantics; scripted answers are untouched.
   */
  undo(): boolean {
    return this.backend.undo();
  }

  /** Re-apply the last rewound action (false once a new move was made). */
  redo(): boolean {
    return this.backend.redo();
  }

  canUndo(): boolean {
    return this.backend.canUndo();
  }

  canRedo(): boolean {
    return this.backend.canRedo();
  }

  /**
   * Stable hash of the complete engine position (state + zones/cards/metas +
   * flow + RNG cursor + trackers + game-over latch + registry runtime layer).
   * `stateHash()` covers only what an observer can see; this one also proves
   * the NEXT shuffle / phase transition will be identical.
   */
  snapshotHash(): string {
    return this.backend.snapshotHash();
  }

  stateHash(): string {
    return this.backend.stateHash();
  }
}

function summarize(d: Decision): Record<string, unknown> {
  const base = { id: d.id, kind: d.kind, prompt: d.prompt, seat: d.seat };
  if (d.kind === "action") {
    return { ...base, context: d.context, options: d.options.map((o) => o.key) };
  }
  if (d.kind === "pick") {
    return { ...base, options: d.options.map((o) => o.key) };
  }
  return base;
}

// ---------------------------------------------------------------------------
// Seat
// ---------------------------------------------------------------------------

export interface VerbOptions {
  /** Answers queued at the front of this seat's script before acting (consumed by follow-up prompts). */
  readonly answers?: readonly ScriptedAnswer[];
}

export type PlayOptions = VerbOptions & Pick<PlayArgs, "to" | "accelerate" | "payOptional" | "sacrifice" | "discard" | "targets" | "mode" | "modes" | "x" | "repeat" | "costs" | "params">;
export type CastOptions = VerbOptions & Pick<PlayArgs, "targets" | "mode" | "modes" | "x" | "repeat" | "flow" | "payOptional" | "sacrifice" | "discard" | "costs" | "params">;
export type ActivateOptions = VerbOptions & Pick<PlayArgs, "sacrifice" | "discard" | "source" | "targets" | "costs" | "params">;
/** rule 355.5 / 811.1.d.2 — a play from Hidden makes its object choices as it is played. */
export type RevealOptions = VerbOptions & Pick<PlayArgs, "targets" | "payOptional" | "costs" | "params">;

export class SeatHandle {
  readonly game: Game;
  readonly seat: Seat;
  /**
   * rule 355.13 / 355.14.b — the finalization-time target SET this seat just
   * answered in one shot (`pick(a, b)`). The older accumulate idiom followed its
   * picks with `decline()` ("stop here"); that trailing decline is accepted as a
   * no-op once, so both idioms read the same.
   */
  private closedSetPick: Decision | undefined;

  constructor(game: Game, seat: Seat) {
    this.game = game;
    this.seat = seat;
  }

  private get backend(): EngineBackend {
    return this.game.backend;
  }

  // ---- observation --------------------------------------------------------------

  view(): Observation {
    return this.backend.view(this.seat);
  }

  /** Zones with counts as this seat sees them (own per-player zones + shared zones). */
  listZones(opts: { all?: boolean } = {}): ZoneSummary[] {
    return listZoneSummaries(this.game.engine, this.seat, opts.all ? undefined : this.seat).filter(
      (z) => opts.all || z.owner === this.seat || z.owner === undefined,
    );
  }

  /** Cards in a zone. Per-player zones default to this seat's; pass {owner} to override. */
  cardsAt(zone: ZoneKey | string | ZoneRef): CardRef[] {
    const ref: ZoneRef = typeof zone === "string" ? { zone: zone as ZoneKey } : zone;
    const id = this.game.normalizeZone(ref.zone);
    const perPlayer = !id.startsWith("battlefield-") && id !== "battlefieldRow" && id !== "chain";
    return this.game.cardsAt(id, ref.owner ?? (perPlayer ? this.seat : undefined));
  }

  hand(): CardRef[] {
    return this.cardsAt("hand");
  }

  base(): CardRef[] {
    return this.cardsAt("base");
  }

  trash(): CardRef[] {
    return this.cardsAt("trash");
  }

  banishment(): CardRef[] {
    return this.cardsAt("banishment");
  }

  /** Main deck, top first (omniscient — tests only). */
  deck(): CardRef[] {
    return this.cardsAt("mainDeck");
  }

  runeDeck(): CardRef[] {
    return this.cardsAt("runeDeck");
  }

  /** Runes in the rune pool zone (channeled). */
  runes(filter: { ready?: boolean; domain?: string } = {}): CardRef[] {
    return this.cardsAt("runePool").filter((r) => {
      const s = this.game.state(r);
      if (filter.ready !== undefined && s.isReady !== filter.ready) {
        return false;
      }
      if (filter.domain !== undefined && !s.domains.includes(filter.domain)) {
        return false;
      }
      return true;
    });
  }

  legend(): CardRef | undefined {
    return this.cardsAt("legendZone")[0];
  }

  champion(): CardRef | undefined {
    return this.cardsAt("championZone")[0];
  }

  /** This seat's units on the board, optionally at one location ("base" or battlefield id). */
  units(at?: LocationRef): CardRef[] {
    const locs = at ? [at] : ["base", ...this.game.battlefields()];
    const out: CardRef[] = [];
    for (const loc of locs) {
      const zone = loc === "base" ? "base" : `battlefield-${loc}`;
      // rule 108.2 — a unit on the board belongs to whoever CONTROLS it, which
      // is not always its owner (take-control, "play it" off an enemy deck).
      for (const id of this.game.cardsAt(zone)) {
        const s = this.game.state(id);
        if (s.cardType === "unit" && (s.controller ?? s.owner) === this.seat) {
          out.push(id);
        }
      }
    }
    return out;
  }

  gear(): CardRef[] {
    const isGear = (id: CardRef): boolean => {
      const t = this.game.state(id).cardType;
      return t === "gear" || t === "equipment";
    };
    const out = this.base().filter(isGear);
    // rule 811.1.d.1 (sfd-139-221) — a gear played from [Hidden] enters AT the
    // battlefield it was hidden at and stays there until a Cleanup recalls it
    // (rule 518), so loose gear at a battlefield is this seat's gear too.
    // Attached Equipment is listed through its bearer, not here.
    for (const bf of this.game.battlefields()) {
      for (const id of this.game.cardsAt(`battlefield-${bf}`, this.seat)) {
        if (isGear(id) && this.game.state(id).attachedTo === undefined) {
          out.push(id);
        }
      }
    }
    return out;
  }

  facedown(battlefield: string): CardRef[] {
    return this.game.cardsAt(`facedown-${battlefield}`, this.seat);
  }

  battlefields(filter: { controlled?: boolean } = {}): string[] {
    return Object.values(this.game.gameState.battlefields ?? {})
      .filter((b) => filter.controlled === undefined || (b.controller === this.seat) === filter.controlled)
      .map((b) => b.id);
  }

  state(card: CardRef): CardState {
    return this.game.state(card);
  }

  resources(): { energy: number; power: Record<string, number> } {
    const p = this.game.gameState.runePools[this.seat];
    return { energy: p?.energy ?? 0, power: { ...(p?.power ?? {}) } as Record<string, number> };
  }

  energy(): number {
    return this.resources().energy;
  }

  power(domain?: string): number {
    const p = this.resources().power;
    return domain ? (p[domain] ?? 0) : Object.values(p).reduce((a, b) => a + b, 0);
  }

  points(): number {
    return this.game.gameState.players[this.seat]?.victoryPoints ?? 0;
  }

  xp(): number {
    return this.game.gameState.players[this.seat]?.xp ?? 0;
  }

  isActing(): boolean {
    return this.game.actingSeat() === this.seat;
  }

  isTurnPlayer(): boolean {
    return this.game.turnPlayer() === this.seat;
  }

  /** This seat's decision (cursor or free menu), or null. */
  decision(): Decision | null {
    return this.backend.decisionFor(this.seat);
  }

  /** This seat's action menu (empty when it has none / a non-action prompt is pending). */
  legal(): readonly ActionOption[] {
    const d = this.decision();
    if (d && d.kind === "action") {
      return d.options;
    }
    // rule 429.3 / 429.3.a + 444.2.c: a pay-X prompt — and an opt-in "you may
    // pay …" — still offers the [Add] activations. rule 383.3.d: so does the
    // soft trigger-order offer (acting instead accepts the listed order).
    // rule 419.2.a: so does a pick whose acceptance pays the picked card's cost.
    return d && (d.kind === "integer" || d.kind === "yes-no" || d.kind === "order" || d.kind === "pick")
      ? (d.actions ?? [])
      : [];
  }

  /** Find an option by verb/moveId (+ card). */
  option(verbOrMove: string, card?: CardRef): ActionOption | undefined {
    return this.legal().find(
      (o) => (o.verb === verbOrMove || o.moveId === verbOrMove || o.key === verbOrMove) && (card === undefined || o.card === card),
    );
  }

  /**
   * rule 650 — conceding is legal "at any time", including while the only open
   * Decision belongs to the other seat (so this seat has no menu at all). The
   * engine's own enumerator is the authority; the harness menu is not.
   */
  private concedeIsValid(): boolean {
    const rows = this.game.engine.enumerateMoves(this.seat as PlayerId, {
      moveIds: ["concede"],
      validOnly: false,
    }) as readonly { isValid?: boolean; moveId?: string }[];
    return rows.some((r) => r.moveId === "concede" && r.isValid === true);
  }

  can(verbOrMove: string, card?: CardRef): boolean {
    if (verbOrMove === "concede" && card === undefined) {
      return this.concedeIsValid();
    }
    // `play(card)` dispatches on the card's type (spell → playSpell, gear or
    // equipment → playGear, else playUnit), and those moves surface under their
    // own verbs ("cast", "equip"). `can("play", card)` must ask about the very
    // move `play(card)` would run, not a literal "play" verb.
    if (this.option(verbOrMove, card) !== undefined) {
      return true;
    }
    if (verbOrMove === "play" && card !== undefined && this.game.has(card)) {
      const type = this.game.state(card).cardType;
      const moveId =
        type === "spell" ? "playSpell" : type === "gear" || type === "equipment" ? "playGear" : "playUnit";
      return this.option(moveId, card) !== undefined;
    }
    return false;
  }

  // ---- core act -----------------------------------------------------------------

  private async run(answer: Answer, why: string, opts: VerbOptions = {}): Promise<Extract<ActResult, { ok: true }>> {
    if (opts.answers?.length) {
      this.game.scriptNext(this.seat, opts.answers);
    }
    let r = await this.backend.act(this.seat, answer);
    if (!r.ok) {
      throw new HarnessError({ ...r.error, message: `${why}: ${r.error.message}` });
    }
    // Follow-ups: feed from this seat's script, else fail loudly (tests must be explicit).
    while (r.ok && r.followUp) {
      const scripted = this.game.takeScripted(r.followUp);
      if (!scripted) {
        const fu = r.followUp;
        await this.backend.act(this.seat, { kind: "decline" });
        const choices =
          fu.kind === "pick" ? fu.options.map((o) => o.key).join(" | ") : fu.kind === "integer" ? `${fu.min}..${fu.max}` : "";
        const arg = fu.kind === "pick" ? String(fu.meta?.arg ?? "a choice") : "x";
        throw new HarnessError({
          code: "AMBIGUOUS_ACTION",
          detail: { followUp: summarize(fu) },
          message: `${why}: needs \`${arg}\` — one of: ${choices}`,
        });
      }
      r = await this.backend.act(this.seat, scripted);
      if (!r.ok) {
        throw new HarnessError({ ...r.error, message: `${why} (follow-up): ${r.error.message}` });
      }
    }
    await this.drainScriptedPrompts();
    return r;
  }

  /** After an act, answer this seat's non-action prompts from its script while any are queued. */
  private async drainScriptedPrompts(): Promise<void> {
    for (let i = 0; i < 20; i++) {
      const d = this.game.decision();
      if (!d || d.seat !== this.seat || d.kind === "action" || this.game.pendingScript(this.seat) === 0) {
        return;
      }
      const a = this.game.takeScripted(d);
      if (!a) {
        return;
      }
      const r = await this.backend.act(this.seat, a);
      if (!r.ok) {
        throw new HarnessError({ ...r.error, message: `scripted answer: ${r.error.message}` });
      }
    }
  }

  private explainMissing(moveId: string, card: CardRef | undefined, why: string): HarnessError {
    const d = this.game.decision();
    const mine = this.legal();
    let reason = "";
    if (card !== undefined) {
      if (!this.game.has(card)) {
        return new HarnessError({ code: "CARD_NOT_FOUND", detail: { card }, message: `${why}: no card "${card}"` });
      }
      const rows = this.game.engine.enumerateMoves(this.seat as PlayerId, { moveIds: [moveId], validOnly: false });
      const row = rows.find((m) => {
        const p = (m.params ?? {}) as Record<string, unknown>;
        return (p.cardId ?? p.runeId ?? p.unitId) === card && !m.isValid;
      });
      if (row?.validationError) {
        reason = ` — engine: ${row.validationError.errorCode}: ${row.validationError.reason}`;
      } else {
        const s = this.game.state(card);
        reason = ` — ${card} is in ${s.zone} (owner ${s.owner}); energy ${this.energy()}, power ${JSON.stringify(this.resources().power)}`;
      }
    }
    const cursor = d ? `; current decision: ${d.seat} ${d.kind}${d.kind === "action" ? `(${d.context})` : ""} "${d.prompt}"` : "";
    return new HarnessError({
      code: "UNKNOWN_OPTION",
      detail: { card, legal: mine.map((o) => o.key), moveId },
      message: `${why}: not legal for ${this.seat} now${reason}${cursor}. Legal: ${mine.map((o) => o.label).join(", ") || "(nothing)"}`,
    });
  }

  /** Choose an option from this seat's menu by key / verb / moveId, with bundle args. */
  async choose(key: string, args: PlayArgs = {}, opts: VerbOptions = {}): Promise<Extract<ActResult, { ok: true }>> {
    return this.run({ args, key, kind: "action" }, `choose(${key})`, opts);
  }

  private async verb(
    moveId: string,
    card: CardRef | undefined,
    args: PlayArgs,
    why: string,
    opts: VerbOptions,
    match?: (o: ActionOption) => boolean,
  ): Promise<Extract<ActResult, { ok: true }>> {
    const option = this.legal().find((o) => o.moveId === moveId && (match ? match(o) : card === undefined || o.card === card));
    if (!option) {
      throw this.explainMissing(moveId, card, why);
    }
    return this.run({ args, key: option.key, kind: "action" }, why, opts);
  }

  // ---- verbs ----------------------------------------------------------------------

  /** PlayCard: a unit (or gear) from hand. */
  async play(card: CardRef, opts: PlayOptions = {}): Promise<Extract<ActResult, { ok: true }>> {
    const type = this.game.has(card) ? this.game.state(card).cardType : "unit";
    if (type === "spell") {
      return this.cast(card, opts);
    }
    if (type === "gear" || type === "equipment") {
      return this.verb("playGear", card, { ...opts, payOptional: opts.payOptional ?? opts.accelerate }, `play(${card})`, opts);
    }
    return this.verb("playUnit", card, { ...opts, payOptional: opts.payOptional ?? opts.accelerate }, `play(${card})`, opts);
  }

  /** CastSpell (from hand, or from trash with {flow:true}). */
  async cast(card: CardRef, opts: CastOptions = {}): Promise<Extract<ActResult, { ok: true }>> {
    return this.verb("playSpell", card, opts, `cast(${card})`, opts);
  }

  async playGear(card: CardRef, opts: VerbOptions & Pick<PlayArgs, "costTarget" | "params"> = {}): Promise<Extract<ActResult, { ok: true }>> {
    return this.verb("playGear", card, opts, `playGear(${card})`, opts);
  }

  equip = this.playGear.bind(this);

  /**
   * ActivateAbility(card, abilityIndex). Targets are asked at resolution (answer()/answers option).
   * With no index, use the card's first currently-legal activated ability — a card whose printed
   * text leads with a triggered ability has its activated one at a non-zero index.
   */
  async activate(card: CardRef, abilityIndex?: number, opts: ActivateOptions = {}): Promise<Extract<ActResult, { ok: true }>> {
    const idx = abilityIndex ?? this.firstActivatableIndex(card) ?? 0;
    return this.verb("activateAbility", card, { ...opts, abilityIndex: idx }, `activate(${card}#${idx})`, opts, (o) =>
      o.key === `activateAbility:${card}#${idx}`,
    );
  }

  private firstActivatableIndex(card: CardRef): number | undefined {
    const prefix = `activateAbility:${card}#`;
    for (const o of this.legal()) {
      if (o.key.startsWith(prefix)) {
        const n = Number(o.key.slice(prefix.length));
        if (Number.isInteger(n)) {
          return n;
        }
      }
    }
    return undefined;
  }

  /** MoveCard: standard move of one or more units to "base" or a battlefield id. */
  async move(cards: CardRef | readonly CardRef[], to: LocationRef | string, opts: VerbOptions = {}): Promise<Extract<ActResult, { ok: true }>> {
    const units = typeof cards === "string" ? [cards] : [...cards];
    const dest = to.startsWith("battlefield-") ? to.slice("battlefield-".length) : to;
    return this.verb("standardMove", undefined, { to: dest, units }, `move(${units.join("+")} → ${dest})`, opts, (o) =>
      o.key === `standardMove:to:${dest}`,
    );
  }

  async gank(unit: CardRef, toBattlefield: string, opts: VerbOptions = {}): Promise<Extract<ActResult, { ok: true }>> {
    return this.verb("gankingMove", unit, { to: toBattlefield }, `gank(${unit} → ${toBattlefield})`, opts);
  }

  async recall(unit: CardRef, opts: VerbOptions = {}): Promise<Extract<ActResult, { ok: true }>> {
    return this.verb("recallUnit", unit, {}, `recall(${unit})`, opts);
  }

  /** HideCard(card, battlefield). */
  async hide(card: CardRef, battlefield: string, opts: VerbOptions = {}): Promise<Extract<ActResult, { ok: true }>> {
    return this.verb("hideCard", card, { to: battlefield }, `hide(${card} @ ${battlefield})`, opts);
  }

  /**
   * Play a facedown card (rule 811.1.c.3). The objects it names are chosen HERE
   * (rule 355.5 / 811.1.d.2): `{targets}` locks a set, `{answers}` answers the
   * ask, and a bare `reveal(card)` names none — for an "any number of …"
   * descriptor that is the legal empty choice (rule 355.13), not a deferral.
   */
  async reveal(card: CardRef, opts: RevealOptions = {}): Promise<Extract<ActResult, { ok: true }>> {
    const asksTargets = this.option("revealHidden", card)?.fields.some((f) => f.name === "targets") === true;
    const args: PlayArgs =
      asksTargets && opts.targets === undefined && !opts.answers?.length ? { ...opts, targets: [] } : { ...opts };
    return this.verb("revealHidden", card, args, `reveal(${card})`, opts);
  }

  /**
   * PlayFromZone: play a card a PERMISSION makes playable from its current zone
   * (trash / banishment …). Location and additional costs are prompts of the
   * play itself — pre-answer them with `{ answers: ["battlefield-bf1", "yes"] }`.
   */
  async playFrom(card: CardRef, opts: VerbOptions = {}): Promise<Extract<ActResult, { ok: true }>> {
    return this.verb("playFromZone", card, {}, `playFrom(${card})`, opts);
  }

  async playChampion(to: LocationRef | string = "base", opts: VerbOptions = {}): Promise<Extract<ActResult, { ok: true }>> {
    return this.verb("playFromChampionZone", undefined, { to }, `playChampion(→ ${to})`, opts, () => true);
  }

  /** TapRune: exhaust a rune for 1 energy. No arg = first ready rune; {domain} = first ready rune of that domain. */
  async tapRune(rune?: CardRef | { domain: string }, opts: VerbOptions = {}): Promise<Extract<ActResult, { ok: true }>> {
    const id = this.pickRune("exhaustRune", rune);
    return this.verb("exhaustRune", id, {}, `tapRune(${id})`, opts);
  }

  async tapRunes(n: number): Promise<void> {
    for (let i = 0; i < n; i++) {
      await this.tapRune();
    }
  }

  /** RecycleRune: recycle a rune for 1 power of its domain. */
  async recycleRune(rune?: CardRef | { domain: string }, domain?: string, opts: VerbOptions = {}): Promise<Extract<ActResult, { ok: true }>> {
    const id = this.pickRune("recycleRune", rune);
    return this.verb("recycleRune", id, domain ? { domain } : {}, `recycleRune(${id})`, opts);
  }

  private pickRune(moveId: string, rune?: CardRef | { domain: string }): CardRef {
    if (typeof rune === "string") {
      return rune;
    }
    const options = this.legal().filter((o) => o.moveId === moveId && o.card);
    const match = rune?.domain
      ? options.find((o) => this.game.state(o.card as CardRef).domains.includes(rune.domain))
      : options[0];
    if (!match?.card) {
      throw this.explainMissing(moveId, undefined, `${moveId}(${rune ? JSON.stringify(rune) : "any"})`);
    }
    return match.card;
  }

  async passPriority(opts: VerbOptions = {}): Promise<Extract<ActResult, { ok: true }>> {
    return this.verb("passChainPriority", undefined, {}, "passPriority()", opts, () => true);
  }

  async passFocus(opts: VerbOptions = {}): Promise<Extract<ActResult, { ok: true }>> {
    return this.verb("passShowdownFocus", undefined, {}, "passFocus()", opts, () => true);
  }

  /** Pass priority or focus, whichever applies. */
  async pass(opts: VerbOptions = {}): Promise<Extract<ActResult, { ok: true }>> {
    const d = this.decision();
    if (d?.kind === "action" && d.passKey) {
      return this.run({ key: d.passKey, kind: "action" }, "pass()", opts);
    }
    throw this.explainMissing("passChainPriority", undefined, "pass()");
  }

  /** EndTurn via the TurnDriver (does NOT settle the next player's start-of-turn; see game.advanceTurn()). */
  async endTurn(opts: VerbOptions = {}): Promise<Extract<ActResult, { ok: true }>> {
    return this.verb("endTurn", undefined, {}, "endTurn()", opts, () => true);
  }

  /** Forfeit. rule 650: legal at any time, menu or no menu. */
  async concede(): Promise<Extract<ActResult, { ok: true }>> {
    if (this.legal().some((o) => o.moveId === "concede")) {
      return this.verb("concede", undefined, {}, "concede()", {}, () => true);
    }
    if (!this.concedeIsValid()) {
      throw this.explainMissing("concede", undefined, "concede()");
    }
    return this.do("concede");
  }

  forfeit = this.concede.bind(this);

  // ---- answering prompts (AnswerPopup) ------------------------------------------------

  /** Answer this seat's current non-free decision with a shorthand or full Answer. */
  async answer(value: AnswerShorthand, opts: VerbOptions = {}): Promise<Extract<ActResult, { ok: true }>> {
    const d = this.game.decision();
    if (!d || d.seat !== this.seat) {
      throw new HarnessError({
        code: d ? "NOT_YOUR_DECISION" : "NO_DECISION",
        detail: { decision: d ? summarize(d) : null },
        message: `answer(${JSON.stringify(value)}): ${d ? `it is ${d.seat}'s ${d.kind} decision ("${d.prompt}")` : "no decision pending"}`,
      });
    }
    const a = coerceAnswer(d, value);
    if (!isAnswerObject(a)) {
      throw new HarnessError(a);
    }
    this.closedSetPick = d.kind === "pick" && d.targeting !== undefined && a.kind === "pick" ? d : undefined;
    return this.run(a, `answer(${JSON.stringify(value)})`, opts);
  }

  async pick(...keys: (CardRef | number)[]): Promise<Extract<ActResult, { ok: true }>> {
    // rule 355.4 (rule-id: ven-140-166) — an instruction that chooses its
    // object as it resolves ("…, then move a friendly unit") binds its ONLY
    // legal object without asking, so the next prompt is already about that
    // card. Naming it again is a no-op re-assertion of a forced choice, not an
    // illegal answer: tests that guard both prompts stay valid either way.
    const d = this.game.decision();
    const key = keys.length === 1 ? String(keys[0]) : undefined;
    if (
      key !== undefined &&
      d?.kind === "pick" &&
      d.seat === this.seat &&
      d.source?.cardId === key &&
      !d.options.some((o) => o.key === key)
    ) {
      return { decision: d, executed: [], ok: true, seq: this.backend.seq(), violations: [] };
    }
    return this.answer({ keys: keys.map(String), kind: "pick" });
  }

  async decline(): Promise<Extract<ActResult, { ok: true }>> {
    const d = this.game.decision();
    // "stop here" after a one-shot target-set pick: nothing is open to decline.
    if (this.closedSetPick !== undefined && (!d || d.seat !== this.seat || d.kind === "action")) {
      this.closedSetPick = undefined;
      return { decision: d as Decision, executed: [], ok: true, seq: this.backend.seq(), violations: [] };
    }
    this.closedSetPick = undefined;
    return this.answer({ kind: "decline" });
  }

  async yes(): Promise<Extract<ActResult, { ok: true }>> {
    return this.answer({ kind: "yes-no", value: true });
  }

  async no(): Promise<Extract<ActResult, { ok: true }>> {
    return this.answer({ kind: "yes-no", value: false });
  }

  async chooseX(n: number): Promise<Extract<ActResult, { ok: true }>> {
    return this.answer({ kind: "integer", value: n });
  }

  async chooseMode(index: number): Promise<Extract<ActResult, { ok: true }>> {
    return this.answer({ keys: [String(index)], kind: "pick" });
  }

  /**
   * rule 753 — answer this seat's NEW CHOICES dialog ("gain control of a spell …
   * you may make new choices for it") slot by slot from ONE map: a slot named
   * in `changes` (by its key — "mode:0", "target:0", "source", "split", "set",
   * "dest:0" … — or by its kind — "mode" / "target" / "source" / "targets" /
   * "destination") is re-chosen to that value; every other slot is kept. A
   * kept slot whose dependants ARE named (keep the mover, re-route it) is
   * re-named to its current value so the dialog still asks them. Returns the
   * slots as the engine settled them.
   */
  async rechoose(changes: Readonly<Record<string, CardRef | number | readonly (CardRef | number)[]>>): Promise<readonly { key: string; status?: string }[]> {
    let last: readonly { key: string; status?: string }[] = [];
    for (let i = 0; i < 16; i++) {
      const d = this.game.decision();
      if (d?.kind !== "pick" || d.seat !== this.seat || d.newChoices === undefined) {
        break;
      }
      last = d.newChoices.slots;
      const slot = d.newChoices.slot;
      const wanted = changes[slot.key] ?? changes[slot.kind];
      if (wanted !== undefined) {
        const keys = (Array.isArray(wanted) ? wanted : [wanted]).map(String);
        await this.answer({ keys, kind: "pick" });
        continue;
      }
      const dependantNamed = d.newChoices.slots.some((s) => s.parent === slot.key && (changes[s.key] !== undefined || changes[s.kind] !== undefined));
      const current = d.options.filter((o) => o.current).map((o) => o.key);
      if (dependantNamed && current.length > 0) {
        await this.answer({ keys: current, kind: "pick" });
      } else if (d.allowDecline) {
        await this.answer({ kind: "decline" });
      } else {
        throw new HarnessError({
          code: "AMBIGUOUS_ACTION",
          detail: { options: d.options.map((o) => o.key), slot },
          message: `rechoose(): slot "${slot.key}" (${slot.label}) must be re-chosen — name it in the map`,
        });
      }
    }
    return last;
  }

  /** rule 753 — keep every (remaining) choice of this seat's NEW CHOICES dialog. */
  async keepChoices(): Promise<void> {
    for (let i = 0; i < 16; i++) {
      const d = this.game.decision();
      if (d?.kind !== "pick" || d.seat !== this.seat || d.newChoices === undefined) {
        return;
      }
      if (!d.allowDecline) {
        throw new HarnessError({
          code: "AMBIGUOUS_ACTION",
          detail: { slot: d.newChoices.slot },
          message: `keepChoices(): slot "${d.newChoices.slot.key}" has no value to keep — it must be re-chosen`,
        });
      }
      await this.answer({ kind: "decline" });
    }
  }

  async name(cardName: string): Promise<Extract<ActResult, { ok: true }>> {
    return this.answer({ kind: "name", name: cardName });
  }

  async distribute(allocation: Readonly<Record<CardRef, number>>): Promise<Extract<ActResult, { ok: true }>> {
    return this.answer({ allocation, kind: "distribute" });
  }

  async order(keys: readonly string[]): Promise<Extract<ActResult, { ok: true }>> {
    return this.answer({ keys, kind: "order" });
  }

  // ---- escape hatches -----------------------------------------------------------------

  /** Execute a raw engine move as this seat (bypasses menus; still records/invariants). */
  async do(moveId: string, params: Record<string, unknown> = {}): Promise<Extract<ActResult, { ok: true }>> {
    // `await` so a backend whose raw() is asynchronous (BrowserBackend) also works.
    const r = await this.backend.raw(this.seat, moveId, params);
    if (!r.ok) {
      throw new HarnessError({ ...r.error, message: `do(${moveId}): ${r.error.message}` });
    }
    return r;
  }

  /** Run `fn` and convert a thrown HarnessError into a result (for negative tests). */
  async try<T>(fn: (seat: SeatHandle) => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: HarnessError }> {
    try {
      return { ok: true, value: await fn(this) };
    } catch (error) {
      if (error instanceof HarnessError) {
        return { error, ok: false };
      }
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// scenario() entry point
// ---------------------------------------------------------------------------

export class Scenario extends ScenarioBuilder {
  async build(): Promise<Game> {
    const out = await this.materialize();
    return Game.attach(out.built.engine, {
      autoProcedures: out.autoProcedures,
      invariants: out.invariants,
      origin: { kind: "scenario", spec: out.built.spec },
      players: out.built.spec.players,
      pool: out.pool,
      scripts: out.scripts,
      strictInvariants: out.strictInvariants,
    });
  }
}

export function scenario(opts: ScenarioOptions = {}): Scenario {
  return new Scenario(opts);
}
