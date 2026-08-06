/**
 * MCP tool definitions: JSON Schemas + handlers over the GameManager.
 *
 * Every game-scoped response is an envelope `{ ok, gameId, seq, next, … }`
 * where `next` is a one-line hint saying whose decision it is and its kind.
 * Game-level failures come back as `{ ok:false, error:{code,message,detail} }`
 * with `isError: true` (codes = HarnessError codes + GAME_NOT_FOUND).
 */

import type {
  ActResult,
  ActionDecision,
  ActionOption,
  Answer,
  CardDefLike,
  Decision,
  PlayArgs,
  Seat,
} from "@tcg/riftbound/harness";
import { HarnessError, canSee, passivePolicy, firstOptionPolicy } from "@tcg/riftbound/harness";
import type { GameManager, ManagedGame } from "./game-manager";
import { BadRequestError, GameNotFoundError } from "./game-manager";
import type { JsonObject, ToolResult, ToolSpec } from "./mcp-lite";
import type { Mutex } from "./mutex";
import type { Detail } from "./render";
import {
  compactCard,
  describeState,
  nextHint,
  recentLog,
  slimDecision,
  slimOption,
  stepLine,
} from "./render";

export interface ToolContext {
  manager: GameManager;
  mutex: Mutex;
}

// ---------------------------------------------------------------------------
// schema fragments
// ---------------------------------------------------------------------------

const S = {
  bool: (description: string) => ({ description, type: "boolean" }),
  card: (
    description = "Card instance id (from describe_state / current_decision). A unique card name in your legal options also works.",
  ) => ({ description, type: "string" }),
  cards: (description: string) => ({ description, items: { type: "string" }, type: "array" }),
  gameId: { description: "Game id returned by create_game", type: "string" },
  int: (description: string) => ({ description, type: "integer" }),
  seat: {
    description: 'Seat you act/observe as: "player-1" (alias "p1") or "player-2" ("p2")',
    type: "string",
  },
  str: (description: string) => ({ description, type: "string" }),
  to: {
    description:
      'Destination/location: "base", a battlefield id (e.g. "player-2-bf-ogn-289-298" or scenario "bf1"), or "battlefield-<id>"',
    type: "string",
  },
};

function schema(properties: JsonObject, required: string[]): JsonObject {
  return { additionalProperties: false, properties, required, type: "object" };
}

const answerSchema: JsonObject = {
  description:
    'Harness Answer or shorthand. Action: {kind:"action", key:"<option key>", args?:{to,targets,x,repeat,flow,accelerate,payOptional,sacrifice,discard,costTarget,units,domain}} or just the option key string. Prompt (pick): "<option key>" | ["k1","k2"] | {kind:"pick",keys:[…]} | "decline". yes-no: true/false. integer (X): a number. name: {kind:"name",name}. distribute: {kind:"distribute",allocation:{key:n}}. "pass" passes priority/focus. Optional decisionId (from current_decision) guards against stale answers.',
};

// ---------------------------------------------------------------------------
// result helpers
// ---------------------------------------------------------------------------

function result(body: JsonObject, opts: { text?: string; isError?: boolean } = {}): ToolResult {
  const jsonText = JSON.stringify(body);
  return {
    content: [{ text: opts.text ? `${opts.text}\n\n${jsonText}` : jsonText, type: "text" }],
    isError: opts.isError === true ? true : undefined,
    structuredContent: body,
  };
}

function errorBody(error: unknown): { code: string; message: string; detail?: unknown } {
  if (error instanceof HarnessError) {
    return { code: error.code, detail: error.detail, message: error.message };
  }
  if (error instanceof BadRequestError) {
    return { code: error.code, detail: error.detail, message: error.message };
  }
  if (error instanceof GameNotFoundError) {
    return { code: error.code, message: error.message };
  }
  return { code: "INTERNAL", message: error instanceof Error ? error.message : String(error) };
}

function envelope(m: ManagedGame, body: JsonObject): JsonObject {
  return { gameId: m.id, next: nextHint(m), ok: body.ok ?? true, seq: m.game.seq, ...body };
}

// ---------------------------------------------------------------------------
// tool plumbing
// ---------------------------------------------------------------------------

type Handler = (args: JsonObject) => Promise<ToolResult> | ToolResult;
type GameHandler = (m: ManagedGame, args: JsonObject) => Promise<ToolResult> | ToolResult;

