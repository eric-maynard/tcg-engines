/**
 * Stateful registry of live games for the MCP server.
 *
 * Each game is a harness `Game` over an `EngineBackend`. The engine keeps
 * card data in a process-global registry, so callers MUST serialise access
 * (see `Mutex`) and this class re-`activate()`s a game's registry in `get()`.
 */

import type {
  ActResult,
  Answer,
  AnswerShorthand,
  CardPool,
  Decision,
  ScenarioSpec,
  Seat,
} from "@tcg/riftbound/harness";
import {
  Game,
  P1,
  P2,
  coerceAnswer,
  firstOptionPolicy,
  loadDefaultCardPool,
  passivePolicy,
} from "@tcg/riftbound/harness";
// Not re-exported by the engine's package entry points; a relative import keeps the engine untouched.
import { buildDefaultDeck } from "../../riftbound-engine/src/testing/playtest/game-setup";
import type { DeckConfig } from "../../riftbound-engine/src/testing/playtest/game-setup";

export type GameMode = "goldfish" | "duel";

export interface DeckRequest {
  /** Two domains for an auto-built starter deck (default strategy "cheap"). */
  domains?: [string, string] | string[];
  strategy?: "cheap" | "random";
  /** Or a full deck list. */
  mainDeckCardIds?: string[];
  runeDeckCardIds?: string[];
  battlefieldIds?: string[];
  legendId?: string;
  championId?: string;
}

export interface CreateGameOptions {
  seed?: string;
  decks?: { p1?: DeckRequest; p2?: DeckRequest };
  scenario?: Partial<ScenarioSpec> & Record<string, unknown>;
  mode?: GameMode;
  autoProcedures?: boolean;
  /** Seats driven by the built-in goldfish bot (default: [P2] in goldfish mode, [] in duel). */
  botSeats?: Seat[];
}

export interface ManagedGame {
  readonly id: string;
  readonly game: Game;
  readonly mode: GameMode;
  readonly bots: Set<Seat>;
  readonly origin:
    | { kind: "decks"; seed: string; decks: Record<string, unknown> }
    | { kind: "scenario"; seed: string };
  readonly createdSeq: number;
  /** Notes from the goldfish driver (e.g. "stuck"). */
  lastAutoplay?: AutoplayReport;
}

export interface AutoplayReport {
  steps: number;
  stuck?: string;
}

export class GameNotFoundError extends Error {
  readonly code = "GAME_NOT_FOUND";
  constructor(id: string, known: string[]) {
    super(`No game "${id}". Known games: ${known.join(", ") || "(none) — call create_game"}`);
  }
}

