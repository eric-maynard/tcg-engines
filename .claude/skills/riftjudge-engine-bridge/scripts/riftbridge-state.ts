/**
 * riftjudge-engine-bridge — riftbridge shared state + dispatcher.
 *
 * The agentic mode is now CLI-driven: each `bun riftbridge.ts <run-id> <cmd>`
 * invocation is a separate OS process. To maintain coherent engine state across
 * processes we use a REPLAY-LOG approach:
 *
 *   - `/tmp/riftbridge/<run-id>/state.json`  → ordered list of subcommands
 *     issued so far (`[{name, args}, ...]`) plus a `finished` flag.
 *   - `/tmp/riftbridge/<run-id>/log.txt`     → human-readable per-invocation log
 *     (subcommand + result).
 *   - `/tmp/riftbridge/<run-id>/finish.json` → final answer, written by `finish`.
 *   - `/tmp/riftbridge/<run-id>/prompt.txt`  → sub-agent prompt (written by
 *     orchestrator `prep`).
 *
 * On every invocation we:
 *   1. Load the command log from disk.
 *   2. Replay every recorded command against a fresh engine (this rebuilds the
 *      live `ToolContext` deterministically).
 *   3. Apply the NEW command, capture its result.
 *   4. If the new command mutates state (i.e. not a pure read), append it to
 *      the log and persist `state.json`.
 *   5. Either way, append to `log.txt` and print the result.
 *
 * Why replay instead of serializing the AuditEngine directly? The engine state
 * includes class instances, listener registries, flow managers, and other
 * non-JSON-friendly things. Replay is simpler, deterministic, and for the
 * agentic-loop sizes we target (≤ ~30 calls per run) it's well under 100ms
 * per invocation in bun.
 *
 * Read-only commands (`query-board`, `get-rules-text`, `get-abilities`,
 * `search-rules`) are NOT appended to the log — they only inform the agent,
 * never mutate state.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  applyMove,
  createBattlefield,
  createCard,
  createMinimalGameState,
  dispatchEventWithMaintenanceForTest,
  getCardMeta,
  getCardOwner,
  getCardZone,
  P1,
  P2,
  type AuditEngine,
} from "../../../../packages/riftbound-engine/src/__tests__/rules-audit/helpers";
import {
  computeEffectiveMight,
  getGlobalCardRegistry,
} from "../../../../packages/riftbound-engine/src/operations/card-lookup";
import { getCardRegistry } from "../../../../packages/riftbound-cards/src/data/all-cards";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Side = "P1" | "P2";

export interface LoggedCommand {
  name: string;
  args: Record<string, unknown>;
}

export interface RunState {
  commands: LoggedCommand[];
  finished: boolean;
}

export interface BridgeCtx {
  engine: AuditEngine;
  /** Tracked card instance ids. */
  instances: Set<string>;
  /** Created battlefield ids. */
  battlefields: Set<string>;
  /** Auto-incremented card id allocator: "c0001", "c0002", … */
  cardIdSeq: number;
}

export type CommandResult = Record<string, unknown> & { error?: string };

/** Commands that are pure reads — never appended to the replay log. */
export const READ_ONLY_COMMANDS: ReadonlySet<string> = new Set([
  "query-board",
  "get-rules-text",
  "get-abilities",
  "search-rules",
  "search-card-name",
]);

// ---------------------------------------------------------------------------
// Card-name index (case-insensitive, lazy)
// ---------------------------------------------------------------------------

let _nameIndex: Map<string, unknown> | null = null;
let _nameList: string[] | null = null;
function buildNameIndex(): void {
  if (_nameIndex && _nameList) return;
  _nameIndex = new Map();
  _nameList = [];
  for (const c of getCardRegistry().values()) {
    const n = ((c as { name?: string }).name ?? "").toLowerCase();
    if (n && !_nameIndex.has(n)) {
      _nameIndex.set(n, c);
      _nameList.push(n);
    }
  }
}
function cardByName(name: string): unknown | undefined {
  buildNameIndex();
  return _nameIndex!.get(name.toLowerCase());
}

/**
 * Fuzzy card-name lookup. Combines substring matching with a token-overlap
 * (Jaccard-ish) score. Returns at most `maxResults` matches, highest score first.
 *
 * Designed to handle colloquial card-name references like "rocket" → "Super
 * Mega Death Rocket" or "akali splash" → "Akali, Rogue Assassin".
 */