export function defineTools(ctx: ToolContext): ToolSpec[] {
  const { manager, mutex } = ctx;
  const tools: ToolSpec[] = [];

  const guarded =
    (fn: Handler): Handler =>
    (args) =>
      mutex.run(async () => {
        try {
          return await fn(args);
        } catch (error) {
          return result({ error: errorBody(error), ok: false }, { isError: true });
        }
      });

  const withGame =
    (fn: GameHandler): Handler =>
    async (args) => {
      const id = args.gameId;
      if (typeof id !== "string") {
        throw new BadRequestError("gameId is required (call create_game or list_games)");
      }
      const m = manager.get(id);
      try {
        return await fn(m, args);
      } catch (error) {
        return result(envelope(m, { error: errorBody(error), ok: false }), { isError: true });
      }
    };

  const add = (name: string, description: string, inputSchema: JsonObject, handler: Handler) => {
    tools.push({ description, handler: guarded(handler), inputSchema, name });
  };
  const addGame = (
    name: string,
    description: string,
    inputSchema: JsonObject,
    handler: GameHandler,
  ) => add(name, description, inputSchema, withGame(handler));

  // ---- act core ---------------------------------------------------------------

  const actAndReport = async (
    m: ManagedGame,
    seat: Seat,
    answer: Answer | (() => Promise<ActResult> | ActResult),
    extra: JsonObject = {},
  ): Promise<ToolResult> => {
    const before = m.game.seq;
    const r: ActResult =
      typeof answer === "function" ? await answer() : await manager.act(m, seat, answer);
    const events = recentLog(m, 50, before);
    if (!r.ok) {
      return result(
        envelope(m, {
          decision: slimDecision(r.decision),
          error: r.error as unknown as JsonObject,
          events,
          ok: false,
          ...extra,
        }),
        { isError: true },
      );
    }
    const body: JsonObject = {
      autoplay:
        m.lastAutoplay && (m.lastAutoplay.steps > 0 || m.lastAutoplay.stuck)
          ? (m.lastAutoplay as unknown as JsonObject)
          : undefined,
      decision: slimDecision(m.game.decision()),
      events,
      executed: r.executed as unknown as JsonObject[],
      followUp: r.followUp ? slimDecision(r.followUp) : undefined,
      ok: true,
      violations: r.violations.length ? (r.violations as unknown as JsonObject[]) : undefined,
      ...extra,
    };
    return result(envelope(m, body));
  };

  const menuOf = (m: ManagedGame, seat: Seat): ActionDecision | null => {
    const d = m.game.backend.decisionFor(seat);
    return d && d.kind === "action" ? d : null;
  };

  const explainNoOption = (m: ManagedGame, seat: Seat, why: string): BadRequestError => {
    const d = m.game.decision();
    const menu = menuOf(m, seat);
    const cursor = d
      ? `current decision: ${d.seat} ${d.kind}${d.kind === "action" ? `/${d.context}` : ""} "${d.prompt}"`
      : "no decision pending";
    return new BadRequestError(
      `${why} is not legal for ${seat} now (${cursor}). Legal: ${menu?.options.map((o) => o.label).join(", ") || "(nothing)"}`,
      { legal: menu?.options.map((o) => o.key) ?? [] },
      "UNKNOWN_OPTION",
    );
  };

  /** Resolve a `card` argument: exact instance id, else a unique name among candidate options. */
  const resolveCard = (
    m: ManagedGame,
    raw: unknown,
    candidates: readonly ActionOption[],
  ): string => {
    if (typeof raw !== "string" || !raw) {
      throw new BadRequestError("`card` is required (instance id)");
    }
    if (m.game.has(raw)) {
      return raw;
    }
    const lc = raw.toLowerCase();
    const byName = candidates.filter(
      (o) => o.card && m.game.state(o.card).name.toLowerCase() === lc,
    );
    const unique = [...new Set(byName.map((o) => o.card as string))];
    if (unique.length === 1) {
      return unique[0] as string;
    }
    throw new BadRequestError(
      unique.length > 1
        ? `Card name "${raw}" is ambiguous (${unique.join(", ")}); pass the instance id`
        : `No card "${raw}" (use instance ids from describe_state / current_decision)`,
      { card: raw, matches: unique },
      "CARD_NOT_FOUND",
    );
  };

  const pickArgs = (args: JsonObject, keys: (keyof PlayArgs)[]): PlayArgs => {
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      if (args[k] !== undefined && args[k] !== null) {
        out[k] = args[k];
      }
    }
    return out as PlayArgs;
  };

  const settleLoop = async (m: ManagedGame, policyName: unknown, maxSteps?: number) => {
    const policy =
      policyName === "firstOption" || policyName === "first" ? firstOptionPolicy : passivePolicy;
    let steps = 0;
    let reason = "open";
    let botSteps = 0;
    for (let round = 0; round < 20; round++) {
      const before = m.game.seq;
      const r = await m.game.settle({ maxSteps, policy });
      steps += r.steps;
      reason = r.reason;
      const auto = await manager.autoplay(m);
      m.lastAutoplay = auto;
      botSteps += auto.steps;
      if (m.game.seq === before) {
        break;
      }
    }
    return { botSteps, reason, steps };
  };

  // ---- lifecycle ------------------------------------------------------------------

  add(
    "create_game",
    'Create a new headless Riftbound game and return its gameId. Default: mode "goldfish" (you are player-1; player-2 is a passive bot that only passes and ends its turn) with auto-built starter decks. Use mode "duel" to control both seats. Pass `scenario` (harness ScenarioSpec: turn/active/resources/battlefields/cards placements) to start from a constructed mid-game position instead of decks.',
    schema(
      {
        autoProcedures: S.bool(
          "Auto-run combat resolution / showdown end / chain resolution (default true)",
        ),
        decks: {
          description:
            'Per-seat deck: {domains:["fury","chaos"], strategy?:"cheap"|"random"} for an auto-built deck, or a full {mainDeckCardIds,runeDeckCardIds,battlefieldIds,legendId?,championId?}. Defaults: p1 fury/chaos, p2 calm/mind.',
          properties: { p1: { type: "object" }, p2: { type: "object" } },
          type: "object",
        },
        mode: {
          description: "goldfish (default) | duel",
          enum: ["goldfish", "duel"],
          type: "string",
        },
        scenario: {
          description:
            'Partial harness ScenarioSpec: {turn?:2, phase?:"main", active?:"player-1", resources?:{"player-1":{energy,power:{fury:1}}}, battlefields?:[{id:"bf1",controller?:seat|null}], cards:[{id?:"alias", def:"ogn-004-298"|{cardType,might,…}, owner:seat, zone:"hand"|"base"|"bf1"|"trash"|"runePool"|"mainDeck"|…, meta?:{damage,exhausted,…}}], fillDecks?:{main,runes}|false}',
          type: "object",
        },
        seed: S.str("RNG seed for reproducible games"),
      },
      [],
    ),
    async (args) => {
      const m = await manager.create({
        autoProcedures: args.autoProcedures as boolean | undefined,
        decks: args.decks as never,
        mode: args.mode as never,
        scenario: args.scenario as never,
        seed: args.seed as string | undefined,
      });
      const you = m.game.seats().find((s) => !m.bots.has(s)) ?? (m.game.seats()[0] as Seat);
      const desc = describeState(m, you, "summary");
      return result(
        envelope(m, {
          bots: [...m.bots],
          decision: slimDecision(m.game.decision()),
          mode: m.mode,
          origin: m.origin as unknown as JsonObject,
          seats: [...m.game.seats()],
          you,
        }),
        { text: desc.text },
      );
    },
  );

  add("list_games", "List live games held by this server.", schema({}, []), () =>
    result({
      games: manager.list().map((m) => ({
        bots: [...m.bots],
        gameId: m.id,
        mode: m.mode,
        next: nextHint(m),
        seats: [...m.game.seats()],
        seq: m.game.seq,
        status: m.game.gameState.status,
        turn: m.game.gameState.turn,
      })),
      ok: true,
    }),
  );

  add(
    "close_game",
    "Discard a game and free its memory.",
    schema({ gameId: S.gameId }, ["gameId"]),
    (args) => {
      const m = manager.get(String(args.gameId));
      const closed = manager.close(m.id);
      return result({
        closed,
        gameId: m.id,
        ok: closed,
        remaining: manager.list().map((g) => g.id),
      });
    },
  );

  // ---- observation ------------------------------------------------------------------

  addGame(
    "describe_state",
    "Describe the game as `seat` sees it: a compact text board summary plus JSON (turn, points, resources, battlefields with units, your hand (only yours), bases, runes, chain, showdown, pending choice, current decision summary, recent log). detail: summary (default) | zones (adds every zone) | full (adds the raw Observation).",
    schema(
      {
        detail: { enum: ["summary", "zones", "full"], type: "string" },
        gameId: S.gameId,
        seat: S.seat,
      },
      ["gameId", "seat"],
    ),
    (m, args) => {
      const seat = manager.seat(m, args.seat);
      const d = describeState(
        m,
        seat,
        ((args.detail as Detail | undefined) ?? "summary") as Detail,
      );
      return result(envelope(m, d.json), { text: d.text });
    },
  );

  addGame(
    "current_decision",
    "Return the pending harness Decision: who must decide, its kind (action | pick | yes-no | integer | name | distribute | …), prompt, and options with stable keys (action options also list `fields` = the args each accepts and their legal values). Without `seat`: the cursor decision. With `seat`: that seat's own decision (the cursor if it is theirs, else their free actions such as tapping runes), or null.",
    schema({ gameId: S.gameId, seat: S.seat }, ["gameId"]),
    (m, args) => {
      const seat = args.seat !== undefined ? manager.seat(m, args.seat) : undefined;
      const cursor = m.game.decision();
      const d: Decision | null = seat ? m.game.backend.decisionFor(seat) : cursor;
      return result(
        envelope(m, {
          cursorSeat: cursor?.seat ?? null,
          decision: slimDecision(d),
          isCursor: Boolean(d && cursor && d.id === cursor.id),
          seat: seat ?? cursor?.seat ?? null,
        }),
      );
    },
  );

  addGame(
    "list_legal_actions",
    "List `seat`'s legal action options right now (empty when a non-action prompt is pending — see current_decision). Each option has a stable `key` for `act`, a verb (play/cast/move/tapRune/endTurn/…), the card, and `fields` describing accepted args. groupBy: card | move. flat=true returns the raw engine variants {moveId, params} instead (can be large).",
    schema(
      {
        flat: S.bool("Return flat engine variants"),
        gameId: S.gameId,
        groupBy: { enum: ["card", "move"], type: "string" },
        limit: S.int("Max flat variants (default 300)"),
        seat: S.seat,
      },
      ["gameId", "seat"],
    ),
    (m, args) => {
      const seat = manager.seat(m, args.seat);
      const d = m.game.backend.decisionFor(seat);
      const menu = d && d.kind === "action" ? d : null;
      const base: JsonObject = {
        context: menu?.context ?? null,
        endTurnKey: menu?.endTurnKey,
        passKey: menu?.passKey,
        prompt: d && d.kind !== "action" ? slimDecision(d) : undefined,
        seat,
      };
      if (!menu) {
        return result(envelope(m, { ...base, actions: [] }));
      }
      if (args.flat === true) {
        const limit = typeof args.limit === "number" ? args.limit : 300;
        const flat = menu.options.flatMap((o) =>
          o.variants.map((v) => ({ key: o.key, moveId: v.moveId, params: v.params as JsonObject })),
        );
        return result(
          envelope(m, {
            ...base,
            total: flat.length,
            truncated: flat.length > limit,
            variants: flat.slice(0, limit),
          }),
        );
      }
      const slim = menu.options.map((o) => slimOption(o));
      if (args.groupBy === "card" || args.groupBy === "move") {
        const groups: Record<string, unknown[]> = {};
        for (const o of slim) {
          const k = args.groupBy === "card" ? String(o.card ?? "-") : String(o.moveId);
          (groups[k] ??= []).push(o);
        }
        return result(envelope(m, { ...base, actions: groups, groupBy: args.groupBy }));
      }
      return result(envelope(m, { ...base, actions: slim }));
    },
  );

  addGame(
    "card_state",
    "Full CardState of one card instance (zone, owner, might, damage, exhausted, keywords, attachments, raw meta). With `seat`, cards that seat cannot see (opponent hand, decks, facedown) are redacted.",
    schema({ card: S.card("Card instance id"), gameId: S.gameId, seat: S.seat }, [
      "gameId",
      "card",
    ]),
    (m, args) => {
      const card = String(args.card ?? "");
      if (!m.game.has(card)) {
        throw new BadRequestError(`No card instance "${card}"`, { card }, "CARD_NOT_FOUND");
      }
      const st = m.game.state(card);
      if (args.seat !== undefined) {
        const seat = manager.seat(m, args.seat);
        if (!canSee(seat, st.zone, st.owner)) {
          return result(
            envelope(m, { card: { hidden: true, id: card, owner: st.owner, zone: st.zone } }),
          );
        }
      }
      return result(envelope(m, { card: st as unknown as JsonObject }));
    },
  );

  add(
    "card_text",
    'Look up a card definition by set id (e.g. "ogn-004-298") or name: rules text, type, cost, might, keywords and a summary of its parsed abilities. Works without a game. Inside a game, card instance ids usually embed the def id (…-ogn-004-298).',
    schema(
      {
        defId: S.str("Card definition id, e.g. ogn-004-298"),
        limit: S.int("Max matches for name search (default 5)"),
        name: S.str("Card name (case-insensitive; substring allowed)"),
      },
      [],
    ),
    async (args) => {
      const pool = await manager.cardPool();
      const limit = typeof args.limit === "number" ? args.limit : 5;
      let defs: CardDefLike[] = [];
      if (typeof args.defId === "string" && args.defId) {
        const d = pool.get(args.defId) ?? pool.get(extractDefId(args.defId));
        defs = d ? [d] : [];
      } else if (typeof args.name === "string" && args.name) {
        const lc = args.name.toLowerCase();
        const all = pool.all();
        defs = all.filter((c) => (c.name ?? "").toLowerCase() === lc);
        if (defs.length === 0) {
          defs = all.filter((c) => (c.name ?? "").toLowerCase().includes(lc));
        }
      } else {
        throw new BadRequestError("Pass defId or name");
      }
      if (defs.length === 0) {
        return result(
          {
            error: {
              code: "CARD_NOT_FOUND",
              message: `No card definition matches ${JSON.stringify(args.defId ?? args.name)}`,
            },
            ok: false,
          },
          { isError: true },
        );
      }
      const cards = defs.slice(0, limit).map(describeDef);
      const text = cards
        .map(
          (c) =>
            `${c.name} (${c.defId}) — ${c.cardType}${c.cost ? `, cost ${c.cost}` : ""}${c.might !== undefined ? `, might ${c.might}` : ""}${c.domains.length ? `, ${c.domains.join("/")}` : ""}\n${c.rulesText ?? "(no rules text)"}\nAbilities: ${c.abilities.length ? c.abilities.join(" | ") : "(none parsed)"}`,
        )
        .join("\n\n");
      return result({ cards, ok: true, totalMatches: defs.length }, { text });
    },
  );

  addGame(
    "history",
    "Transcript of executed steps (seq, seat, decision kind, answer, engine moves executed incl. automatic procedures) since `sinceSeq` (exclusive), plus human-readable lines.",
    schema(
      {
        gameId: S.gameId,
        limit: S.int("Max steps returned (default 50, most recent)"),
        sinceSeq: S.int("Return steps with seq > sinceSeq"),
      },
      ["gameId"],
    ),
    (m, args) => {
      const t = m.game.backend.transcript();
      const since = typeof args.sinceSeq === "number" ? args.sinceSeq : undefined;
      const limit = typeof args.limit === "number" ? args.limit : 50;
      let steps = since !== undefined ? t.steps.filter((s) => s.n > since) : t.steps;
      steps = steps.slice(-limit);
      return result(
        envelope(m, {
          lines: steps.map(stepLine),
          origin: t.origin.kind,
          steps: steps.map((s) => ({
            answer: s.answer as unknown as JsonObject,
            decision: s.decision,
            executed: s.executed as unknown as JsonObject[],
            hash: s.hash,
            ok: s.ok,
            seat: s.seat,
            seq: s.n,
          })),
          totalSteps: t.steps.length,
        }),
        { text: steps.map(stepLine).join("\n") },
      );
    },
  );

  // ---- acting -------------------------------------------------------------------------

  addGame(
    "act",
    'Answer `seat`\'s current decision (or take one of its free actions). For action decisions send the option key from current_decision/list_legal_actions plus optional args (to, targets, x, repeat, accelerate, sacrifice, units, …). If required args are omitted and several variants match, the response carries a `followUp` pick/integer decision — answer it with another `act` (or {kind:"decline"} to cancel). Prompts (pick / yes-no / integer / name) take the option key(s), true/false, a number, or "decline". Errors: STALE_DECISION, NOT_YOUR_DECISION, UNKNOWN_OPTION, ILLEGAL_ARGS, WRONG_ANSWER_KIND, ENGINE_REJECTED.',
    schema({ answer: answerSchema, gameId: S.gameId, seat: S.seat }, ["gameId", "seat", "answer"]),
    async (m, args) => {
      const seat = manager.seat(m, args.seat);
      const answer = manager.coerce(m, seat, args.answer);
      return actAndReport(m, seat, answer);
    },
  );

  addGame(
    "play_card",
    "Play a card from your hand as `seat`: units/gear (optionally `to` a location, `accelerate` to pay the optional extra cost, `sacrifice`), spells (`targets`, `x`, `repeat`, `flow` from trash, `payOptional`), or your champion from the champion zone. Costs are paid from your rune pool — tap runes first. Missing choices come back as a followUp decision.",
    schema(
      {
        accelerate: S.bool("Pay the Accelerate / optional additional cost (unit enters ready)"),
        card: S.card(),
        costTarget: S.card("playGear interactive cost reduction target"),
        flow: S.bool("Cast from trash via Flow"),
        gameId: S.gameId,
        payOptional: S.bool("Pay the spell/unit optional additional cost"),
        repeat: S.int("Repeat count for [Repeat] spells"),
        sacrifice: S.card("Friendly permanent to kill as an additional cost"),
        seat: S.seat,
        targets: {
          description: "Spell target id or ordered list of ids",
          oneOf: [{ type: "string" }, { items: { type: "string" }, type: "array" }],
        },
        to: S.to,
        x: S.int("X for variable-cost spells"),
      },
      ["gameId", "seat", "card"],
    ),
    async (m, args) => {
      const seat = manager.seat(m, args.seat);
      const menu = menuOf(m, seat);
      const playMoves = new Set(["playUnit", "playGear", "playSpell", "playFromChampionZone"]);
      const candidates = (menu?.options ?? []).filter((o) => playMoves.has(o.moveId));
      const champion = m.game.seat(seat).champion();
      const cardArg =
        typeof args.card === "string" && args.card.toLowerCase() === "champion" && champion
          ? champion
          : args.card;
      const card = resolveCard(m, cardArg, candidates);
      const option =
        candidates.find((o) => o.card === card) ??
        (card === champion
          ? candidates.find((o) => o.moveId === "playFromChampionZone")
          : undefined);
      if (!option) {
        throw explainNoOption(m, seat, `play_card(${card})${explainCard(m, seat, card)}`);
      }
      const a = pickArgs(args, [
        "to",
        "targets",
        "x",
        "repeat",
        "flow",
        "accelerate",
        "payOptional",
        "sacrifice",
        "costTarget",
      ]);
      return actAndReport(
        m,
        seat,
        { args: a, key: option.key, kind: "action" },
        { option: option.key },
      );
    },
  );

  addGame(
    "activate_ability",
    "Activate an activated ability of one of your permanents / legend as `seat` (abilityIndex defaults to 0). Ability targets are usually asked at resolution as a pick decision.",
    schema(
      {
        abilityIndex: S.int("Ability index on the card (default 0)"),
        card: S.card(),
        discard: S.card("Hand card to discard as cost"),
        gameId: S.gameId,
        sacrifice: S.card("Friendly permanent to kill as cost"),
        seat: S.seat,
        targets: {
          description: "Target id(s) when the ability locks targets at activation",
          oneOf: [{ type: "string" }, { items: { type: "string" }, type: "array" }],
        },
      },
      ["gameId", "seat", "card"],
    ),
    async (m, args) => {
      const seat = manager.seat(m, args.seat);
      const menu = menuOf(m, seat);
      const candidates = (menu?.options ?? []).filter((o) => o.moveId === "activateAbility");
      const card = resolveCard(m, args.card, candidates);
      const idx = typeof args.abilityIndex === "number" ? args.abilityIndex : undefined;
      const mine = candidates.filter((o) => o.card === card);
      const option =
        idx !== undefined ? mine.find((o) => o.key === `activateAbility:${card}#${idx}`) : mine[0];
      if (!option) {
        throw explainNoOption(m, seat, `activate_ability(${card}#${idx ?? 0})`);
      }
      const a = pickArgs(args, ["sacrifice", "discard", "targets"]);
      return actAndReport(
        m,
        seat,
        { args: a, key: option.key, kind: "action" },
        { option: option.key },
      );
    },
  );

  addGame(
    "move_units",
    "Move one or more of your ready units as `seat` to a battlefield or back to base (standard move; exhausts them). Moving into an enemy-held battlefield opens a combat showdown. A single unit already at a battlefield may `gank` to another battlefield when it has Ganking.",
    schema(
      {
        gameId: S.gameId,
        gank: S.bool("Force a ganking move (battlefield → battlefield)"),
        seat: S.seat,
        to: S.to,
        units: {
          description: "Unit id or list of unit ids",
          oneOf: [{ type: "string" }, { items: { type: "string" }, type: "array" }],
        },
      },
      ["gameId", "seat", "units", "to"],
    ),
    async (m, args) => {
      const seat = manager.seat(m, args.seat);
      const menu = menuOf(m, seat);
      const options = menu?.options ?? [];
      const rawUnits = Array.isArray(args.units) ? args.units : [args.units];
      const moveCandidates = options.filter(
        (o) =>
          o.moveId === "standardMove" || o.moveId === "gankingMove" || o.moveId === "recallUnit",
      );
      const unitCandidates: ActionOption[] = moveCandidates.flatMap((o) =>
        o.moveId === "standardMove"
          ? [
              ...new Set(
                o.variants.flatMap((v) => (v.params.unitIds as string[] | undefined) ?? []),
              ),
            ].map((u) => ({ ...o, card: u }))
          : [o],
      );
      const units = rawUnits.map((u) => resolveCard(m, u, unitCandidates));
      const dest = normalizeDest(String(args.to ?? ""));
      const std = options.find((o) => o.key === `standardMove:to:${dest}`);
      const stdCovers =
        std?.variants.some((v) => sameSet((v.params.unitIds as string[]) ?? [], units)) ?? false;
      if (units.length === 1) {
        const gank = options.find((o) => o.key === `gankingMove:${units[0]}`);
        if (gank && (args.gank === true || !stdCovers)) {
          return actAndReport(
            m,
            seat,
            { args: { to: dest }, key: gank.key, kind: "action" },
            { option: gank.key },
          );
        }
        const recall = options.find((o) => o.key === `recallUnit:${units[0]}`);
        if (recall && dest === "base" && !stdCovers) {
          return actAndReport(m, seat, { key: recall.key, kind: "action" }, { option: recall.key });
        }
      }
      if (!std) {
        throw explainNoOption(m, seat, `move_units(${units.join("+")} → ${dest})`);
      }
      return actAndReport(
        m,
        seat,
        { args: { to: dest, units }, key: std.key, kind: "action" },
        { option: std.key },
      );
    },
  );

  const runeTool = (name: string, moveId: "exhaustRune" | "recycleRune", description: string) =>
    addGame(
      name,
      description,
      schema(
        {
          count: S.int("How many runes (default 1)"),
          domain: S.str("Only runes of this domain (fury, chaos, calm, mind, body, order)"),
          gameId: S.gameId,
          rune: S.card("Specific rune id (default: first ready matching rune)"),
          seat: S.seat,
        },
        ["gameId", "seat"],
      ),
      async (m, args) => {
        const seat = manager.seat(m, args.seat);
        const count = Math.max(1, typeof args.count === "number" ? args.count : 1);
        let last: ToolResult | undefined;
        const done: string[] = [];
        for (let i = 0; i < count; i++) {
          const options = (menuOf(m, seat)?.options ?? []).filter(
            (o) => o.moveId === moveId && o.card,
          );
          let option: ActionOption | undefined;
          if (typeof args.rune === "string" && args.rune) {
            option = options.find((o) => o.card === args.rune);
          } else if (typeof args.domain === "string" && args.domain) {
            const dom = args.domain.toLowerCase();
            option = options.find((o) => m.game.state(o.card as string).domains.includes(dom));
          } else {
            option = options[0];
          }
          if (!option) {
            if (done.length > 0) {
              return result(
                envelope(m, {
                  decision: slimDecision(m.game.decision()),
                  events: recentLog(m, count),
                  note: `only ${done.length}/${count} runes available`,
                  ok: true,
                  runes: done,
                }),
              );
            }
            throw explainNoOption(m, seat, `${name}(${String(args.rune ?? args.domain ?? "any")})`);
          }
          last = await actAndReport(
            m,
            seat,
            { key: option.key, kind: "action" },
            { runes: [...done, option.card as string] },
          );
          if (last.isError) {
            return last;
          }
          done.push(option.card as string);
        }
        return last as ToolResult;
      },
    );

  runeTool(
    "tap_rune",
    "exhaustRune",
    "Tap (exhaust) ready runes in your rune pool for +1 energy each. `count` taps several; `domain`/`rune` select which. Energy empties at end of turn.",
  );
  runeTool(
    "recycle_rune",
    "recycleRune",
    "Recycle a rune (put it under your rune deck) for +1 power of its domain. `domain`/`rune` select which; `count` repeats.",
  );

  const passTool = (name: string, moveId: string | undefined, description: string) =>
    addGame(
      name,
      description,
      schema({ gameId: S.gameId, seat: S.seat }, ["gameId", "seat"]),
      async (m, args) => {
        const seat = manager.seat(m, args.seat);
        const menu = menuOf(m, seat);
        const option = menu?.passKey ? menu.options.find((o) => o.key === menu.passKey) : undefined;
        if (!option || (moveId && option.moveId !== moveId)) {
          throw explainNoOption(m, seat, `${name}()`);
        }
        return actAndReport(m, seat, { key: option.key, kind: "action" }, { option: option.key });
      },
    );

  passTool(
    "pass_priority",
    "passChainPriority",
    "Pass chain priority as `seat` (when a spell/ability is on the chain). When every relevant player passes, the top item resolves.",
  );
  passTool(
    "pass_focus",
    "passShowdownFocus",
    "Pass showdown focus as `seat`. When everyone passes, combat resolves (automatically) or the showdown ends.",
  );
  passTool("pass", undefined, "Pass priority or focus as `seat`, whichever applies.");

  addGame(
    "end_turn",
    "End `seat`'s turn (must be the turn player in an open main phase with nothing contested). Runs end-of-turn → next player's awaken/beginning/channel/draw automatically; in goldfish mode the bot then ends its own turn so play returns to you (call settle if a start-of-turn trigger leaves you holding priority).",
    schema({ gameId: S.gameId, seat: S.seat }, ["gameId", "seat"]),
    async (m, args) => {
      const seat = manager.seat(m, args.seat);
      const menu = menuOf(m, seat);
      if (!menu?.endTurnKey) {
        const contested = Object.values(m.game.gameState.battlefields ?? {})
          .filter((b) => b.contested)
          .map((b) => b.id);
        throw explainNoOption(
          m,
          seat,
          `end_turn()${contested.length ? ` [contested: ${contested.join(", ")}]` : ""}`,
        );
      }
      return actAndReport(
        m,
        seat,
        { key: menu.endTurnKey, kind: "action" },
        { option: menu.endTurnKey },
      );
    },
  );

  addGame(
    "concede",
    "Concede the game as `seat`.",
    schema({ gameId: S.gameId, seat: S.seat }, ["gameId", "seat"]),
    async (m, args) => {
      const seat = manager.seat(m, args.seat);
      const option = menuOf(m, seat)?.options.find((o) => o.moveId === "concede");
      if (!option) {
        // A seat whose only legal move is concede has no harness menu (decisionFor() → null),
        // so `act` would say NOT_YOUR_DECISION; concede is always legal — use the raw-move hatch.
        return actAndReport(m, seat, () => m.game.backend.raw(seat, "concede", {}), {
          option: "concede:-",
        });
      }
      return actAndReport(m, seat, { key: option.key, kind: "action" }, { option: option.key });
    },
  );

  addGame(
    "settle",
    'Drain everything that is not an open main-phase decision: pass priority/focus for all seats, run automatic procedures, take forced single-option picks (policy passive, default) or answer every prompt with its first option (policy firstOption); bot seats also act. Stops at an open decision, an unanswerable prompt (reason "unanswered" — answer it via act), or game over.',
    schema(
      {
        gameId: S.gameId,
        maxSteps: S.int("Safety bound per round (default 200)"),
        policy: { enum: ["passive", "firstOption"], type: "string" },
      },
      ["gameId"],
    ),
    async (m, args) => {
      const before = m.game.seq;
      const r = await settleLoop(
        m,
        args.policy,
        typeof args.maxSteps === "number" ? args.maxSteps : undefined,
      );
      return result(
        envelope(m, {
          ...r,
          decision: slimDecision(m.game.decision()),
          events: recentLog(m, 50, before),
          ok: true,
        }),
      );
    },
  );

  addGame(
    "advance_turn",
    "End the current turn player's turn and settle into the next open main phase (start-of-turn triggers passed/answered per `policy`). In goldfish mode this comes back around to your next turn.",
    schema({ gameId: S.gameId, policy: { enum: ["passive", "firstOption"], type: "string" } }, [
      "gameId",
    ]),
    async (m, args) => {
      const before = m.game.seq;
      const policy = args.policy === "firstOption" ? firstOptionPolicy : passivePolicy;
      const r = await m.game.advanceTurn({ policy });
      const s = await settleLoop(m, args.policy);
      return result(
        envelope(m, {
          decision: slimDecision(m.game.decision()),
          events: recentLog(m, 50, before),
          ok: true,
          settled: s,
          turn: { activePlayer: m.game.turnPlayer(), number: m.game.turnNumber(), reached: r },
        }),
      );
    },
  );

  return tools;
}