export class BadRequestError extends Error {
  readonly code: string;
  readonly detail?: Record<string, unknown>;
  constructor(message: string, detail?: Record<string, unknown>, code = "ILLEGAL_ARGS") {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

const SEAT_ALIASES: Record<string, Seat> = {
  "1": P1,
  "2": P2,
  "3": "player-3",
  "4": "player-4",
  p1: P1,
  p2: P2,
  p3: "player-3",
  p4: "player-4",
  player1: P1,
  player2: P2,
};

export class GameManager {
  private readonly games = new Map<string, ManagedGame>();
  private pool?: CardPool;
  private counter = 0;

  async cardPool(): Promise<CardPool> {
    if (!this.pool) {
      this.pool = await loadDefaultCardPool();
    }
    return this.pool;
  }

  list(): ManagedGame[] {
    return [...this.games.values()];
  }

  get(id: string): ManagedGame {
    const m = this.games.get(id);
    if (!m) {
      throw new GameNotFoundError(id, [...this.games.keys()]);
    }
    m.game.backend.activate();
    return m;
  }

  close(id: string): boolean {
    const m = this.games.get(id);
    if (!m) {
      return false;
    }
    void m.game.backend.close();
    return this.games.delete(id);
  }

  /** Normalise "p1" / "P1" / "1" / "player-1" to a seat of `m`. */
  seat(m: ManagedGame, raw: unknown): Seat {
    if (typeof raw !== "string" && typeof raw !== "number") {
      throw new BadRequestError(`seat is required (one of ${m.game.seats().join(", ")})`);
    }
    const s = String(raw).trim();
    const seats = m.game.seats();
    const resolved = seats.includes(s) ? s : SEAT_ALIASES[s.toLowerCase().replace(/[-_\s]/g, "")];
    if (!resolved || !seats.includes(resolved)) {
      throw new BadRequestError(
        `Unknown seat "${s}"; seats are ${seats.join(", ")} (aliases p1/p2)`,
        { seat: s, seats },
      );
    }
    return resolved;
  }

  async create(opts: CreateGameOptions = {}): Promise<ManagedGame> {
    const pool = await this.cardPool();
    const mode: GameMode = opts.mode ?? "goldfish";
    this.counter += 1;
    const id = `g${this.counter}-${crypto.randomUUID().slice(0, 8)}`;
    const seed = opts.seed ?? id;
    let game: Game;
    let origin: ManagedGame["origin"];
    if (opts.scenario) {
      const spec = normalizeScenario(opts.scenario, seed);
      game = await Game.fromScenario(spec, { autoProcedures: opts.autoProcedures, pool });
      origin = { kind: "scenario", seed: spec.seed };
    } else {
      const all = pool.all() as unknown as Parameters<typeof buildDefaultDeck>[0];
      const d1 = resolveDeck(all, opts.decks?.p1, ["fury", "chaos"], seed);
      const d2 = resolveDeck(all, opts.decks?.p2, ["calm", "mind"], seed);
      game = await Game.fromDecks({
        autoProcedures: opts.autoProcedures,
        p1: d1,
        p2: d2,
        pool,
        seed,
      });
      origin = { decks: { [P1]: summarizeDeck(d1), [P2]: summarizeDeck(d2) }, kind: "decks", seed };
    }
    const bots = new Set<Seat>(
      opts.botSeats ??
        (mode === "goldfish" ? game.seats().filter((s) => s !== game.seats()[0]) : []),
    );
    const managed: ManagedGame = { bots, createdSeq: game.seq, game, id, mode, origin };
    this.games.set(id, managed);
    if (mode === "goldfish") {
      // Land on an actionable position: pass start-of-game trigger windows, let the bot act if it is up.
      await game.settle({ policy: passivePolicy });
      managed.lastAutoplay = await this.autoplay(managed);
    }
    return managed;
  }

  /**
   * Drive bot seats (goldfish): pass priority/focus, answer prompts with the
   * first option, end the turn when it is theirs. Stops at a human seat's
   * decision, game over, or when the bot has no answer ("stuck").
   */
  async autoplay(m: ManagedGame, maxSteps = 200): Promise<AutoplayReport> {
    const { game } = m;
    let steps = 0;
    if (m.bots.size === 0) {
      return { steps };
    }
    for (; steps < maxSteps; steps++) {
      if (game.isOver()) {
        return { steps };
      }
      const d = game.decision();
      if (!d || !m.bots.has(d.seat)) {
        return { steps };
      }
      const answer = goldfishAnswer(d, game);
      if (!answer) {
        return { steps, stuck: `${d.seat} (bot) has no answer for "${d.prompt}" (${d.kind})` };
      }
      const r = await game.act(d.seat, answer);
      if (!r.ok) {
        return { steps, stuck: `${d.seat} (bot): ${r.error.code} ${r.error.message}` };
      }
    }
    return { steps, stuck: `bot exceeded ${maxSteps} steps` };
  }

  /** `act` + goldfish follow-through. */
  async act(m: ManagedGame, seat: Seat, answer: Answer): Promise<ActResult> {
    const r = await m.game.act(seat, answer);
    if (r.ok && !r.followUp) {
      m.lastAutoplay = await this.autoplay(m);
    }
    return r;
  }

  /** Coerce an MCP `answer` argument (full Answer or shorthand) against `seat`'s current decision. */
  coerce(m: ManagedGame, seat: Seat, raw: unknown): Answer {
    const d = m.game.backend.decisionFor(seat) ?? m.game.decision();
    const value = normalizeAnswerInput(raw);
    if (!d) {
      if (typeof value === "object" && value !== null && !Array.isArray(value) && "kind" in value) {
        return value as Answer;
      }
      if (m.game.isOver()) {
        throw new BadRequestError(
          `The game has ended (winner: ${m.game.winner() ?? "none"})`,
          { answer: raw as never },
          "GAME_OVER",
        );
      }
      throw new BadRequestError(
        "No decision is pending; cannot interpret a shorthand answer",
        { answer: raw as never },
        "NO_DECISION",
      );
    }
    const c = coerceAnswer(d, value as AnswerShorthand);
    if ("code" in c && !("kind" in c)) {
      throw new BadRequestError(c.message, { ...(c.detail ?? {}) }, c.code);
    }
    return c as Answer;
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function goldfishAnswer(d: Decision, game: Game): Answer | undefined {
  const first = firstOptionPolicy(d, game);
  if (first !== undefined) {
    const c = coerceAnswer(d, first);
    return "kind" in c ? (c as Answer) : undefined;
  }
  if (d.kind === "action") {
    if (d.endTurnKey) {
      return { key: d.endTurnKey, kind: "action" };
    }
    const proc = d.options.find(
      (o) =>
        o.moveId === "resolveFullCombat" ||
        o.moveId === "endShowdown" ||
        o.moveId === "resolveChain",
    );
    if (proc) {
      return { key: proc.key, kind: "action" };
    }
    if (d.passKey) {
      return { key: d.passKey, kind: "action" };
    }
  }
  return undefined;
}

/** Accept loose JSON from LLMs: {key,args} → action, {keys} → pick, {value:bool} → yes-no, {value:n} → integer, {name} → name. */
export function normalizeAnswerInput(raw: unknown): unknown {
  if (raw === null || raw === undefined) {
    throw new BadRequestError("`answer` is required");
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.kind === "string") {
    return o;
  }
  if (typeof o.key === "string") {
    return { args: o.args, decisionId: o.decisionId, key: o.key, kind: "action" };
  }
  if (Array.isArray(o.keys)) {
    return { decisionId: o.decisionId, keys: o.keys.map(String), kind: "pick" };
  }
  if (typeof o.value === "boolean") {
    return { decisionId: o.decisionId, kind: "yes-no", value: o.value };
  }
  if (typeof o.value === "number") {
    return { decisionId: o.decisionId, kind: "integer", value: o.value };
  }
  if (typeof o.name === "string") {
    return { decisionId: o.decisionId, kind: "name", name: o.name };
  }
  if (o.allocation && typeof o.allocation === "object") {
    return { allocation: o.allocation, decisionId: o.decisionId, kind: "distribute" };
  }
  if (o.decline === true) {
    return { decisionId: o.decisionId, kind: "decline" };
  }
  throw new BadRequestError(
    'Unrecognised answer object. Use {kind:"action",key,args?} | {kind:"pick",keys:[…]} | {kind:"yes-no",value} | {kind:"integer",value} | {kind:"name",name} | {kind:"decline"} or a shorthand (option key string, ["k"], true/false, number, "pass", "decline").',
    { answer: o as never },
  );
}

type AllCards = Parameters<typeof buildDefaultDeck>[0];

function resolveDeck(
  all: AllCards,
  req: DeckRequest | undefined,
  defaults: [string, string],
  seed: string,
): DeckConfig {
  if (req?.mainDeckCardIds && req.mainDeckCardIds.length > 0) {
    return {
      battlefieldIds: req.battlefieldIds ?? [],
      championId: req.championId,
      legendId: req.legendId,
      mainDeckCardIds: req.mainDeckCardIds,
      runeDeckCardIds: req.runeDeckCardIds ?? [],
    };
  }
  const [a, b] =
    req?.domains && req.domains.length >= 1
      ? [req.domains[0] as string, (req.domains[1] ?? req.domains[0]) as string]
      : defaults;
  const deck = buildDefaultDeck(all, a, b, req?.strategy ?? "cheap", seed);
  if (deck.mainDeckCardIds.length === 0) {
    throw new BadRequestError(`No cards found for domains ${a}/${b}`, { domains: [a, b] });
  }
  return {
    ...deck,
    championId: req?.championId ?? deck.championId,
    legendId: req?.legendId ?? deck.legendId,
  };
}

function summarizeDeck(d: DeckConfig): Record<string, unknown> {
  return {
    battlefields: d.battlefieldIds,
    champion: d.championId,
    legend: d.legendId,
    main: d.mainDeckCardIds.length,
    runes: d.runeDeckCardIds.length,
  };
}

/** Fill defaults so an LLM may send a partial ScenarioSpec. */
export function normalizeScenario(
  input: Partial<ScenarioSpec> & Record<string, unknown>,
  seed: string,
): ScenarioSpec {
  const players = (input.players as Seat[] | undefined) ?? [P1, P2];
  const battlefields = ((input.battlefields as Record<string, unknown>[] | undefined) ?? []).map(
    (b, i) => ({
      contested: b.contested as boolean | undefined,
      contestedBy: b.contestedBy as Seat | undefined,
      controller: (b.controller as Seat | null | undefined) ?? null,
      def: b.def as ScenarioSpec["battlefields"][number]["def"],
      id: (b.id as string | undefined) ?? `bf${i + 1}`,
      inert: (b.inert as boolean | undefined) ?? true,
      owner:
        (b.owner as Seat | undefined) ?? (b.controller as Seat | undefined) ?? (players[0] as Seat),
    }),
  );
  let k = 0;
  const cards = ((input.cards as Record<string, unknown>[] | undefined) ?? []).map((c) => {
    if (c.def === undefined || c.owner === undefined || c.zone === undefined) {
      throw new BadRequestError(
        "scenario.cards[] entries need {def, owner, zone} (id/alias optional)",
        { card: c as never },
      );
    }
    k += 1;
    return {
      controller: c.controller as Seat | undefined,
      def: c.def as ScenarioSpec["cards"][number]["def"],
      id: (c.id as string | undefined) ?? (c.alias as string | undefined) ?? `k${k}`,
      meta: c.meta as ScenarioSpec["cards"][number]["meta"],
      owner: c.owner as Seat,
      zone: c.zone as string,
    };
  });
  const resources: Record<string, { energy: number; power: Record<string, number> }> = {};
  for (const [seat, r] of Object.entries(
    (input.resources as
      | Record<string, { energy?: number; power?: Record<string, number> }>
      | undefined) ?? {},
  )) {
    resources[SEAT_ALIASES[seat.toLowerCase()] ?? seat] = {
      energy: r?.energy ?? 0,
      power: { ...(r?.power ?? {}) },
    };
  }
  return {
    ...input,
    active: (input.active as Seat | undefined) ?? (players[0] as Seat),
    battlefields,
    cards,
    fillDecks:
      input.fillDecks === undefined
        ? { main: 10, runes: 12 }
        : (input.fillDecks as ScenarioSpec["fillDecks"]),
    phase: (input.phase as ScenarioSpec["phase"] | undefined) ?? "main",
    players,
    points: input.points as ScenarioSpec["points"],
    resources,
    seed: (input.seed as string | undefined) ?? seed,
    turn: (input.turn as number | undefined) ?? 2,
    victoryScore: input.victoryScore as number | undefined,
    xp: input.xp as ScenarioSpec["xp"],
  };
}