export interface CardNameMatch {
  name: string;
  score: number;
  cardType?: string;
  might?: number | null;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

export function fuzzyCardNameSearch(
  query: string,
  maxResults: number = 5,
): CardNameMatch[] {
  buildNameIndex();
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const qTokens = new Set(tokenize(q));
  const out: CardNameMatch[] = [];
  for (const lname of _nameList!) {
    let score = 0;
    // Exact match wins.
    if (lname === q) score = 1000;
    // Substring containment.
    if (score === 0 && lname.includes(q)) score = 500 + (q.length / Math.max(lname.length, 1)) * 100;
    // Word-overlap (Jaccard-style).
    if (score === 0) {
      const tTokens = new Set(tokenize(lname));
      let overlap = 0;
      for (const t of qTokens) if (tTokens.has(t)) overlap++;
      if (overlap > 0) {
        const union = new Set([...qTokens, ...tTokens]).size;
        score = (overlap / Math.max(union, 1)) * 300;
      }
    }
    // Partial token containment (one of q tokens is a prefix of a name token).
    if (score === 0) {
      const tTokens = tokenize(lname);
      for (const qt of qTokens) {
        if (qt.length < 3) continue;
        for (const tt of tTokens) {
          if (tt.startsWith(qt) || qt.startsWith(tt)) {
            score = Math.max(score, 80);
            break;
          }
        }
        if (score > 0) break;
      }
    }
    if (score > 0) {
      const def = _nameIndex!.get(lname) as
        | { name?: string; cardType?: string; might?: number }
        | undefined;
      out.push({
        name: def?.name ?? lname,
        score: Math.round(score * 100) / 100,
        cardType: def?.cardType,
        might: def?.might ?? null,
      });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, Math.max(1, maxResults));
}

// ---------------------------------------------------------------------------
// Internal-state helpers
// ---------------------------------------------------------------------------

interface InternalView {
  internalState: {
    zones: Record<string, { cardIds: string[] }>;
    cards: Record<string, { zone: string; owner: string; controller: string }>;
    cardMetas: Record<string, Record<string, unknown>>;
  };
}
function asInternalView(engine: AuditEngine): InternalView {
  return engine as unknown as InternalView;
}

function pidOf(side: unknown): string | undefined {
  if (side === "P1") return P1;
  if (side === "P2") return P2;
  return undefined;
}
function sideOf(pid: string | undefined): Side | "?" {
  if (pid === P1) return "P1";
  if (pid === P2) return "P2";
  return "?";
}

function isAliveZone(zone: string | undefined): boolean {
  return zone !== undefined && zone !== "trash" && zone !== "banishment";
}
function effectiveMightOf(engine: AuditEngine, cardId: string): number {
  const registry = getGlobalCardRegistry();
  return computeEffectiveMight(
    cardId,
    (cid) => getCardMeta(engine, cid as never) as never,
    registry,
  );
}

function grantKeywordInternal(
  engine: AuditEngine,
  cardId: string,
  keyword: string,
  value: number | undefined,
  duration: "turn" | "permanent" | "combat",
): void {
  const meta = asInternalView(engine).internalState.cardMetas[cardId];
  if (!meta) return;
  const existing =
    (meta.grantedKeywords as { keyword: string; duration?: string; value?: number }[] | undefined) ?? [];
  const entry: { keyword: string; duration: string; value?: number } = { keyword, duration };
  if (value !== undefined) entry.value = value;
  meta.grantedKeywords = [...existing, entry];
}

function bumpCardsPlayedThisTurn(engine: AuditEngine, pid: string): void {
  const st = (engine as unknown as {
    currentState: { cardsPlayedThisTurn?: Record<string, number> };
  }).currentState;
  if (st && st.cardsPlayedThisTurn) {
    st.cardsPlayedThisTurn[pid] = (st.cardsPlayedThisTurn[pid] ?? 0) + 1;
  }
}

function forceContested(engine: AuditEngine, bfId: string, attackerPid: string): void {
  const internal = engine as unknown as {
    currentState: { battlefields: Record<string, unknown> };
  };
  const cloned = structuredClone(internal.currentState);
  const bf =
    (cloned.battlefields as Record<
      string,
      { contested: boolean; contestedBy?: string; controller: string | null }
    >)[bfId];
  if (bf) {
    bf.contested = true;
    bf.contestedBy = attackerPid;
  }
  internal.currentState = cloned as never;
  (engine.getFlowManager?.() as { syncState?: (s: unknown) => void } | undefined)?.syncState?.(cloned);
}

// ---------------------------------------------------------------------------
// Rules corpus (lazy, cached process-wide)
// ---------------------------------------------------------------------------

const RULES_DIR = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "riftbound-rules",
  "version-2026-03-30",
);

let _rulesCorpus: { file: string; lines: string[] }[] | null = null;
function loadRulesCorpus(): { file: string; lines: string[] }[] {
  if (_rulesCorpus) return _rulesCorpus;
  const out: { file: string; lines: string[] }[] = [];
  try {
    const files = readdirSync(RULES_DIR).filter((f) => f.endsWith(".md"));
    for (const f of files) {
      try {
        const txt = readFileSync(join(RULES_DIR, f), "utf8");
        out.push({ file: f, lines: txt.split("\n") });
      } catch {
        // skip
      }
    }
  } catch {
    // rules dir missing
  }
  _rulesCorpus = out;
  return out;
}

// ---------------------------------------------------------------------------
// Board snapshot
// ---------------------------------------------------------------------------

function snapshotBoard(ctx: BridgeCtx): Record<string, unknown> {
  const engine = ctx.engine;
  const st = (engine as unknown as { currentState: Record<string, unknown> }).currentState;
  const internal = asInternalView(engine).internalState;
  const units: Record<string, unknown>[] = [];
  for (const [cardId, card] of Object.entries(internal.cards)) {
    if (cardId.startsWith("__filler_")) continue;
    const zone = card.zone;
    if (zone === "mainDeck") continue;
    if (zone === "battlefieldRow") continue;
    const meta = (internal.cardMetas[cardId] ?? {}) as Record<string, unknown>;
    units.push({
      id: cardId,
      side: sideOf(card.owner),
      zone,
      alive: isAliveZone(zone),
      effectiveMight: isAliveZone(zone) ? effectiveMightOf(engine, cardId) : 0,
      damage: meta.damage ?? 0,
      buffed: !!meta.buffed,
      exhausted: !!meta.exhausted,
      combatRole: meta.combatRole ?? null,
      grantedKeywords: meta.grantedKeywords ?? [],
    });
  }
  const battlefieldsRaw =
    (st.battlefields as Record<string, { id: string; controller: string | null; contested: boolean }> | undefined) ??
    {};
  const battlefields = Object.values(battlefieldsRaw).map((bf) => ({
    id: bf.id,
    controller: bf.controller == null ? null : sideOf(bf.controller),
    contested: !!bf.contested,
  }));
  const turn = st.turn as { activePlayer: string; phase: string };
  return {
    turnPlayer: sideOf(turn.activePlayer),
    phase: String(turn.phase),
    cardsPlayedThisTurn: (st as { cardsPlayedThisTurn?: Record<string, number> }).cardsPlayedThisTurn ?? {},
    units,
    battlefields,
    winner: st.winner ? sideOf(st.winner as string) : null,
    status: String(st.status),
  };
}

// ---------------------------------------------------------------------------
// Engine init
// ---------------------------------------------------------------------------

export function freshCtx(): BridgeCtx {
  const engine = createMinimalGameState({
    phase: "main",
    currentPlayer: P1,
    runePools: {
      [P1]: { energy: 10, power: { fire: 5, mind: 5, order: 5, body: 5, calm: 5, chaos: 5 } },
      [P2]: { energy: 10, power: { fire: 5, mind: 5, order: 5, body: 5, calm: 5, chaos: 5 } },
    } as never,
  });
  // Filler decks so drawCard never reshuffles the trash (rule 607.2.a).
  for (const side of ["P1", "P2"] as const) {
    const owner = pidOf(side)!;
    for (let i = 0; i < 6; i++) {
      createCard(engine, `__filler_${side}_${i}`, {
        cardType: "spell",
        owner,
        zone: "mainDeck" as never,
      });
    }
  }
  return { engine, instances: new Set(), battlefields: new Set(), cardIdSeq: 0 };
}

function nextCardId(ctx: BridgeCtx): string {
  ctx.cardIdSeq += 1;
  return `c${String(ctx.cardIdSeq).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// Arg validation helpers
// ---------------------------------------------------------------------------

function reqStr(args: Record<string, unknown>, key: string): string | { error: string } {
  const v = args[key];
  if (typeof v !== "string" || v.length === 0) return { error: `missing/invalid string "${key}"` };
  return v;
}
function reqNum(args: Record<string, unknown>, key: string): number | { error: string } {
  const v = args[key];
  if (typeof v !== "number" || !Number.isFinite(v)) return { error: `"${key}" must be a number` };
  return v;
}
function reqSide(args: Record<string, unknown>, key: string): Side | { error: string } {
  const v = args[key];
  if (v !== "P1" && v !== "P2") return { error: `"${key}" must be "P1" or "P2"` };
  return v;
}

// ---------------------------------------------------------------------------
// Command catalogue — the public surface of the CLI
// ---------------------------------------------------------------------------

export interface CommandSpec {
  name: string;
  /** One-line help text shown in `--list` and in the agent prompt. */
  description: string;
  /** Argument schema in `key: type` shorthand — for the help text. */
  argShape?: string;
  handler: (ctx: BridgeCtx, args: Record<string, unknown>) => CommandResult;
}

export const COMMANDS: CommandSpec[] = [
  // ---------- new / instantiation ----------
  {
    name: "new",
    description: "Initialize a fresh game state (called implicitly on the first command).",
    handler: () => ({ ok: true }),
  },
  {
    name: "instantiate-card",
    description:
      'Look up a Riftbound card by name (case-insensitive) and create a card instance unplaced (in "trash"). Returns {cardId}.',
    argShape: '{"name":"...","side":"P1"|"P2"}',
    handler: (ctx, args) => {
      const name = reqStr(args, "name");
      if (typeof name !== "string") return name;
      const side = reqSide(args, "side");
      if (typeof side !== "string") return side;
      const def = cardByName(name);
      if (!def) return { error: `card "${name}" not in cards registry` };
      const cardId = nextCardId(ctx);
      const cardType = ((def as { cardType?: string }).cardType ?? "unit") as string;
      const abilities = (def as { abilities?: unknown[] }).abilities ?? [];
      const keywords = ((def as { keywords?: string[] }).keywords ?? []) as string[];
      const might = (def as { might?: number }).might;
      const energyCost = (def as { energyCost?: number }).energyCost;
      const powerCost = (def as { powerCost?: string[] }).powerCost;
      const domain = (def as { domain?: string | string[] }).domain;
      createCard(ctx.engine, cardId, {
        abilities: abilities as never,
        cardType: cardType as never,
        domain,
        energyCost,
        keywords,
        might,
        name: (def as { name?: string }).name,
        owner: pidOf(side)!,
        powerCost,
        zone: "trash" as never,
      });
      ctx.instances.add(cardId);
      return {
        cardId,
        name: (def as { name?: string }).name ?? name,
        cardType,
        might: might ?? null,
        keywords,
        abilityCount: abilities.length,
      };
    },
  },

  // ---------- placement ----------
  {
    name: "place-on-battlefield",
    description: "Move a card-instance onto a created battlefield.",
    argShape: '{"cardId":"c0001","battlefieldId":"bf1"}',
    handler: (ctx, args) => {
      const cardId = reqStr(args, "cardId");
      if (typeof cardId !== "string") return cardId;
      const bf = reqStr(args, "battlefieldId");
      if (typeof bf !== "string") return bf;
      if (!ctx.instances.has(cardId)) return { error: `unknown cardId "${cardId}"` };
      if (!ctx.battlefields.has(bf)) return { error: `battlefield "${bf}" not created` };
      const targetZone = `battlefield-${bf}`;
      return movePlacement(ctx, cardId, targetZone);
    },
  },
  {
    name: "place-in-base",
    description: "Move a card-instance to its owner's base.",
    argShape: '{"cardId":"c0001"}',
    handler: (ctx, args) => {
      const cardId = reqStr(args, "cardId");
      if (typeof cardId !== "string") return cardId;
      if (!ctx.instances.has(cardId)) return { error: `unknown cardId "${cardId}"` };
      return movePlacement(ctx, cardId, "base");
    },
  },
  {
    name: "place-in-hand",
    description: "Move a card-instance to its owner's hand.",
    argShape: '{"cardId":"c0001"}',
    handler: (ctx, args) => {
      const cardId = reqStr(args, "cardId");
      if (typeof cardId !== "string") return cardId;
      if (!ctx.instances.has(cardId)) return { error: `unknown cardId "${cardId}"` };
      return movePlacement(ctx, cardId, "hand");
    },
  },
  {
    name: "place-in-trash",
    description: "Move a card-instance to the trash (kills without firing on-die).",
    argShape: '{"cardId":"c0001"}',
    handler: (ctx, args) => {
      const cardId = reqStr(args, "cardId");
      if (typeof cardId !== "string") return cardId;
      if (!ctx.instances.has(cardId)) return { error: `unknown cardId "${cardId}"` };
      return movePlacement(ctx, cardId, "trash");
    },
  },

  // ---------- battlefield creation ----------
  {
    name: "create-battlefield",
    description: 'Create a battlefield. Optional controller: "P1"|"P2"|"none".',
    argShape: '{"id":"bf1","controller":"P1"|"P2"|"none"}',
    handler: (ctx, args) => {
      const id = reqStr(args, "id");
      if (typeof id !== "string") return id;
      if (ctx.battlefields.has(id)) return { error: `battlefield "${id}" already exists` };
      const c = args.controller;
      const controller = c === "P1" ? P1 : c === "P2" ? P2 : null;
      try {
        createBattlefield(ctx.engine, id, { controller });
      } catch (e) {
        return { error: `createBattlefield failed: ${e instanceof Error ? e.message : String(e)}` };
      }
      ctx.battlefields.add(id);
      return { ok: true, id, controller: controller ? sideOf(controller) : null };
    },
  },

  // ---------- might / counters / exhaust ----------
  {
    name: "set-might",
    description: "Adjust a unit's Might via modifyBuff (delta can be negative).",
    argShape: '{"cardId":"c0001","delta":1}',
    handler: (ctx, args) => {
      const cardId = reqStr(args, "cardId");
      if (typeof cardId !== "string") return cardId;
      const delta = reqNum(args, "delta");
      if (typeof delta !== "number") return delta;
      const before = effectiveMightOf(ctx.engine, cardId);
      const r = applyMove(ctx.engine, "modifyBuff", { cardId, deltaMight: delta });
      if (!r.success) return { error: `modifyBuff failed: ${r.error}` };
      const after = effectiveMightOf(ctx.engine, cardId);
      return { ok: true, before, after, alive: isAliveZone(getCardZone(ctx.engine, cardId)) };
    },
  },
  {
    name: "add-counter",
    description: 'Add N counters: kind="buff" (+1 Might each) or "damage" (addDamage).',
    argShape: '{"cardId":"c0001","kind":"buff"|"damage","n":1}',
    handler: (ctx, args) => {
      const cardId = reqStr(args, "cardId");
      if (typeof cardId !== "string") return cardId;
      const kind = reqStr(args, "kind");
      if (typeof kind !== "string") return kind;
      const n = reqNum(args, "n");
      if (typeof n !== "number") return n;
      if (kind === "buff") {
        for (let i = 0; i < n; i++) applyMove(ctx.engine, "addBuff", { cardId });
        return { ok: true, kind, n };
      }
      if (kind === "damage") {
        const r = applyMove(ctx.engine, "addDamage", { cardId, amount: n });
        if (!r.success) return { error: `addDamage failed: ${r.error}` };
        return { ok: true, kind, n, alive: isAliveZone(getCardZone(ctx.engine, cardId)) };
      }
      return { error: `unknown counter kind "${kind}"` };
    },
  },
  {
    name: "exhaust",
    description: "Exhaust a unit.",
    argShape: '{"cardId":"c0001"}',
    handler: (ctx, args) => {
      const cardId = reqStr(args, "cardId");
      if (typeof cardId !== "string") return cardId;
      const r = applyMove(ctx.engine, "exhaustCard", { cardId });
      if (!r.success) return { error: `exhaustCard failed: ${r.error}` };
      return { ok: true };
    },
  },
  {
    name: "ready",
    description: "Ready a unit (clear exhausted meta flag).",
    argShape: '{"cardId":"c0001"}',
    handler: (ctx, args) => {
      const cardId = reqStr(args, "cardId");
      if (typeof cardId !== "string") return cardId;
      const meta = asInternalView(ctx.engine).internalState.cardMetas[cardId];
      if (!meta) return { error: `no meta for "${cardId}"` };
      meta.exhausted = false;
      return { ok: true };
    },
  },
  {
    name: "grant-keyword",
    description: 'Grant a keyword to a unit. Default duration "turn".',
    argShape: '{"cardId":"c0001","keyword":"Tank","value":2,"duration":"turn"|"permanent"|"combat"}',
    handler: (ctx, args) => {
      const cardId = reqStr(args, "cardId");
      if (typeof cardId !== "string") return cardId;
      const keyword = reqStr(args, "keyword");
      if (typeof keyword !== "string") return keyword;
      const value = typeof args.value === "number" ? args.value : undefined;
      const duration = (args.duration as "turn" | "permanent" | "combat" | undefined) ?? "turn";
      grantKeywordInternal(ctx.engine, cardId, keyword, value, duration);
      return { ok: true, keyword, value: value ?? null, duration };
    },
  },

  // ---------- turn / pool ----------
  {
    name: "set-power",
    description: "Set a player's energy pool.",
    argShape: '{"side":"P1","value":3}',
    handler: (ctx, args) => {
      const side = reqSide(args, "side");
      if (typeof side !== "string") return side;
      const value = reqNum(args, "value");
      if (typeof value !== "number") return value;
      const pid = pidOf(side)!;
      const st = (ctx.engine as unknown as {
        currentState: { runePools?: Record<string, { energy?: number }> };
      }).currentState;
      const pool = st.runePools?.[pid];
      if (!pool) return { error: `no rune pool for ${side}` };
      pool.energy = value;
      return { ok: true, side, energy: value };
    },
  },
  {
    name: "set-runes",
    description: 'Set color rune pool for a player; runes is e.g. {"fire":2,"mind":1}.',
    argShape: '{"side":"P1","runes":{"fire":2}}',
    handler: (ctx, args) => {
      const side = reqSide(args, "side");
      if (typeof side !== "string") return side;
      const runes = args.runes;
      if (!runes || typeof runes !== "object") return { error: "missing 'runes' object" };
      const pid = pidOf(side)!;
      const st = (ctx.engine as unknown as {
        currentState: { runePools?: Record<string, { power?: Record<string, number> }> };
      }).currentState;
      const pool = st.runePools?.[pid];
      if (!pool) return { error: `no rune pool for ${side}` };
      pool.power = { ...(pool.power ?? {}), ...(runes as Record<string, number>) };
      return { ok: true, side, power: pool.power };
    },
  },
  {
    name: "set-active-player",
    description: "Set whose turn it is.",
    argShape: '{"side":"P1"}',
    handler: (ctx, args) => {
      const side = reqSide(args, "side");
      if (typeof side !== "string") return side;
      const pid = pidOf(side)!;
      const st = (ctx.engine as unknown as {
        currentState: { turn: { activePlayer: string } };
      }).currentState;
      st.turn.activePlayer = pid;
      return { ok: true, activePlayer: side };
    },
  },
  {
    name: "begin-phase",
    description: 'Set the current phase string (e.g. "main", "showdown").',
    argShape: '{"name":"main"}',
    handler: (ctx, args) => {
      const name = reqStr(args, "name");
      if (typeof name !== "string") return name;
      const st = (ctx.engine as unknown as {
        currentState: { turn: { phase: string } };
      }).currentState;
      st.turn.phase = name;
      return { ok: true, phase: name };
    },
  },
  {
    name: "advance-turn",
    description: "Flip activePlayer and reset cardsPlayedThisTurn.",
    handler: (ctx) => {
      const st = (ctx.engine as unknown as {
        currentState: {
          turn: { activePlayer: string };
          cardsPlayedThisTurn?: Record<string, number>;
        };
      }).currentState;
      const old = st.turn.activePlayer;
      st.turn.activePlayer = old === P1 ? P2 : P1;
      if (st.cardsPlayedThisTurn) st.cardsPlayedThisTurn = { [P1]: 0, [P2]: 0 };
      return { ok: true, activePlayer: sideOf(st.turn.activePlayer) };
    },
  },

  // ---------- play ----------
  {
    name: "play-card",
    description:
      'Instantiate AND play a card (dispatches play-self/play-card/play-spell). to: "base"|"trash"|"hand"|"battlefield-<id>".',
    argShape: '{"name":"...","side":"P1","to":"base"}',
    handler: (ctx, args) => {
      const name = reqStr(args, "name");
      if (typeof name !== "string") return name;
      const side = reqSide(args, "side");
      if (typeof side !== "string") return side;
      const def = cardByName(name);
      if (!def) return { error: `card "${name}" not in cards registry` };
      const cardType = ((def as { cardType?: string }).cardType ?? "unit") as string;
      const ownerPid = pidOf(side)!;
      const to = args.to;
      let destZone: string;
      if (typeof to === "string" && to.length) {
        if (to === "base" || to === "trash" || to === "hand") destZone = to;
        else if (to.startsWith("battlefield-")) {
          const bf = to.slice("battlefield-".length);
          if (!ctx.battlefields.has(bf)) return { error: `battlefield "${bf}" not created` };
          destZone = to;
        } else {
          if (!ctx.battlefields.has(to)) return { error: `battlefield "${to}" not created` };
          destZone = `battlefield-${to}`;
        }
      } else {
        destZone = cardType === "spell" ? "trash" : "base";
      }
      const cardId = nextCardId(ctx);
      const abilities = (def as { abilities?: unknown[] }).abilities ?? [];
      const keywords = ((def as { keywords?: string[] }).keywords ?? []) as string[];
      const might = (def as { might?: number }).might;
      const energyCost = (def as { energyCost?: number }).energyCost;
      const powerCost = (def as { powerCost?: string[] }).powerCost;
      const domain = (def as { domain?: string | string[] }).domain;
      createCard(ctx.engine, cardId, {
        abilities: abilities as never,
        cardType: cardType as never,
        domain,
        energyCost,
        keywords,
        might,
        name: (def as { name?: string }).name,
        owner: ownerPid,
        powerCost,
        zone: destZone as never,
      });
      ctx.instances.add(cardId);
      bumpCardsPlayedThisTurn(ctx.engine, ownerPid);
      const playSelfFired = dispatchEventWithMaintenanceForTest(ctx.engine, {
        cardId,
        playerId: ownerPid,
        type: "play-self",
      });
      const playCardFired = dispatchEventWithMaintenanceForTest(ctx.engine, {
        cardId,
        cardType,
        playerId: ownerPid,
        type: "play-card",
      });
      let playSpellFired = 0;
      if (cardType === "spell") {
        playSpellFired = dispatchEventWithMaintenanceForTest(ctx.engine, {
          cardId,
          playerId: ownerPid,
          type: "play-spell",
        });
      }
      return {
        ok: true,
        cardId,
        name: (def as { name?: string }).name ?? name,
        cardType,
        zone: destZone,
        abilityCount: abilities.length,
        listenersFired: playSelfFired + playCardFired + playSpellFired,
      };
    },
  },

  // ---------- abilities / combat ----------
  {
    name: "activate-ability",
    description: "Activate an ability on a unit by index.",
    argShape: '{"cardId":"c0001","abilityIdx":0}',
    handler: (ctx, args) => {
      const cardId = reqStr(args, "cardId");
      if (typeof cardId !== "string") return cardId;
      const abilityIdx = reqNum(args, "abilityIdx");
      if (typeof abilityIdx !== "number") return abilityIdx;
      const owner = getCardOwner(ctx.engine, cardId);
      const r = applyMove(ctx.engine, "activateAbility", {
        cardId,
        abilityIndex: abilityIdx,
        playerId: owner,
      });
      if (!r.success) return { error: `activateAbility failed: ${r.error}` };
      return { ok: true };
    },
  },
  {
    name: "attack",
    description: "Declare an attack on a battlefield (forces contested).",
    argShape: '{"battlefieldId":"bf1","attackerSide":"P1"}',
    handler: (ctx, args) => {
      const bf = reqStr(args, "battlefieldId");
      if (typeof bf !== "string") return bf;
      const side = reqSide(args, "attackerSide");
      if (typeof side !== "string") return side;
      if (!ctx.battlefields.has(bf)) return { error: `battlefield "${bf}" not created` };
      forceContested(ctx.engine, bf, pidOf(side)!);
      return { ok: true, battlefieldId: bf, attacker: side };
    },
  },
  {
    name: "declare-defender",
    description: 'Set combatRole="defender" on a unit.',
    argShape: '{"cardId":"c0001"}',
    handler: (ctx, args) => {
      const cardId = reqStr(args, "cardId");
      if (typeof cardId !== "string") return cardId;
      const meta = asInternalView(ctx.engine).internalState.cardMetas[cardId];
      if (!meta) return { error: `no meta for "${cardId}"` };
      meta.combatRole = "defender";
      return { ok: true, cardId };
    },
  },
  {
    name: "resolve-combat",
    description: "Run resolveFullCombat at a contested battlefield.",
    argShape: '{"battlefieldId":"bf1"}',
    handler: (ctx, args) => {
      const bf = reqStr(args, "battlefieldId");
      if (typeof bf !== "string") return bf;
      if (!ctx.battlefields.has(bf)) return { error: `battlefield "${bf}" not created` };
      const r = applyMove(ctx.engine, "resolveFullCombat", { battlefieldId: bf });
      if (!r.success) return { error: `resolveFullCombat failed: ${r.error}` };
      const st = (ctx.engine as unknown as { currentState: Record<string, unknown> }).currentState;
      const bfState =
        (st.battlefields as Record<string, { controller: string | null; contested: boolean }>)[bf];
      return {
        ok: true,
        battlefieldId: bf,
        controller: bfState?.controller ? sideOf(bfState.controller) : null,
        contested: !!bfState?.contested,
        winner: st.winner ? sideOf(st.winner as string) : null,
      };
    },
  },
  {
    name: "pass-focus",
    description: "Pass chain priority.",
    argShape: '{"side":"P1"}',
    handler: (ctx, args) => {
      const side = reqSide(args, "side");
      if (typeof side !== "string") return side;
      const r = applyMove(ctx.engine, "passChainPriority", { playerId: pidOf(side)! });
      if (!r.success) return { error: `passChainPriority failed: ${r.error}` };
      return { ok: true };
    },
  },

  // ---------- reads ----------
  {
    name: "query-board",
    description: "Return a JSON snapshot of board state.",
    handler: (ctx) => snapshotBoard(ctx),
  },
  {
    name: "get-rules-text",
    description: "Look up a card's printed rules text by name.",
    argShape: '{"cardName":"..."}',
    handler: (_ctx, args) => {
      const cardName = reqStr(args, "cardName");
      if (typeof cardName !== "string") return cardName;
      const def = cardByName(cardName);
      if (!def) return { error: `card "${cardName}" not in registry` };
      const d = def as {
        name?: string;
        rulesText?: string;
        abilities?: unknown[];
        keywords?: string[];
        might?: number;
        cardType?: string;
        energyCost?: number;
        powerCost?: string[];
        domain?: string | string[];
      };
      return {
        name: d.name ?? cardName,
        cardType: d.cardType ?? null,
        might: d.might ?? null,
        keywords: d.keywords ?? [],
        rulesText: d.rulesText ?? "",
        abilityCount: (d.abilities ?? []).length,
        energyCost: d.energyCost ?? null,
        powerCost: d.powerCost ?? null,
        domain: d.domain ?? null,
      };
    },
  },
  {
    name: "get-abilities",
    description: "Return the parsed abilities on a card instance.",
    argShape: '{"cardId":"c0001"}',
    handler: (_ctx, args) => {
      const cardId = reqStr(args, "cardId");
      if (typeof cardId !== "string") return cardId;
      const registry = getGlobalCardRegistry();
      const def = registry.get(cardId);
      if (!def) return { error: `no registered definition for "${cardId}"` };
      return {
        abilities: def.abilities ?? [],
        keywords: (def as { keywords?: string[] }).keywords ?? [],
      };
    },
  },
  {
    name: "search-card-name",
    description:
      "Fuzzy card-name lookup. Use FIRST when the question mentions a card by colloquial name (e.g. 'rocket' → 'Super Mega Death Rocket'). Returns up to maxResults matches with score, name, cardType, might. Then pass the resolved canonical name to instantiate-card/play-card/get-rules-text.",
    argShape: '{"query":"...","maxResults":5}',
    handler: (_ctx, args) => {
      const query = reqStr(args, "query");
      if (typeof query !== "string") return query;
      const maxResults =
        typeof args.maxResults === "number" && args.maxResults > 0
          ? Math.floor(args.maxResults)
          : 5;
      const matches = fuzzyCardNameSearch(query, maxResults);
      return { query, matches, totalReturned: matches.length };
    },
  },
  {
    name: "search-rules",
    description: "Grep the comprehensive rules (riftbound-rules/version-2026-03-30/*.md).",
    argShape: '{"query":"...","maxResults":3}',
    handler: (_ctx, args) => {
      const query = reqStr(args, "query");
      if (typeof query !== "string") return query;
      const maxResults =
        typeof args.maxResults === "number" && args.maxResults > 0
          ? Math.floor(args.maxResults)
          : 5;
      const corpus = loadRulesCorpus();
      const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const hits: { file: string; line: number; text: string }[] = [];
      for (const { file, lines } of corpus) {
        for (let i = 0; i < lines.length; i++) {
          if (re.test(lines[i] ?? "")) {
            hits.push({ file, line: i + 1, text: lines[i] ?? "" });
            if (hits.length >= maxResults) break;
          }
        }
        if (hits.length >= maxResults) break;
      }
      return { query, matches: hits, totalReturned: hits.length };
    },
  },

  // ---------- control ----------
  {
    name: "finish",
    description: "Submit the final answer. Always end your run with this.",
    argShape: '{"answer":"...","confidence":0.7}',
    handler: () => ({ ok: true, accepted: true }),
  },
];

const COMMAND_BY_NAME: Map<string, CommandSpec> = new Map(
  COMMANDS.map((c) => [c.name, c]),
);

// ---------------------------------------------------------------------------
// Internal placement helper
// ---------------------------------------------------------------------------

function movePlacement(ctx: BridgeCtx, cardId: string, toZone: string): CommandResult {
  const internal = asInternalView(ctx.engine).internalState;
  const card = internal.cards[cardId];
  if (!card) return { error: `card "${cardId}" missing from engine state` };
  const from = card.zone;
  const fromZone = internal.zones[from];
  if (fromZone) fromZone.cardIds = fromZone.cardIds.filter((id) => id !== cardId);
  const toZoneEntry = internal.zones[toZone];
  if (!toZoneEntry) return { error: `target zone "${toZone}" does not exist` };
  toZoneEntry.cardIds.push(cardId);
  card.zone = toZone;
  return { ok: true, cardId, zone: toZone };
}

// ---------------------------------------------------------------------------
// Replay + dispatch
// ---------------------------------------------------------------------------

/** Run one command against `ctx`. Returns the JSON result. Never throws. */
export function runCommand(
  ctx: BridgeCtx,
  name: string,
  args: Record<string, unknown>,
): CommandResult {
  const spec = COMMAND_BY_NAME.get(name);
  if (!spec) return { error: `unknown command "${name}"` };
  try {
    return spec.handler(ctx, args);
  } catch (e) {
    return { error: `command "${name}" threw: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Rebuild a `BridgeCtx` by replaying the recorded log silently. */
export function replayCommands(state: RunState): BridgeCtx {
  const ctx = freshCtx();
  for (const cmd of state.commands) {
    if (cmd.name === "new") continue;
    runCommand(ctx, cmd.name, cmd.args);
  }
  return ctx;
}

/** Public: list of (name, description, argShape) for help / prompt generation. */
export function commandHelp(): { name: string; description: string; argShape: string }[] {
  return COMMANDS.map((c) => ({
    name: c.name,
    description: c.description,
    argShape: c.argShape ?? "{}",
  }));
}