// ---------------------------------------------------------------------------
// misc helpers
// ---------------------------------------------------------------------------

function normalizeDest(to: string): string {
  if (!to) {
    throw new BadRequestError('`to` is required ("base" or a battlefield id)');
  }
  return to.startsWith("battlefield-") ? to.slice("battlefield-".length) : to;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((x, i) => x === sb[i]);
}

/** Why can't this card be played? (zone / cost hint) */
function explainCard(m: ManagedGame, seat: Seat, card: string): string {
  if (!m.game.has(card)) {
    return "";
  }
  const s = m.game.state(card);
  const r = m.game.seat(seat).resources();
  return ` — ${s.name} is in ${s.zone} (owner ${s.owner}), costs ${s.energyCost}${s.powerCost.map((p) => `[${p}]`).join("")}; you have energy ${r.energy}, power ${JSON.stringify(r.power)}`;
}

/** "player-1-main-3-ogn-004-298" → "ogn-004-298". */
function extractDefId(s: string): string {
  const m = /([a-z]{3}-\d{3}-\d{3})$/i.exec(s);
  return m ? (m[1] as string).toLowerCase() : s;
}

interface DefDescription {
  defId: string;
  name: string;
  cardType: string;
  cost?: string;
  might?: number;
  domains: string[];
  keywords: string[];
  tags?: string[];
  timing?: string;
  rulesText?: string;
  abilities: string[];
  abilitiesRaw: unknown[];
}

function describeDef(def: CardDefLike): DefDescription {
  const domains =
    def.domain === undefined
      ? []
      : Array.isArray(def.domain)
        ? [...(def.domain as string[])]
        : [def.domain as string];
  const cost =
    def.energyCost !== undefined || def.powerCost?.length
      ? `${def.energyCost ?? 0}${(def.powerCost ?? []).map((p) => `[${p}]`).join("")}`
      : undefined;
  const abilities = (def.abilities ?? []).map((a, i) =>
    summarizeAbility(a as Record<string, unknown>, i),
  );
  return {
    abilities,
    abilitiesRaw: [...(def.abilities ?? [])],
    cardType: def.cardType,
    cost,
    defId: def.id ?? "?",
    domains,
    keywords: [...(def.keywords ?? [])],
    might: def.might,
    name: def.name ?? def.id ?? "?",
    rulesText: def.rulesText,
    tags: def.tags ? [...def.tags] : undefined,
    timing: def.timing,
  };
}

function summarizeAbility(a: Record<string, unknown>, i: number): string {
  const type = String(a.type ?? "ability");
  const bits = [`#${i} ${type}`];
  if (typeof a.keyword === "string") {
    bits.push(`${a.keyword}${a.value !== undefined ? ` ${String(a.value)}` : ""}`);
  }
  const trig = a.trigger as Record<string, unknown> | undefined;
  if (trig) {
    bits.push(`when ${String(trig.event ?? trig.on ?? JSON.stringify(trig)).slice(0, 60)}`);
  }
  const cost = a.cost as Record<string, unknown> | undefined;
  if (cost) {
    bits.push(`cost ${JSON.stringify(cost)}`);
  }
  const eff = a.effect as Record<string, unknown> | undefined;
  if (eff) {
    bits.push(
      `→ ${String(eff.type ?? "?")}${eff.keyword ? ` ${String(eff.keyword)}` : ""}${eff.amount !== undefined ? ` ${JSON.stringify(eff.amount)}` : eff.value !== undefined ? ` ${JSON.stringify(eff.value)}` : ""}${eff.duration ? ` (${String(eff.duration)})` : ""}`,
    );
  }
  if (typeof a.text === "string") {
    bits.push(`"${a.text.slice(0, 100)}"`);
  }
  if (a.optional === true) {
    bits.push("(optional)");
  }
  return bits.join(" ");
}

export { compactCard };
