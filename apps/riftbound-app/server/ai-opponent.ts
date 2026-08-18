/**
 * "vs Claude" — an AI seat driven by the Anthropic Messages API.
 *
 * The AI consumes exactly what an agent on the harness would: the per-seat
 * (redacted) Observation rendered by the MCP text builder, plus the harness
 * Decision / grouped legal actions for its seat. Whatever it picks is applied
 * through `applySessionMove` — the same path a human's WebSocket move takes —
 * and pushed to the human's socket one action at a time.
 *
 *   act():  while the AI seat holds the cursor (turn player in Neutral Open,
 *           priority, focus, or chooser of the pending prompt):
 *             prompt → model (tool-use) → validate against the CURRENT menu
 *             → applySessionMove → push state → pace → loop
 *           invalid output ×3 / API failure → one Goldfish-policy action.
 *
 * Key handling: a request-supplied key lives only in a #private field of the
 * ClaudeOpponent instance (never logged, persisted, or serialised — toJSON()
 * names kind/model only); otherwise ANTHROPIC_API_KEY from the environment.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { PlayerId } from "@tcg/core";
import {
  type ActionOption,
  type Answer,
  type CardState,
  type Decision,
  type FlatMove,
  buildCardState,
  coerceAnswer,
  deriveActionDecision,
  deriveFromPendingChoice,
  engineDecisionContext,
  firstOptionPolicy,
  getActingSeat,
  getPendingChoiceChooser,
  observe,
  resolvePendingAnswer,
} from "@tcg/riftbound/harness";
import { bindInfoTools } from "@tcg/riftbound-mcp/info-tools";
import { renderSeatView } from "@tcg/riftbound-mcp/render";
import { makeLogEntry } from "../src/narrator";
import { registry } from "./cards";
import { APP_DIR } from "./config";
import { gameLogger } from "./log";
import { noteGameState } from "./match";
import { anchorKeyAfterLastMove, buildAvailableMoves, buildGameSnapshot, handPlayCost } from "./snapshot";
import { type DeckConfig, type GameSession, type OpponentHandle, type OpponentInfo, broadcast, getInternalSnapshot } from "./state";
import { rewindEpoch } from "./rewind";
import { applySessionMove, sandboxAutoPlay } from "./turn";

// ---------------------------------------------------------------------------
// Models, keys, redaction
// ---------------------------------------------------------------------------

export interface ModelEntry {
  readonly id: string;
  readonly label: string;
  readonly short: string;
}

/**
 * The models this repo knows by name. Public Claude models only.
 *
 * **Do not add internal or unreleased model names here.** This repository is
 * outside the Anthropic monorepo, so a codename committed to it has left the
 * boundary that is supposed to contain it. Anything beyond these three is
 * supplied at run time by the host through `RB_AI_EXTRA_MODELS`, which keeps
 * the name in the host's configuration where it belongs.
 */
const BUILTIN_MODELS: Readonly<Record<string, ModelEntry>> = {
  haiku: { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", short: "Haiku" },
  opus: { id: "claude-opus-5", label: "Claude Opus 5", short: "Opus" },
  sonnet: { id: "claude-sonnet-5", label: "Claude Sonnet 5", short: "Sonnet" },
};

const BUILTIN_ORDER = ["haiku", "sonnet", "opus"];

/**
 * Extra models the host offers, as JSON:
 *
 *   RB_AI_EXTRA_MODELS='[{"key":"x","id":"…","label":"X","short":"X"}]'
 *
 * A seam rather than a constant, per the hosting contract: the host adds
 * models without patching this file, and this file names none of them. A
 * malformed entry is dropped with a warning instead of taking the server down
 * — a bad env var should cost you one menu row, not the app.
 */
function parseExtraModels(raw: string | undefined): Record<string, ModelEntry> {
  if (raw === undefined || raw.trim() === "") {
    return {};
  }
  const out: Record<string, ModelEntry> = {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new TypeError("RB_AI_EXTRA_MODELS must be a JSON array");
    }
    for (const item of parsed) {
      const e = item as Partial<ModelEntry> & { key?: unknown };
      const key = typeof e.key === "string" ? e.key : undefined;
      if (key === undefined || typeof e.id !== "string" || typeof e.label !== "string") {
        console.warn("[ai] RB_AI_EXTRA_MODELS: skipping entry missing key/id/label");
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(BUILTIN_MODELS, key)) {
        // Shadowing a built-in would silently repoint "opus" at something else.
        console.warn(`[ai] RB_AI_EXTRA_MODELS: refusing to override built-in ${key}`);
        continue;
      }
      out[key] = { id: e.id, label: e.label, short: typeof e.short === "string" ? e.short : e.label };
    }
  } catch (err) {
    console.warn(`[ai] RB_AI_EXTRA_MODELS ignored: ${(err as Error).message}`);
    return {};
  }
  return out;
}

export const AI_MODELS: Readonly<Record<string, ModelEntry>> = {
  ...BUILTIN_MODELS,
  ...parseExtraModels(process.env.RB_AI_EXTRA_MODELS),
};

/** A key into `AI_MODELS`. Open, because the host may add entries. */
export type ModelKey = string;

export function resolveModel(key: unknown): ({ key: ModelKey } & ModelEntry) | undefined {
  if (typeof key !== "string" || !Object.prototype.hasOwnProperty.call(AI_MODELS, key)) {
    return undefined;
  }
  return { key, ...(AI_MODELS[key] as ModelEntry) };
}

export function listModels(): { key: ModelKey; label: string }[] {
  // Built-ins keep their curated order; host-supplied models follow, so a
  // configuration change never reshuffles the menu a player is used to.
  const rank = (k: string) => {
    const i = BUILTIN_ORDER.indexOf(k);
    return i === -1 ? BUILTIN_ORDER.length : i;
  };
  return Object.keys(AI_MODELS)
    .map((key) => ({ key, label: (AI_MODELS[key] as ModelEntry).label }))
    .sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key));
}

/**
 * Bun loads `.env` from the process cwd; the app is also started from other
 * directories, so read ANTHROPIC_API_KEY (only that variable) from
 * apps/riftbound-app/.env and the repo-root .env when the environment lacks it.
 */
function loadEnvKeyFromFiles(): void {
  if (process.env.ANTHROPIC_API_KEY) {
    return;
  }
  for (const file of [path.join(APP_DIR, ".env"), path.join(APP_DIR, "../../.env")]) {
    try {
      const text = fs.readFileSync(file, "utf8");
      const m = text.match(/^\s*ANTHROPIC_API_KEY\s*=\s*(.*)\s*$/m);
      const value = m?.[1]?.trim().replace(/^['"]|['"]$/g, "");
      if (value) {
        process.env.ANTHROPIC_API_KEY = value;
        return;
      }
    } catch { /* no such file */ }
  }
}
loadEnvKeyFromFiles();

export function envApiKey(): string | undefined {
  const k = process.env.ANTHROPIC_API_KEY?.trim();
  return k ? k : undefined;
}

/** RB_AI_MOCK=1 — a first-legal-action provider through the same code path (no network, no key). */
export function aiMockEnabled(): boolean {
  return process.env.RB_AI_MOCK === "1" || process.env.RB_AI_MOCK === "true";
}

/** Strip key material from any text that might reach a log line or an error. */
export function redactKey(text: string, key?: string): string {
  let out = text;
  if (key && key.length >= 8) {
    out = out.split(key).join("[redacted]");
  }
  return out.replace(/sk-ant-[A-Za-z0-9_-]{6,}/g, "[redacted]");
}

// ---------------------------------------------------------------------------
// Opponent spec (request body → validated)
// ---------------------------------------------------------------------------

/**
 * Goldfish modes: "passive" (default) — the auto-pass policy in turn.ts drives
 * player-2; "active" — NO driver: the human plays both seats (hot seat).
 */
export type GoldfishMode = "passive" | "active";

export type OpponentSpec =
  | { kind: "goldfish"; mode: GoldfishMode }
  | { kind: "claude"; model: ModelKey; apiKey?: string };

export type ParsedOpponent =
  | { ok: true; spec: OpponentSpec }
  | { ok: false; status: number; error: string };

/** Validate the `opponent` field of a create request. Absent → Goldfish. */
export function parseOpponentSpec(raw: unknown): ParsedOpponent {
  if (raw === undefined || raw === null) {
    return { ok: true, spec: { kind: "goldfish", mode: "passive" } };
  }
  if (typeof raw !== "object") {
    return { error: "opponent must be an object", ok: false, status: 400 };
  }
  const o = raw as { kind?: unknown; model?: unknown; apiKey?: unknown; mode?: unknown };
  if (o.kind === undefined || o.kind === "goldfish") {
    if (o.mode !== undefined && o.mode !== "passive" && o.mode !== "active") {
      return { error: "opponent.mode must be 'passive' or 'active'", ok: false, status: 400 };
    }
    return { ok: true, spec: { kind: "goldfish", mode: o.mode === "active" ? "active" : "passive" } };
  }
  if (o.kind !== "claude") {
    return { error: "opponent.kind must be 'goldfish' or 'claude'", ok: false, status: 400 };
  }
  const model = resolveModel(o.model);
  if (!model) {
    return { error: `opponent.model must be one of: ${listModels().map((m) => m.key).join(", ")}`, ok: false, status: 400 };
  }
  const apiKey = typeof o.apiKey === "string" && o.apiKey.trim() ? o.apiKey.trim() : undefined;
  if (!apiKey && !envApiKey() && !aiMockEnabled()) {
    return { error: "No Anthropic API key configured — add one in Settings or set ANTHROPIC_API_KEY in .env", ok: false, status: 400 };
  }
  return { ok: true, spec: { apiKey, kind: "claude", model: model.key } };
}

/** Build the driver for a spec (undefined for the Goldfish, which needs none). */
export function createOpponent(spec: OpponentSpec, opts: ClaudeOpponentOptions = {}): OpponentHandle | undefined {
  if (spec.kind !== "claude") {
    return undefined;
  }
  return new ClaudeOpponent(spec.model, spec.apiKey, opts);
}

// ---------------------------------------------------------------------------
// Naming helpers (short, id-free labels — the model answers by index)
// ---------------------------------------------------------------------------

function defName(defId: string): string | undefined {
  return registry.get(defId)?.name;
}

function cardName(session: GameSession, id: unknown): string {
  if (typeof id !== "string") {
    return String(id ?? "?");
  }
  const inst = getInternalSnapshot(session.engine).cards[id];
  const fromDef = inst ? defName(inst.definitionId) : undefined;
  if (fromDef) {
    return fromDef;
  }
  try {
    return buildCardState(session.engine, id).name;
  } catch {
    return id.replace(/^player-[12]-(?:main|rune)-\d+-/, "");
  }
}

function bfName(id: unknown): string {
  if (typeof id !== "string") {
    return String(id ?? "?");
  }
  const bare = id.replace(/^battlefield-/, "");
  if (bare === "base") {
    return "Base";
  }
  const defId = bare.replace(/^player-[12]-bf-/, "");
  return defName(defId) ?? defId;
}

/** "Poro#7" — a stable per-instance tag so two same-name cards stay distinct in text and menu. */
function tag(session: GameSession, id: string): string {
  const name = cardName(session, id);
  const m = id.match(/^player-(\d)-(main|rune)-(\d+)-/);
  if (m) {
    return `${name} [#${m[3]}]`;
  }
  const t = id.startsWith("token-") ? id.match(/(\d+)$/) : null;
  return t ? `${name} [#t${t[1]}]` : name;
}

/** Replace raw instance ids in rendered text with the short tags used by the menu. */
function shortenRefs(session: GameSession, text: string): string {
  void session;
  return text
    .replace(/\[player-[12]-(?:main|rune)-(\d+)-[a-z0-9-]+\]/g, (_m, n: string) => `[#${n}]`)
    .replace(/\[(player-[12]-bf-[a-z0-9-]+)\]/g, "")
    .replace(/battlefield-(player-[12]-bf-[a-z0-9-]+)/g, (_m, id: string) => bfName(id))
    .replace(/(player-[12]-bf-[a-z0-9-]+)/g, (_m, id: string) => bfName(id))
    .replace(/\[(token-[a-z0-9-]+?)-?(\d+)?\]/g, (_m, _id: string, n?: string) => (n ? `[#t${n}]` : ""))
    .replace(/\[\]/g, "")
    .replace(/ {2,}/g, " ");
}

function costText(cost: { energy: number; power: string[] } | undefined): string {
  if (!cost) {
    return "";
  }
  const parts: string[] = [];
  parts.push(`${cost.energy} energy`);
  for (const p of cost.power) {
    parts.push(`[${p}]`);
  }
  return parts.join(" + ");
}

// ---------------------------------------------------------------------------
// Menu (numbered legal actions for the AI seat)
// ---------------------------------------------------------------------------

export interface MenuItem {
  index: number;
  label: string;
  /** Moves applied in order when this item is chosen. */
  moves: FlatMove[];
  /** For "Pay & play": the play to make after the rune taps (re-matched against the fresh legal list). */
  play?: FlatMove;
  kind: "move" | "payplay";
  /** Canonical signature for "is this still legal" checks. */
  sig: string;
}

function canon(v: unknown): string {
  return JSON.stringify(sortKeys(v));
}
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) {
        out[k] = sortKeys(v);
      }
    }
    return out;
  }
  return value;
}
function sigOf(m: FlatMove): string {
  return `${m.moveId}:${canon(m.params)}`;
}

const PLAY_MOVES = new Set(["playUnit", "playSpell", "playGear", "playFromChampionZone"]);

const MAX_VARIANTS_PER_OPTION = 6;
const MAX_MENU = 60;

/** UI-style label for one flat engine move. */
export function labelMove(session: GameSession, m: FlatMove): string {
  const p = m.params;
  const targets = (): string => {
    const t = p.targets;
    if (Array.isArray(t) && t.length) {
      return ` → ${t.map((id) => tag(session, String(id))).join(" + ")}`;
    }
    if (typeof t === "string") {
      return ` → ${tag(session, t)}`;
    }
    return "";
  };
  const extraCost = p.paidAdditionalCost === true ? " (pay optional additional cost)" : "";
  const flow = p.viaFlow === true ? " (via Flow)" : "";
  switch (m.moveId) {
    case "playUnit": {
      const cost = costText(handPlayCost(session, String(p.cardId)));
      return `Play ${tag(session, String(p.cardId))} to ${bfName(p.location ?? "base")}${extraCost}${flow}${cost ? ` — ${cost}` : ""}`;
    }
    case "playSpell": {
      const cost = costText(handPlayCost(session, String(p.cardId)));
      return `Cast ${tag(session, String(p.cardId))}${targets()}${extraCost}${cost ? ` — ${cost}` : ""}`;
    }
    case "playGear": {
      const cost = costText(handPlayCost(session, String(p.cardId)));
      const onto = typeof p.targetUnitId === "string" ? ` onto ${tag(session, p.targetUnitId)}` : targets();
      return `Play gear ${tag(session, String(p.cardId))}${onto}${extraCost}${cost ? ` — ${cost}` : ""}`;
    }
    case "playFromChampionZone": {
      return `Play your champion ${tag(session, String(p.cardId))} to ${bfName(p.location ?? "base")}${extraCost}`;
    }
    case "standardMove": {
      const units = Array.isArray(p.unitIds) ? p.unitIds.map((u) => tag(session, String(u))).join(" + ") : "units";
      return `Move ${units} → ${bfName(p.destination)}`;
    }
    case "gankingMove": {
      return `Gank: move ${tag(session, String(p.unitId))} → ${bfName(p.toBattlefield)}`;
    }
    case "exhaustRune": {
      return `Exhaust ${cardName(session, p.runeId)} (+1 energy)`;
    }
    case "recycleRune": {
      let exhausted = false;
      try {
        exhausted = buildCardState(session.engine, String(p.runeId)).isExhausted;
      } catch { /* */ }
      return `Recycle ${exhausted ? "an exhausted" : "a READY"} ${cardName(session, p.runeId)} (+1 ${String(p.domain ?? "")} power${exhausted ? "" : "; loses its energy — exhaust it first"})`;
    }
    case "passChainPriority": {
      return "Pass priority";
    }
    case "passShowdownFocus": {
      return "Pass focus";
    }
    case "endTurn": {
      return "End turn";
    }
    case "activateAbility": {
      return `Activate ${tag(session, String(p.cardId))} ability #${String(p.abilityIndex ?? 0)}${targets()}${p.xAmount !== undefined ? ` (X=${String(p.xAmount)})` : ""}`;
    }
    case "conquerBattlefield": {
      return `Conquer ${bfName(p.battlefieldId)}`;
    }
    case "contestBattlefield": {
      return `Contest ${bfName(p.battlefieldId)}`;
    }
    case "startShowdown": {
      return `Begin the showdown at ${bfName(p.battlefieldId)}`;
    }
    case "hideCard": {
      return `Hide ${tag(session, String(p.cardId))} facedown at ${bfName(p.battlefieldId)}`;
    }
    case "revealHidden": {
      return `Reveal your hidden ${tag(session, String(p.cardId))}`;
    }
    case "recallUnit": {
      return `Recall ${tag(session, String(p.unitId))} to Base`;
    }
    case "equipCard": {
      return `Equip ${tag(session, String(p.equipmentId))} to ${tag(session, String(p.unitId))} (pay its Equip cost)`;
    }
    case "unequipCard": {
      return `Unequip ${tag(session, String(p.equipmentId))}`;
    }
    default: {
      const { playerId: _pid, ...rest } = p as Record<string, unknown>;
      let ps = Object.keys(rest).length ? shortenRefs(session, canon(rest)) : "";
      if (ps.length > 100) {
        ps = `${ps.slice(0, 97)}…`;
      }
      return `${m.moveId}${ps ? ` ${ps}` : ""}`;
    }
  }
}

/** Order + trim an option's variants: plain-cost variants first, capped. */
function pickVariants(option: ActionOption): FlatMove[] {
  const seen = new Set<string>();
  const list = option.variants.filter((v) => {
    const s = sigOf(v);
    if (seen.has(s)) {
      return false;
    }
    seen.add(s);
    // rule 355.3 — pre-named modes are answered through the engine's prompt instead.
    return !(v.moveId === "playSpell" && v.params.mode !== undefined);
  });
  const weight = (v: FlatMove): number =>
    (v.params.paidAdditionalCost === true ? 4 : 0) +
    (v.params.viaFlow === true ? 2 : 0) +
    (v.params.altCost === true ? 2 : 0) +
    (v.moveId === "playUnit" && (v.params.location ?? "base") !== "base" ? 1 : 0);
  list.sort((a, b) => weight(a) - weight(b));
  return list.slice(0, MAX_VARIANTS_PER_OPTION);
}

const MENU_ORDER: Record<string, number> = {
  activateAbility: 3,
  equipCard: 3,
  conquerBattlefield: 5,
  contestBattlefield: 5,
  endTurn: 9,
  exhaustRune: 6,
  gankingMove: 2,
  hideCard: 4,
  passChainPriority: 8,
  passShowdownFocus: 8,
  playFromChampionZone: 1,
  playGear: 1,
  playSpell: 1,
  playUnit: 0,
  recallUnit: 4,
  recycleRune: 7,
  revealHidden: 4,
  standardMove: 2,
  startShowdown: 5,
};

interface RuneInfo {
  id: string;
  domain: string;
  ready: boolean;
  exhaust?: FlatMove;
  recycle?: FlatMove;
}

function seatRunes(session: GameSession, seat: string, legal: readonly FlatMove[]): RuneInfo[] {
  const internal = getInternalSnapshot(session.engine);
  const ids = (internal.zones.runePool?.cardIds ?? []).filter((id) => internal.cards[id]?.owner === seat);
  return ids.map((id) => {
    let st: CardState | undefined;
    try {
      st = buildCardState(session.engine, id);
    } catch { /* */ }
    const recycle = legal.find((m) => m.moveId === "recycleRune" && m.params.runeId === id);
    return {
      domain: (recycle?.params.domain as string | undefined) ?? st?.domains[0] ?? "unknown",
      exhaust: legal.find((m) => m.moveId === "exhaustRune" && m.params.runeId === id),
      id,
      ready: st ? st.isReady : false,
      recycle,
    };
  });
}

/**
 * Rune taps that make `cost` affordable from `pool`, or null. Power pips are
 * produced by recycling a rune of that domain (any domain for "rainbow"),
 * exhausting a READY rune first so its energy is not thrown away; remaining
 * energy comes from exhausting further ready runes.
 */
export function planPayment(
  cost: { energy: number; power: readonly string[] },
  pool: { energy: number; power: Readonly<Record<string, number>> },
  runes: readonly RuneInfo[],
): FlatMove[] | null {
  const steps: FlatMove[] = [];
  const used = new Set<string>();
  let energyGain = 0;
  const needEnergy = Math.max(0, cost.energy - pool.energy);
  const spare: Record<string, number> = { ...pool.power };
  const toMake: string[] = [];
  const named = cost.power.filter((p) => p !== "rainbow");
  const rainbow = cost.power.filter((p) => p === "rainbow");
  for (const pip of named) {
    if ((spare[pip] ?? 0) > 0) {
      spare[pip] = (spare[pip] ?? 0) - 1;
    } else {
      toMake.push(pip);
    }
  }
  for (const pip of rainbow) {
    const spareDomain = Object.keys(spare).find((d) => (spare[d] ?? 0) > 0);
    if (spareDomain) {
      spare[spareDomain] = (spare[spareDomain] ?? 0) - 1;
    } else {
      toMake.push(pip);
    }
  }
  for (const pip of toMake) {
    const cands = runes.filter((r) => !used.has(r.id) && r.recycle && (pip === "rainbow" || r.domain === pip));
    if (cands.length === 0) {
      return null;
    }
    const wantEnergy = energyGain < needEnergy;
    const readyFirst = [...cands].sort((a, b) => Number(b.ready && Boolean(b.exhaust)) - Number(a.ready && Boolean(a.exhaust)));
    const exhaustedFirst = [...cands].sort((a, b) => Number(a.ready) - Number(b.ready));
    const r = (wantEnergy ? readyFirst : exhaustedFirst)[0] as RuneInfo;
    used.add(r.id);
    if (r.ready && r.exhaust) {
      steps.push(r.exhaust);
      energyGain += 1;
    }
    steps.push(r.recycle as FlatMove);
  }
  while (energyGain < needEnergy) {
    const r = runes.find((x) => !used.has(x.id) && x.ready && x.exhaust);
    if (!r) {
      return null;
    }
    used.add(r.id);
    steps.push(r.exhaust as FlatMove);
    energyGain += 1;
  }
  return steps;
}

/** Canonical key for one play's target tuple, order-insensitive. */
function targetKey(moveId: string, cardId: string, targets: unknown): string | undefined {
  const list = Array.isArray(targets) ? targets.map(String) : typeof targets === "string" ? [targets] : [];
  return list.length === 0 ? undefined : `${moveId}|${cardId}|${canon([...list].sort())}`;
}

type DecisionOption = NonNullable<ReturnType<typeof deriveActionDecision>>["options"][number];

/**
 * rule 809.1.c.1 / 356.2 — the [Deflect] tax is owed for the TARGET, not the
 * card, so the engine quotes it per target tuple on the `targets` field. Keyed
 * by target tuple; entries exist only where something is actually owed.
 */
function optionSurcharges(option: DecisionOption): Map<string, number> {
  const owed = new Map<string, number>();
  const field = option.fields?.find((f) => f.name === "targets");
  if (!PLAY_MOVES.has(option.moveId) || !field?.surcharge) {
    return owed;
  }
  for (const cardId of new Set(option.variants.map((v) => String(v.params.cardId)))) {
    field.options?.forEach((o, i) => {
      const key = targetKey(option.moveId, cardId, o);
      const n = field.surcharge?.[i] ?? 0;
      if (key !== undefined && n > 0) {
        owed.set(key, n);
      }
    });
  }
  return owed;
}

/** The surcharge one flat play move owes for the targets it names. */
function moveSurcharge(owed: Map<string, number>, m: FlatMove): number {
  if (!PLAY_MOVES.has(m.moveId)) {
    return 0;
  }
  const key = targetKey(m.moveId, String(m.params.cardId), m.params.targets);
  return (key === undefined ? undefined : owed.get(key)) ?? 0;
}

/** How a taxed targeting line reads next to its printed cost (356.2 — part of the TOTAL cost). */
function surchargeText(n: number): string {
  return n > 0 ? ` + ${n} [rainbow] ([Deflect] surcharge)` : "";
}

/**
 * Plays the seat COULD make if it tapped runes: enumerate the play moves under
 * a temporarily flush pool (engine.applyPatches records no history), then
 * restore the real pool. Enumeration is read-only.
 *
 * rule 809.1.c.1 — the same pass records each target tuple's Power surcharge as
 * the ENGINE quotes it (the decision's `targets` field), so a "Pay & play" plan
 * can fund the [Deflect] tax the target incurs instead of only the card's cost.
 */
function probeAffordablePlays(session: GameSession, seat: string): { moves: FlatMove[]; surcharge: Map<string, number> } {
  const { engine } = session;
  const before = engine.getState();
  const realPool = before.runePools[seat];
  const surcharge = new Map<string, number>();
  if (!realPool || before.status !== "playing") {
    return { moves: [], surcharge };
  }
  const rich = {
    ...realPool,
    energy: 40,
    power: { body: 9, calm: 9, chaos: 9, fury: 9, mind: 9, order: 9, rainbow: 9 },
  };
  let out: FlatMove[] = [];
  try {
    engine.applyPatches([{ op: "replace", path: ["runePools", seat], value: rich }]);
    out = engine
      .enumerateMoves(seat as PlayerId, { moveIds: [...PLAY_MOVES], validOnly: true })
      .map((m) => ({ moveId: m.moveId, params: (m.params ?? {}) as Record<string, unknown>, playerId: (m.playerId as string) ?? seat }));
    const richDecision = deriveActionDecision(engineDecisionContext(engine, session.seq, true), seat, true);
    for (const option of richDecision?.options ?? []) {
      for (const [key, owed] of optionSurcharges(option)) {
        surcharge.set(key, owed);
      }
    }
  } catch {
    out = [];
  } finally {
    engine.applyPatches([{ op: "replace", path: ["runePools", seat], value: realPool }]);
  }
  return { moves: out, surcharge };
}

/** The numbered legal-action list for `seat` (concede excluded; End turn last). */
export function buildSeatMenu(session: GameSession, seat: string): { items: MenuItem[]; decision: ReturnType<typeof deriveActionDecision> } {
  const ctx = engineDecisionContext(session.engine, session.seq, true);
  const decision = deriveActionDecision(ctx, seat, true);
  const legal = ctx.legal(seat);
  const raw: { order: number; label: string; item: Omit<MenuItem, "index"> }[] = [];

  for (const option of decision?.options ?? []) {
    if (option.moveId === "concede" || option.moveId === "resolvePendingChoice") {
      continue;
    }
    // rule 809.1.c.1 / 356.2 — quote each targeting line at what the ENGINE will
    // charge: printed cost plus whatever [Deflect] tax that TARGET incurs.
    const owed = optionSurcharges(option);
    for (const v of pickVariants(option)) {
      raw.push({
        item: {
          kind: "move",
          label: `${labelMove(session, v)}${surchargeText(moveSurcharge(owed, v))}`,
          moves: [v],
          sig: sigOf(v),
        },
        label: "",
        order: MENU_ORDER[v.moveId] ?? 4,
      });
    }
  }

  // Synthesized "Pay & play": plays that only lack resources right now.
  const state = ctx.state;
  const pool = state.runePools[seat];
  const legalPlaySigs = new Set(legal.filter((m) => PLAY_MOVES.has(m.moveId)).map(sigOf));
  const legalPlayCards = new Set(legal.filter((m) => PLAY_MOVES.has(m.moveId)).map((m) => String(m.params.cardId)));
  if (pool && legal.some((m) => m.moveId === "exhaustRune" || m.moveId === "recycleRune")) {
    const runes = seatRunes(session, seat, legal);
    // rule 809.1.c.1 / 356.2 — the [Deflect] tax is owed for the TARGET, not
    // the card, so one plan per (card, surcharge): a taxed line needs its extra
    // Power of any Domain funded or the play is refused after the taps land.
    const byPlan = new Map<string, { cardId: string; surcharge: number; variants: FlatMove[] }>();
    const probed = probeAffordablePlays(session, seat);
    for (const v of probed.moves) {
      if (legalPlaySigs.has(sigOf(v)) || legalPlayCards.has(String(v.params.cardId))) {
        continue;
      }
      if (v.params.paidAdditionalCost === true || v.params.viaFlow === true || v.params.altCost === true) {
        continue;
      }
      if (v.moveId === "playSpell" && v.params.mode !== undefined) {
        continue;
      }
      const cardId = String(v.params.cardId);
      const tKey = targetKey(v.moveId, cardId, v.params.targets);
      const surcharge = (tKey !== undefined ? probed.surcharge.get(tKey) : undefined) ?? 0;
      const key = `${cardId}|${surcharge}`;
      const entry = byPlan.get(key) ?? { cardId, surcharge, variants: [] };
      entry.variants.push(v);
      byPlan.set(key, entry);
    }
    for (const { cardId, surcharge, variants } of byPlan.values()) {
      const cost = handPlayCost(session, cardId) ?? (() => {
        try {
          const st = buildCardState(session.engine, cardId);
          return { energy: st.energyCost, power: [...st.powerCost] };
        } catch {
          return undefined;
        }
      })();
      if (!cost) {
        continue;
      }
      const purse = { energy: pool.energy, power: pool.power as Record<string, number> };
      // "Pay & play" exists for a play the POOL cannot cover; a card the pool
      // already pays for is blocked only by the target's surcharge, which
      // 809.1.d/429.3 dims at the target rather than replans as a payment.
      const baseTaps = planPayment(cost, purse, runes);
      if (!baseTaps || baseTaps.length === 0) {
        continue;
      }
      // rule 356.2 — the surcharge is part of the TOTAL cost, so the plan must
      // fund it too (Power of any Domain, 809.1.c ⇒ planned as [rainbow]) or
      // the taps land and the play is then refused.
      const taps =
        surcharge > 0
          ? planPayment({ energy: cost.energy, power: [...cost.power, ...Array.from({ length: surcharge }, () => "rainbow")] }, purse, runes)
          : baseTaps;
      if (!taps || taps.length === 0) {
        continue;
      }
      const nEx = taps.filter((t) => t.moveId === "exhaustRune").length;
      const nRe = taps.filter((t) => t.moveId === "recycleRune");
      const tapText = `exhaust ${nEx} rune${nEx === 1 ? "" : "s"}${nRe.length ? `, recycle ${nRe.map((r) => `[${String(r.params.domain)}]`).join("")}` : ""}`;
      const seen = new Set<string>();
      let kept = 0;
      for (const v of variants) {
        const s = sigOf(v);
        if (seen.has(s) || kept >= 4) {
          continue;
        }
        seen.add(s);
        kept++;
        raw.push({
          item: {
            kind: "payplay",
            label: `Pay & ${labelMove(session, v)}${surchargeText(surcharge)} (auto: ${tapText}, then play)`,
            moves: taps,
            play: v,
            sig: `payplay:${s}`,
          },
          label: "",
          order: 1.5,
        });
      }
    }
  }

  raw.sort((a, b) => a.order - b.order);
  // Identical rune taps read the same; keep one per label.
  const items: MenuItem[] = [];
  const seenLabels = new Set<string>();
  const mustKeep = (it: Omit<MenuItem, "index">) => it.moves.some((m) => m.moveId === "endTurn" || m.moveId === "passChainPriority" || m.moveId === "passShowdownFocus");
  const tail = raw.filter((r) => mustKeep(r.item));
  for (const r of raw) {
    if (mustKeep(r.item)) {
      continue;
    }
    const isRune = r.item.moves.length === 1 && (r.item.moves[0]?.moveId === "exhaustRune" || r.item.moves[0]?.moveId === "recycleRune");
    if (isRune && seenLabels.has(r.item.label)) {
      continue;
    }
    seenLabels.add(r.item.label);
    if (items.length >= MAX_MENU - tail.length) {
      continue;
    }
    items.push({ ...r.item, index: items.length });
  }
  for (const r of tail) {
    items.push({ ...r.item, index: items.length });
  }
  return { decision, items };
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

export const SYSTEM_PRIMER = `You are playing Riftbound, a two-player trading card game, as one seat of a live match against a human. Play to win. Be decisive and brief.

RULES PRIMER
- Win by reaching the point target (usually 8). You score 1 point when you CONQUER a battlefield (take control by winning combat / moving in unopposed and holding it through the showdown) and 1 point per battlefield you HOLD at the start of your turn.
- Turn: Awaken (ready everything) → Beginning (hold scoring) → Channel 2 runes from your rune deck → Draw 1 → Main phase (Neutral Open: play cards, move units, use abilities, in any order) → End turn. Damage on units clears at end of turn.
- Resources: EXHAUST a rune for +1 energy; RECYCLE a rune (bottom of rune deck) for +1 power of its domain. Costs read "N energy + [domain] power pips". Unspent energy/power is lost at end of turn, and recycled runes are gone, so only recycle when you need the power. "Pay & play …" menu entries do the rune math for you — prefer them over tapping runes one at a time.
- Units enter your Base (or sometimes a battlefield). MOVE units from Base to a battlefield (moving exhausts them; exhausted units can't move again this turn). Moving onto a battlefield that has enemy units, or that the enemy controls, starts a SHOWDOWN there: players alternate FOCUS to play Action/Reaction-speed cards, then pass; when both pass, COMBAT resolves — each side deals damage equal to its total Might; units with damage ≥ Might die; if only attackers survive they conquer.
- The CHAIN: when a card/ability is played, the opponent gets PRIORITY to respond with Reaction-speed effects; passing priority lets the top item resolve. If you hold priority/focus and have nothing worthwhile, pass.
- Action-speed cards: only on your turn in an open state or during showdowns; Reaction-speed: any time you have priority. Hidden (facedown) cards at battlefields are unknown to you unless they are yours.
- Card text wins over this primer.

HOW TO PLAY WELL
- Each step you get the current state and a numbered list of LEGAL actions (or a pending prompt). Pick exactly one by calling the tool. You will be asked again after it resolves, so plan sequences one action at a time.
- Develop: spend your energy on units/gear most turns; don't end the turn with lots of unspent energy and playable cards.
- Contest: move ready units with enough Might onto battlefields you can win or hold; avoid suicidal attacks into bigger defenders unless it scores the winning point.
- Only choose "End turn" when nothing else useful is legal. Never reason about the identities of cards you cannot see (opponent hand, facedown cards, decks) — treat them as unknown.
- Lookups: when offered, you may call search_cards / card / rule / rule_search / opponent_summary / zone / battlefields / chain_status sparingly (at most 3 per decision, only when the answer would change your play) — they show public information only.
- Output contract: call the decision tool (choose / answer) with your choice and a rationale of at most 140 characters. After any lookups you MUST decide. No other text.`;

export interface PromptBundle {
  system: string;
  user: string;
  /** Exactly one of these is set. */
  menu?: MenuItem[];
  decision?: Decision;
  /** Numeric aliases for decision option keys ("1" → key). */
  keyAliases?: Map<string, string>;
  toolName: "choose" | "answer";
}

function rulesNote(max: number): (c: CardState) => string | undefined {
  return (c) => {
    const text = (registry.get(c.defId)?.rulesText ?? c.rulesText ?? "").replace(/\s+/g, " ").trim();
    if (!text) {
      return undefined;
    }
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  };
}

/** "3× Name" list of definition ids grouped by card name (registration order). */
function groupedNames(defIds: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const id of defIds) {
    const name = defName(id) ?? id;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].map(([name, n]) => `${n}× ${name}`).join(", ");
}

/**
 * The AI seat's OWN registered deck (post-sideboarding when that ran) as a
 * short list for the system prompt — a player knows their list, not the draw
 * order. Undefined when the session carries no deck configs.
 */
export function describeDeckForSeat(session: GameSession, seat: string): string | undefined {
  const deck: DeckConfig | undefined = session.postSideboardDecks?.[seat] ?? session.decks?.[seat];
  if (!deck) {
    return undefined;
  }
  const legend = deck.legendId ? registry.get(deck.legendId) : undefined;
  const champion = deck.championId ? registry.get(deck.championId) : undefined;
  const d = legend?.domain;
  const domains = typeof d === "string" ? [d] : Array.isArray(d) ? [...d] : [];
  const lines: string[] = ["YOUR DECK (the list you registered — draw order is unknown; the opponent's list is unknown)"];
  lines.push(`Legend: ${legend?.name ?? "none"} · Chosen champion: ${champion?.name ?? "none"}${domains.length ? ` · Domains: ${domains.join("/")}` : ""}`);
  lines.push(`Main deck (${deck.mainDeckCardIds.length}${deck.championId ? " + champion" : ""}): ${groupedNames(deck.mainDeckCardIds)}`);
  if (deck.runeDeckCardIds.length) {
    lines.push(`Runes: ${groupedNames(deck.runeDeckCardIds)}`);
  }
  if (deck.battlefieldIds.length) {
    lines.push(`Battlefields registered: ${groupedNames(deck.battlefieldIds)}`);
  }
  if (deck.sideboardCardIds?.length) {
    lines.push(`Sideboard (not in play): ${groupedNames(deck.sideboardCardIds)}`);
  }
  return lines.join("\n");
}

/** System prompt for `seat`: primer + identity + the seat's own deck list. */
export function systemPromptFor(session: GameSession, seat: string, modelLabel: string): string {
  const deck = describeDeckForSeat(session, seat);
  return `${SYSTEM_PRIMER}\n\nYou are ${modelLabel}, seat ${seat}.${deck ? `\n\n${deck}` : ""}`;
}

/** State text from the AI seat's perspective only (harness redaction: opponent hand = count, facedown = count). */
export function describeForSeat(session: GameSession, seat: string): string {
  const obs = observe(session.engine, seat, session.seq, null);
  const view = renderSeatView({
    boardNote: rulesNote(110),
    handNote: rulesNote(170),
    header: `Turn ${obs.turn.number} — ${obs.turn.activePlayer === seat ? "YOUR" : "the opponent's"} turn, ${obs.turn.phase} phase. You are ${seat}; the human is ${session.players.find((p) => p !== seat) ?? "player-1"}.`,
    obs,
    seat,
    seats: [...session.players],
  });
  // The generic decision line names raw ids / option counts; the menu below replaces it.
  const lines = view.text.split("\n").filter((l) => !l.startsWith("Decision:") && !l.startsWith("Your free actions:") && !l.startsWith("Recent:"));
  return shortenRefs(session, lines.join("\n"));
}

function decisionText(session: GameSession, d: Decision): { text: string; aliases: Map<string, string> } {
  const aliases = new Map<string, string>();
  const lines: string[] = [];
  lines.push(`PENDING PROMPT for you (${d.kind}): ${shortenRefs(session, d.prompt)}`);
  const list = (opts: readonly { key: string; label: string }[]) => {
    opts.forEach((o, i) => {
      const n = String(i + 1);
      aliases.set(n, o.key);
      lines.push(`  [${n}] ${shortenRefs(session, o.label)}`);
    });
  };
  switch (d.kind) {
    case "pick": {
      list(d.options);
      lines.push(`Choose ${d.min === d.max ? d.min : `${d.min}..${d.max}`} option number(s) via answer.keys${d.allowDecline ? " (or an empty list to decline)" : ""}.`);
      break;
    }
    case "yes-no": {
      lines.push(`Answer via answer.accept (true/false)${d.canAccept === false ? " — accepting is NOT currently possible, answer false" : ""}.${d.consequence ? ` Yes = ${d.consequence}.` : ""}`);
      break;
    }
    case "integer": {
      lines.push(`Answer via answer.value: an integer ${d.min}..${d.max} (${d.unit}).`);
      break;
    }
    case "order": {
      list(d.items);
      lines.push(`Answer via answer.order: option numbers in the order you want (first = resolves first)${d.defaultable ? "; an empty list keeps the listed order" : ""}.`);
      break;
    }
    case "distribute": {
      list(d.buckets);
      lines.push(`Assign ${d.total} in total. Answer via answer.keys with ONE option number to put all ${d.total} there (the engine offers finer splits to humans only).`);
      break;
    }
    case "name": {
      lines.push(`Answer via answer.keys with one card NAME from: ${d.vocabulary.slice(0, 40).join(", ")}${d.vocabulary.length > 40 ? ", …" : ""}`);
      break;
    }
    case "deck-arrange": {
      list(d.cards);
      lines.push("Answer via answer.order: option numbers top-first.");
      break;
    }
    case "action": {
      break;
    }
    default: {
      break;
    }
  }
  return { aliases, text: lines.join("\n") };
}

export function buildPrompt(session: GameSession, seat: string, memory: readonly string[], modelLabel: string, retryNote?: string): PromptBundle {
  const state = session.engine.getState();
  const parts: string[] = [];
  parts.push("STATE (your perspective; hidden information is not shown)");
  parts.push(describeForSeat(session, seat));
  if (memory.length) {
    parts.push("");
    parts.push("YOUR ACTIONS SO FAR THIS TURN");
    for (const m of memory.slice(-12)) {
      parts.push(`- ${m}`);
    }
  }
  const pc = state.pendingChoice;
  if (pc && getPendingChoiceChooser(pc) === seat) {
    const ctx = engineDecisionContext(session.engine, session.seq, true);
    const d = deriveFromPendingChoice(ctx, pc);
    const { text, aliases } = decisionText(session, d);
    parts.push("");
    parts.push(text);
    if (retryNote) {
      parts.push("");
      parts.push(`NOTE: ${retryNote}`);
    }
    parts.push("");
    parts.push("Call the `answer` tool now.");
    return { decision: d, keyAliases: aliases, system: systemPromptFor(session, seat, modelLabel), toolName: "answer", user: parts.join("\n") };
  }
  const { items } = buildSeatMenu(session, seat);
  parts.push("");
  parts.push("LEGAL ACTIONS (choose exactly one index)");
  for (const it of items) {
    parts.push(`[${it.index}] ${it.label}`);
  }
  if (retryNote) {
    parts.push("");
    parts.push(`NOTE: ${retryNote}`);
  }
  parts.push("");
  parts.push("Call the `choose` tool now.");
  return { menu: items, system: systemPromptFor(session, seat, modelLabel), toolName: "choose", user: parts.join("\n") };
}

// ---------------------------------------------------------------------------
// Model call
// ---------------------------------------------------------------------------

export interface ModelTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * Optional read-only "lookup" tools offered beside choose/answer (rules
 * lookup, card search, per-seat zone summaries from packages/riftbound-mcp
 * info-tools). Same shape as an Anthropic tool plus a handler; the step loop
 * runs ≤ MAX_LOOKUPS_PER_DECISION of them, appends tool_result blocks and
 * re-asks, then forces the decision tool. Handlers must be hidden-info-safe
 * for `seat`.
 */
export interface LookupTool extends ModelTool {
  handler: (input: Record<string, unknown>, ctx: { session: GameSession; engine: GameSession["engine"]; seat: string }) => unknown;
}

export const MAX_LOOKUPS_PER_DECISION = 3;

/**
 * The MCP info tools (`packages/riftbound-mcp/src/info-tools.ts`) bound to the
 * AI seat: game lookups read `observe(engine, seat)` — the same redacted view
 * the prompt is rendered from — so they can never reveal more than the seat sees.
 */
export function mcpInfoLookupTools(names?: readonly string[]): LookupTool[] {
  return bindInfoTools<{ session: GameSession; engine: GameSession["engine"]; seat: string }>(
    ({ engine, seat, session }) => ({
      seats: session.players,
      view: (viewer) => observe(engine, viewer, session.seq, null),
      viewer: seat,
    }),
    { names },
  );
}

let defaultLookupTools: LookupTool[] = mcpInfoLookupTools();

/** Install lookup tools for every ClaudeOpponent created afterwards (mcp info-tools wiring point). */
export function setDefaultLookupTools(tools: readonly LookupTool[]): void {
  defaultLookupTools = tools.filter((t) => t && typeof t.name === "string" && typeof t.handler === "function" && t.name !== "choose" && t.name !== "answer");
}

export type MessageBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface ModelRequest {
  model: string;
  system: string;
  messages: { role: "user" | "assistant"; content: string | MessageBlock[] }[];
  tools: ModelTool[];
  tool_choice: { type: "any" } | { type: "tool"; name: string };
  max_tokens: number;
  /** Not sent to the API — lets an injected provider (tests, RB_AI_MOCK) see the structured question. */
  meta: { seat: string; menu?: MenuItem[]; decision?: Decision; keyAliases?: Map<string, string> };
}

export interface ModelToolUse {
  id?: string;
  name: string;
  input: Record<string, unknown>;
}

/** Full assistant turn: every tool_use block plus the raw content to echo back before tool_results. */
export interface ModelResponse {
  toolUses: ModelToolUse[];
  content: MessageBlock[];
}

/** A provider may return the whole turn or, for convenience (tests), a single tool use. */
export type CallModel = (req: ModelRequest, opts: { apiKey: string; signal: AbortSignal }) => Promise<ModelResponse | ModelToolUse>;

function asResponse(r: ModelResponse | ModelToolUse): ModelResponse {
  if ("toolUses" in r) {
    return r;
  }
  const id = r.id ?? `toolu_local_${Math.random().toString(36).slice(2, 10)}`;
  return { content: [{ id, input: r.input, name: r.name, type: "tool_use" }], toolUses: [{ ...r, id }] };
}

export class AiCallError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = "AiCallError";
    this.status = status;
    this.retryable = retryable;
  }
}

export const CHOOSE_TOOL: ModelTool = {
  description: "Choose one legal action by its index from the LEGAL ACTIONS list.",
  input_schema: {
    properties: {
      index: { description: "Index from the current LEGAL ACTIONS list", type: "integer" },
      rationale: { description: "Why (max 140 chars)", maxLength: 140, type: "string" },
    },
    required: ["index", "rationale"],
    type: "object",
  },
  name: "choose",
};

export const ANSWER_TOOL: ModelTool = {
  description: "Answer the pending prompt. Use `keys` (option numbers) for picks, `accept` for yes/no, `value` for numbers, `order` for orderings.",
  input_schema: {
    properties: {
      accept: { type: "boolean" },
      keys: { items: { type: "string" }, type: "array" },
      order: { items: { type: "string" }, type: "array" },
      rationale: { description: "Why (max 140 chars)", maxLength: 140, type: "string" },
      value: { type: "integer" },
    },
    required: ["rationale"],
    type: "object",
  },
  name: "answer",
};

/** Default provider: POST https://api.anthropic.com/v1/messages. Logs model + status only. */
export const anthropicCallModel: CallModel = async (req, { apiKey, signal }) => {
  const { meta: _meta, ...body } = req;
  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      body: JSON.stringify(body),
      headers: {
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      method: "POST",
      signal,
    });
  } catch (error) {
    const aborted = (error as { name?: string })?.name === "AbortError" || signal.aborted;
    throw new AiCallError(aborted ? "model call timed out" : `network error: ${redactKey((error as Error)?.message ?? String(error), apiKey)}`, 0, true);
  }
  console.log(`[ai] ${req.model} → HTTP ${res.status}`);
  if (!res.ok) {
    let kind = "";
    try {
      const j = (await res.json()) as { error?: { type?: string } };
      kind = j?.error?.type ?? "";
    } catch { /* */ }
    const retryable = res.status >= 500 || res.status === 429 || res.status === 529 || kind === "overloaded_error";
    throw new AiCallError(`API error ${res.status}${kind ? ` (${kind})` : ""}`, res.status, retryable);
  }
  const data = (await res.json()) as { content?: { type: string; id?: string; name?: string; text?: string; input?: Record<string, unknown> }[] };
  const content: MessageBlock[] = [];
  const toolUses: ModelToolUse[] = [];
  for (const c of data.content ?? []) {
    if (c.type === "tool_use" && typeof c.name === "string" && typeof c.id === "string") {
      content.push({ id: c.id, input: c.input ?? {}, name: c.name, type: "tool_use" });
      toolUses.push({ id: c.id, input: c.input ?? {}, name: c.name });
    } else if (c.type === "text" && typeof c.text === "string") {
      content.push({ text: c.text, type: "text" });
    }
  }
  if (toolUses.length === 0) {
    throw new AiCallError("no tool_use block in the response", res.status, false);
  }
  return { content, toolUses };
};

/** First-legal-action provider (RB_AI_MOCK=1 and tests): index 0 for menus, first option / yes / minimum for prompts. */
export const firstLegalCallModel: CallModel = async (req) => {
  if (req.meta.menu) {
    return { input: { index: 0, rationale: "mock: first legal action" }, name: "choose" };
  }
  const d = req.meta.decision as Decision;
  const sh = firstOptionPolicy(d, undefined as never);
  const ans = sh === undefined ? undefined : coerceAnswer(d, sh);
  const input: Record<string, unknown> = { rationale: "mock: first option" };
  const alias = (key: string): string => {
    for (const [n, k] of req.meta.keyAliases ?? []) {
      if (k === key) {
        return n;
      }
    }
    return key;
  };
  if (ans && "kind" in ans) {
    switch (ans.kind) {
      case "pick": {
        input.keys = ans.keys.map(alias);
        break;
      }
      case "decline": {
        input.keys = [];
        break;
      }
      case "yes-no": {
        input.accept = ans.value;
        break;
      }
      case "integer": {
        input.value = ans.value;
        break;
      }
      case "order": {
        input.order = ans.keys.map(alias);
        break;
      }
      case "distribute": {
        const best = Object.entries(ans.allocation).sort((a, b) => b[1] - a[1])[0];
        input.keys = best ? [alias(best[0])] : [];
        break;
      }
      case "name": {
        input.keys = [ans.name];
        break;
      }
      case "deck-arrange": {
        input.order = ans.top.map(alias);
        break;
      }
      default: {
        break;
      }
    }
  }
  return { input, name: "answer" };
};

// ---------------------------------------------------------------------------
// The driver
// ---------------------------------------------------------------------------

export interface ClaudeOpponentOptions {
  callModel?: CallModel;
  /** Read-only lookup tools offered beside the decision tool (default: setDefaultLookupTools()). */
  lookupTools?: readonly LookupTool[];
  /** Delay between applied actions so the human sees plays one by one (ms). */
  pacingMs?: number;
  /** Per-call timeout (ms). */
  timeoutMs?: number;
  /** Pregame decisions (battlefield pick): one attempt, this timeout (ms), then a seeded fallback. */
  pregameTimeoutMs?: number;
  /** Backoff base for retryable API failures (ms). */
  backoffMs?: number;
  maxActionsPerSegment?: number;
  gameId?: string;
}

interface Choice {
  label: string;
  rationale: string;
  /** Moves to apply, in order. */
  moves: FlatMove[];
  play?: FlatMove;
  fallback: boolean;
}

/**
 * rule 723 / 811.1.d — the public wording of one 🤖 action line, or undefined
 * when the line names nothing the other seats may not know.
 *
 * The only action whose own label names a card that STAYS private is [Hidden]:
 * the card goes from hand to a facedown zone, so everyone sees that a card was
 * hidden and where, and nobody but its owner sees which. Every other label
 * names cards the action itself makes public (a play, a move, a discard to the
 * trash), and a look at a Secret zone never reaches a label at all — the
 * engine flags the prompt `private` and `describeAnswer` drops the card there.
 */
export function publicActionLine(session: GameSession, moves: readonly FlatMove[], line: string): string | undefined {
  let out = line;
  for (const m of moves) {
    if (m.moveId !== "hideCard" || typeof m.params.cardId !== "string") {
      continue;
    }
    // The tagged form is what the label carries; the bare name is what a free
    // -text rationale would use. Both have to go.
    for (const named of [tag(session, m.params.cardId), cardName(session, m.params.cardId)]) {
      if (named) {
        out = out.split(named).join("a card");
      }
    }
  }
  return out === line ? undefined : out;
}

const sleep = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

/** True when `seat` must decide something right now (and the game is live). */
export function aiSeatMustAct(session: GameSession, seat: string): boolean {
  if (session.pregame) {
    return false;
  }
  const state = session.engine.getState();
  if (state.status !== "playing") {
    return false;
  }
  return getActingSeat(state) === seat;
}

/** One Goldfish-policy action for `seat` (mirrors turn.ts sandboxAutoPlay's priorities), or null. */
export function goldfishFallbackMove(session: GameSession, seat: string): (FlatMove & { label: string }) | null {
  const state = session.engine.getState();
  const moves = buildAvailableMoves(session, seat) as FlatMove[];
  const pick = (moveId: string, pred: (m: FlatMove) => boolean = () => true) => moves.find((m) => m.moveId === moveId && pred(m));
  const pending = state.pendingChoice;
  if (pending && getPendingChoiceChooser(pending) === seat) {
    const m = pick("resolvePendingChoice");
    return m ? { ...m, label: "Resolve prompt (first option)" } : null;
  }
  if (state.interaction?.chain?.active && state.interaction.chain.activePlayer === seat) {
    return { label: "Pass priority", moveId: "passChainPriority", params: { playerId: seat }, playerId: seat };
  }
  const focus = pick("passShowdownFocus");
  if (focus) {
    return { ...focus, label: "Pass focus" };
  }
  if (state.turn.activePlayer === seat) {
    const begin = pick("startShowdown");
    if (begin) {
      return { ...begin, label: labelMove(session, begin) };
    }
    const conquer = pick("conquerBattlefield", (m) => (m.params as { playerId?: string }).playerId === seat);
    if (conquer) {
      return { ...conquer, label: labelMove(session, conquer) };
    }
    // rule 383.3.d — a soft trigger-order offer: accept the listed order.
    const order = pick("resolvePendingChoice");
    if (order && state.pendingTriggerOrder) {
      return { ...order, label: "Keep trigger order" };
    }
    return { label: "End turn", moveId: "endTurn", params: { playerId: seat }, playerId: seat };
  }
  return null;
}

/**
 * A step with nothing to decide: a one-entry menu (a lone "Pass priority" on
 * your own chain item, "End turn" with an empty hand) or a forced prompt
 * (single mandatory pick / single bucket). Answered locally — no model call.
 */
export function forcedChoice(session: GameSession, prompt: PromptBundle): Choice | undefined {
  if (prompt.menu) {
    if (prompt.menu.length !== 1) {
      return undefined;
    }
    const only = prompt.menu[0] as MenuItem;
    return { fallback: false, label: `${only.label} (only legal action)`, moves: only.moves, play: only.play, rationale: "" };
  }
  const d = prompt.decision;
  if (!d) {
    return undefined;
  }
  let answer: Answer | undefined;
  if (d.kind === "pick" && d.options.length === 1 && d.min >= 1 && !d.allowDecline) {
    answer = { keys: [d.options[0]?.key as string], kind: "pick" };
  } else if (d.kind === "pick" && d.options.length === 0 && d.allowDecline) {
    answer = { kind: "decline" };
  } else if (d.kind === "distribute" && d.buckets.length === 1) {
    answer = { allocation: { [d.buckets[0]?.key as string]: d.total }, kind: "distribute" };
  } else if (d.kind === "integer" && d.min === d.max) {
    answer = { kind: "integer", value: d.min };
  }
  if (!answer) {
    return undefined;
  }
  const ctx = engineDecisionContext(session.engine, session.seq, true);
  const outcome = resolvePendingAnswer(ctx, d, answer);
  if (outcome.type === "error") {
    return undefined;
  }
  return { fallback: false, label: `${describeAnswer(session, d, answer)} (forced)`, moves: [outcome.move], rationale: "" };
}

/** `#decide` result when a rewind invalidated the position mid-thought. */
const STALE = Symbol("stale-decision");

export class ClaudeOpponent implements OpponentHandle {
  readonly model: ModelKey;
  readonly modelId: string;
  readonly info: OpponentInfo;
  readonly seat = "player-2";
  busy = false;
  thinking = false;
  /** Set after a non-retryable API failure (bad key…): later steps go straight to the Goldfish. */
  disabledReason: string | undefined;
  readonly #apiKey: string | undefined;
  readonly #callModel: CallModel;
  readonly #lookupTools: LookupTool[];
  readonly #opts: Required<Pick<ClaudeOpponentOptions, "pacingMs" | "timeoutMs" | "pregameTimeoutMs" | "backoffMs" | "maxActionsPerSegment">>;
  gameId: string | undefined;
  /**
   * Rewind debounce: while `Date.now() < holdUntil` the seat does not act (a
   * `scheduleOpponent` timer re-arms it). Lets several Rewind clicks land
   * before the AI answers the rewound position.
   */
  holdUntil = 0;
  /** Decisions thrown away because a rewind changed the position while the model was thinking. */
  staleDiscards = 0;
  #memory: string[] = [];
  #memoryTurn = -1;
  #rerun = false;

  constructor(model: ModelKey, apiKey: string | undefined, opts: ClaudeOpponentOptions = {}) {
    const resolved = resolveModel(model);
    if (!resolved) {
      throw new Error(`Unknown model '${String(model)}' — allowed: ${listModels().map((m) => m.key).join(", ")}`);
    }
    this.model = resolved.key;
    this.modelId = resolved.id;
    this.info = { kind: "claude", label: resolved.label, model: resolved.key };
    this.#apiKey = apiKey?.trim() || undefined;
    this.#callModel = opts.callModel ?? (aiMockEnabled() ? firstLegalCallModel : anthropicCallModel);
    this.#lookupTools = [...(opts.lookupTools ?? defaultLookupTools)];
    this.#opts = {
      backoffMs: opts.backoffMs ?? 1000,
      maxActionsPerSegment: opts.maxActionsPerSegment ?? 40,
      pacingMs: opts.pacingMs ?? (aiMockEnabled() && opts.callModel === undefined ? 150 : 600),
      pregameTimeoutMs: opts.pregameTimeoutMs ?? 10_000,
      timeoutMs: opts.timeoutMs ?? 45_000,
    };
    this.gameId = opts.gameId;
  }

  get shortName(): string {
    return AI_MODELS[this.model].short;
  }

  toJSON(): OpponentInfo {
    return { ...this.info };
  }

  #key(): string | undefined {
    return this.#apiKey ?? envApiKey() ?? (this.#callModel !== anthropicCallModel ? "mock" : undefined);
  }

  #redact(text: string): string {
    return redactKey(text, this.#apiKey ?? envApiKey());
  }

  /**
   * Push one 🤖 line onto the shared match log. `publicText` (rule 128.3) is
   * what the OTHER seats read when the full line names something only this
   * seat may know — a card it hid facedown (723 / 811.1.d), a card still in
   * its hand. Omit it and the line is public, which is the normal case: what
   * the seat DID is public information (108.2).
   */
  #log(session: GameSession, text: string, publicText?: string): void {
    session.log.push(makeLogEntry(text, {
      key: anchorKeyAfterLastMove(session, `ai${session.log.length}`),
      ...(publicText === undefined ? {} : { visibility: { publicText, seats: [this.seat] } }),
    }));
  }

  #push(session: GameSession, moveId: string): void {
    session.seq++;
    for (const [, client] of session.clients) {
      try {
        client.ws.send(JSON.stringify({
          moveId,
          moves: buildAvailableMoves(session, client.playerId),
          playerId: this.seat,
          seq: session.seq,
          state: buildGameSnapshot(session, client.playerId),
          type: "state_update",
        }));
      } catch { /* Disconnected */ }
    }
  }

  #pushStatus(session: GameSession): void {
    broadcast(session, { ai: { ...this.info, thinking: this.thinking }, type: "ai_status" });
  }

  /** Model call with timeout + retry/backoff; throws AiCallError when exhausted. */
  async #call(req: ModelRequest): Promise<ModelResponse> {
    const key = this.#key();
    if (!key) {
      throw new AiCallError("no API key available", 401, false);
    }
    let lastError: AiCallError | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.#opts.timeoutMs);
      try {
        return asResponse(await this.#callModel(req, { apiKey: key, signal: ctrl.signal }));
      } catch (error) {
        const e = error instanceof AiCallError
          ? error
          : new AiCallError(this.#redact((error as Error)?.message ?? String(error)), 0, true);
        lastError = new AiCallError(this.#redact(e.message), e.status, e.retryable);
        if (!e.retryable) {
          break;
        }
        const backoff = this.#opts.backoffMs * (attempt === 0 ? 1 : 3) * (0.8 + Math.random() * 0.4);
        await sleep(backoff);
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError ?? new AiCallError("model call failed", 0, false);
  }

  /**
   * One decision exchange: the decision tool plus any lookup tools; each
   * lookup call gets a tool_result and the model is re-asked (≤
   * MAX_LOOKUPS_PER_DECISION rounds), after which the decision tool is forced.
   * Returns the choose/answer tool use, or undefined if the model never decided.
   */
  async #askWithLookups(session: GameSession, prompt: PromptBundle): Promise<ModelToolUse | undefined> {
    const decisionTool = prompt.toolName === "choose" ? CHOOSE_TOOL : ANSWER_TOOL;
    const lookups = this.#lookupTools;
    const messages: ModelRequest["messages"] = [{ content: prompt.user, role: "user" }];
    let lookupsUsed = 0;
    for (let round = 0; round <= MAX_LOOKUPS_PER_DECISION; round++) {
      const allowLookups = lookups.length > 0 && lookupsUsed < MAX_LOOKUPS_PER_DECISION;
      const req: ModelRequest = {
        max_tokens: 300,
        messages,
        meta: { decision: prompt.decision, keyAliases: prompt.keyAliases, menu: prompt.menu, seat: this.seat },
        model: this.modelId,
        system: prompt.system,
        tool_choice: allowLookups ? { type: "any" } : lookups.length > 0 ? { name: decisionTool.name, type: "tool" } : { type: "any" },
        tools: [decisionTool, ...(allowLookups ? lookups.map(({ handler: _h, ...spec }) => spec) : [])],
      };
      const res = await this.#call(req);
      const decided = res.toolUses.find((t) => t.name === decisionTool.name);
      if (decided) {
        return decided;
      }
      const asked = res.toolUses.filter((t) => lookups.some((l) => l.name === t.name));
      if (asked.length === 0) {
        return res.toolUses[0]; // unknown tool → #validate reports it and we retry with a NOTE
      }
      messages.push({ content: res.content, role: "assistant" });
      const results: MessageBlock[] = [];
      for (const t of res.toolUses) {
        const tool = lookups.find((l) => l.name === t.name);
        let text: string;
        let isError = false;
        if (!tool) {
          text = `Unknown tool ${t.name}. Decide with ${decisionTool.name}.`;
          isError = true;
        } else if (lookupsUsed >= MAX_LOOKUPS_PER_DECISION) {
          text = `Lookup budget spent (${MAX_LOOKUPS_PER_DECISION} per decision). Decide now with ${decisionTool.name}.`;
          isError = true;
        } else {
          lookupsUsed++;
          try {
            const v = await tool.handler(t.input ?? {}, { engine: session.engine, seat: this.seat, session });
            text = typeof v === "string" ? v : JSON.stringify(v);
          } catch (error) {
            text = `lookup failed: ${this.#redact((error as Error)?.message ?? String(error))}`;
            isError = true;
          }
          if (text.length > 4000) {
            text = `${text.slice(0, 4000)}… (truncated)`;
          }
        }
        results.push({ content: text, ...(isError ? { is_error: true } : {}), tool_use_id: t.id ?? "", type: "tool_result" });
      }
      messages.push({ content: results, role: "user" });
    }
    return undefined;
  }

  /**
   * Ask the model for one action (≤3 attempts on invalid output), else the
   * Goldfish move. `STALE` when a Rewind/Redo changed the position while the
   * model was thinking (the answer is for a position that no longer exists and
   * must not even be re-validated against the new one).
   */
  async #decide(session: GameSession, epoch: number): Promise<Choice | null | typeof STALE> {
    let retryNote: string | undefined;
    if (!this.disabledReason) {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (rewindEpoch(session) !== epoch) {
          return STALE;
        }
        const prompt = buildPrompt(session, this.seat, this.#memory, this.info.label, retryNote);
        // No real choice (a lone "Pass priority", a single forced pick): don't spend a call.
        const forced = forcedChoice(session, prompt);
        if (forced) {
          return forced;
        }
        let out: ModelToolUse | undefined;
        try {
          out = await this.#askWithLookups(session, prompt);
          if (rewindEpoch(session) !== epoch) {
            return STALE;
          }
        } catch (error) {
          const e = error as AiCallError;
          console.log(`[ai] ${this.modelId} call failed: ${this.#redact(e.message)}`);
          if (!e.retryable && (e.status === 401 || e.status === 403 || e.status === 400 || e.status === 404)) {
            this.disabledReason = `API ${e.status || "error"}`;
            this.#log(session, `🤖 ${this.info.label} is unavailable (${this.disabledReason}) — the Goldfish plays this seat.`);
          }
          break;
        }
        if (!out) {
          retryNote = "You looked things up but never decided. Call the decision tool now.";
          console.log(`[ai] ${this.modelId} invalid output (attempt ${attempt + 1}): no decision after lookups`);
          continue;
        }
        const resolved = this.#validate(session, prompt, out);
        if (resolved.ok) {
          return resolved.choice;
        }
        retryNote = `Your previous reply was invalid (${resolved.error}). Use the tool with a valid choice from the CURRENT list above.`;
        console.log(`[ai] ${this.modelId} invalid output (attempt ${attempt + 1}): ${resolved.error}`);
      }
    }
    const fb = goldfishFallbackMove(session, this.seat);
    if (!fb) {
      return null;
    }
    const { label, ...move } = fb;
    return { fallback: true, label, moves: [move], rationale: "", play: undefined };
  }

  /** Map a tool_use onto moves, re-reading the CURRENT state (the menu may have moved under us). */
  #validate(session: GameSession, prompt: PromptBundle, out: ModelToolUse): { ok: true; choice: Choice } | { ok: false; error: string } {
    const rationale = typeof out.input.rationale === "string" ? out.input.rationale.replace(/\s+/g, " ").slice(0, 140) : "";
    if (prompt.toolName === "choose") {
      if (out.name !== "choose") {
        return { error: `expected the choose tool, got ${out.name}`, ok: false };
      }
      const idx = Number(out.input.index);
      const menu = prompt.menu ?? [];
      if (!Number.isInteger(idx) || idx < 0 || idx >= menu.length) {
        return { error: `index ${String(out.input.index)} is out of range 0..${menu.length - 1}`, ok: false };
      }
      const chosen = menu[idx] as MenuItem;
      const fresh = buildSeatMenu(session, this.seat).items;
      const still = fresh.find((it) => it.sig === chosen.sig);
      if (!still) {
        return { error: "that action is no longer legal", ok: false };
      }
      return { choice: { fallback: false, label: still.label, moves: still.moves, play: still.play, rationale }, ok: true };
    }
    if (out.name !== "answer") {
      return { error: `expected the answer tool, got ${out.name}`, ok: false };
    }
    const state = session.engine.getState();
    const pc = state.pendingChoice;
    if (!pc || getPendingChoiceChooser(pc) !== this.seat) {
      return { error: "the prompt is gone", ok: false };
    }
    const ctx = engineDecisionContext(session.engine, session.seq, true);
    const d = deriveFromPendingChoice(ctx, pc);
    const aliases = prompt.keyAliases ?? new Map<string, string>();
    const unalias = (v: unknown): string => {
      const s = String(v).replace(/^\[|\]$/g, "").trim();
      return aliases.get(s) ?? s;
    };
    const inp = out.input;
    let answer: Answer | undefined;
    switch (d.kind) {
      case "pick": {
        const keys = Array.isArray(inp.keys) ? inp.keys.map(unalias) : typeof inp.value === "number" ? [unalias(inp.value)] : [];
        const valid = new Set(d.options.map((o) => o.key));
        const bad = keys.filter((k) => !valid.has(k));
        if (bad.length) {
          return { error: `unknown option(s) ${bad.join(", ")}`, ok: false };
        }
        if (keys.length === 0) {
          if (!d.allowDecline && d.min > 0) {
            return { error: `pick at least ${d.min}`, ok: false };
          }
          answer = { kind: "decline" };
        } else {
          if (keys.length < d.min || keys.length > d.max) {
            return { error: `pick ${d.min}..${d.max} options`, ok: false };
          }
          answer = { keys, kind: "pick" };
        }
        break;
      }
      case "yes-no": {
        if (typeof inp.accept !== "boolean") {
          return { error: "answer.accept (true/false) is required", ok: false };
        }
        if (inp.accept && d.canAccept === false) {
          return { error: "accepting is not possible right now", ok: false };
        }
        answer = { kind: "yes-no", value: inp.accept };
        break;
      }
      case "integer": {
        const v = Number(inp.value);
        if (!Number.isInteger(v) || v < d.min || v > d.max) {
          return { error: `value must be an integer ${d.min}..${d.max}`, ok: false };
        }
        answer = { kind: "integer", value: v };
        break;
      }
      case "order": {
        const src = Array.isArray(inp.order) ? inp.order : Array.isArray(inp.keys) ? inp.keys : [];
        const keys = src.map(unalias);
        const valid = new Set(d.items.map((o) => o.key));
        const bad = keys.filter((k) => !valid.has(k));
        if (bad.length) {
          return { error: `unknown option(s) ${bad.join(", ")}`, ok: false };
        }
        answer = keys.length === 0 && d.defaultable ? { keys: [], kind: "order" } : { keys, kind: "order" };
        break;
      }
      case "distribute": {
        const keys = Array.isArray(inp.keys) ? inp.keys.map(unalias) : [];
        const k = keys[0];
        if (!k || !d.buckets.some((b) => b.key === k)) {
          if (d.defaultAllocation) {
            answer = { allocation: { ...d.defaultAllocation }, kind: "distribute" };
            break;
          }
          return { error: "name one option number in answer.keys", ok: false };
        }
        answer = { allocation: { [k]: d.total }, kind: "distribute" };
        break;
      }
      case "name": {
        const k = Array.isArray(inp.keys) ? String(inp.keys[0] ?? "") : "";
        if (!k) {
          return { error: "answer.keys needs one card name", ok: false };
        }
        answer = { kind: "name", name: k };
        break;
      }
      case "deck-arrange": {
        const src = Array.isArray(inp.order) ? inp.order : [];
        answer = { kind: "deck-arrange", recycle: [], top: src.map(unalias) };
        break;
      }
      default: {
        return { error: `cannot answer a ${d.kind} prompt`, ok: false };
      }
    }
    const outcome = resolvePendingAnswer(ctx, d, answer);
    if (outcome.type === "error") {
      return { error: outcome.error.message, ok: false };
    }
    const label = describeAnswer(session, d, answer);
    return { choice: { fallback: false, label, moves: [outcome.move], rationale }, ok: true };
  }

  /** Apply a choice through applySessionMove; false when the engine rejected it. */
  #apply(session: GameSession, choice: Choice): boolean {
    for (const m of choice.moves) {
      const r = applySessionMove(session, this.seat, m.moveId, { ...m.params });
      if (this.gameId) {
        if (r.success) {
          gameLogger.logMove(this.gameId, m.moveId, this.seat, { ...m.params }, { success: true });
        } else {
          gameLogger.logMoveRejected(this.gameId, m.moveId, this.seat, { ...m.params }, r.error ?? "unknown");
        }
      }
      if (!r.success) {
        console.log(`[ai] move rejected: ${m.moveId} — ${r.error ?? "unknown"}`);
        return false;
      }
    }
    if (choice.play) {
      // Re-match the intended play against the now-affordable legal list.
      const legal = buildAvailableMoves(session, this.seat) as FlatMove[];
      const want = choice.play;
      const same = (a: unknown, b: unknown) => canon(a ?? null) === canon(b ?? null);
      const match =
        legal.find((m) => sigOf(m) === sigOf(want)) ??
        legal.find((m) => m.moveId === want.moveId && m.params.cardId === want.params.cardId && same(m.params.location, want.params.location) && same(m.params.targets, want.params.targets) && same(m.params.destination, want.params.destination) && m.params.paidAdditionalCost !== true) ??
        legal.find((m) => m.moveId === want.moveId && m.params.cardId === want.params.cardId && m.params.paidAdditionalCost !== true);
      if (!match) {
        // rule 108.7.c — the play never happened, so that card is still in this
        // seat's HAND: only the seat itself may read which one it was.
        this.#log(
          session,
          `🤖 ${this.shortName}: paid for ${tag(session, String(want.params.cardId))} but the play is not available — will reconsider.`,
          `🤖 ${this.shortName}: paid for a card it could not play — will reconsider.`,
        );
        return true;
      }
      const r = applySessionMove(session, this.seat, match.moveId, { ...match.params });
      if (this.gameId) {
        gameLogger.logMove(this.gameId, match.moveId, this.seat, { ...match.params }, { success: r.success });
      }
      if (!r.success) {
        console.log(`[ai] play after payment rejected: ${match.moveId} — ${r.error ?? "unknown"}`);
        return false;
      }
    }
    return true;
  }

  /**
   * Pregame (Match, rule 486.5): pick the battlefield this seat contributes.
   * ONE model call bounded by `pregameTimeoutMs` (no retries — the human is
   * staring at "Waiting for opponent"); any failure / timeout / bad index
   * returns `{ error }` and the caller falls back to a seeded pick.
   */
  async pickBattlefield(session: GameSession, optionDefIds: readonly string[]): Promise<{ index: number; rationale: string } | { error: string }> {
    if (this.disabledReason) {
      return { error: this.disabledReason };
    }
    const key = this.#key();
    if (!key) {
      return { error: "no API key available" };
    }
    const human = session.players.find((p) => p !== this.seat) ?? "player-1";
    const legendLine = (seat: string): string => {
      const id = session.decks?.[seat]?.legendId;
      const def = id ? registry.get(id) : undefined;
      if (!def) {
        return "unknown";
      }
      const text = (def.rulesText ?? "").replace(/\s+/g, " ").trim();
      return `${def.name}${text ? ` — ${text.length > 200 ? `${text.slice(0, 199)}…` : text}` : ""}`;
    };
    const menu: MenuItem[] = optionDefIds.map((defId, index) => ({ index, kind: "move", label: defName(defId) ?? defId, moves: [], sig: `bf:${defId}` }));
    const lines = [
      "PREGAME — Best-of-3 match, rule 486.5: each player puts ONE of their three registered battlefields into play for this game (the other player contributes one of theirs). Choose the battlefield that best suits your deck and legend against this opponent.",
      `Your legend: ${legendLine(this.seat)}`,
      `Opponent's legend: ${legendLine(human)}`,
      "",
      "LEGAL ACTIONS (your three battlefields):",
      ...optionDefIds.map((defId, i) => {
        const def = registry.get(defId);
        const text = (def?.rulesText ?? "").replace(/\s+/g, " ").trim();
        return `[${i}] ${def?.name ?? defId}${text ? ` — ${text}` : ""}`;
      }),
      "",
      "Call choose with the index of the battlefield you contribute.",
    ];
    const req: ModelRequest = {
      max_tokens: 200,
      messages: [{ content: lines.join("\n"), role: "user" }],
      meta: { menu, seat: this.seat },
      model: this.modelId,
      system: systemPromptFor(session, this.seat, this.info.label),
      tool_choice: { name: CHOOSE_TOOL.name, type: "tool" },
      tools: [CHOOSE_TOOL],
    };
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_r, reject) => {
      timer = setTimeout(() => { ctrl.abort(); reject(new AiCallError("model call timed out", 0, true)); }, this.#opts.pregameTimeoutMs);
    });
    this.thinking = true;
    this.#pushStatus(session);
    try {
      const res = asResponse(await Promise.race([this.#callModel(req, { apiKey: key, signal: ctrl.signal }), timeout]));
      const use = res.toolUses.find((t) => t.name === CHOOSE_TOOL.name);
      const index = Number((use?.input as { index?: unknown } | undefined)?.index);
      if (!use || !Number.isInteger(index) || index < 0 || index >= optionDefIds.length) {
        return { error: "invalid choice from the model" };
      }
      const rationale = String((use.input as { rationale?: unknown }).rationale ?? "").slice(0, 140);
      return { index, rationale };
    } catch (error) {
      const e = error as AiCallError;
      console.log(`[ai] ${this.modelId} pregame call failed: ${this.#redact(e?.message ?? String(error))}`);
      return { error: ctrl.signal.aborted || /timed out/.test(e?.message ?? "") ? "model timed out" : "model call failed" };
    } finally {
      if (timer) {clearTimeout(timer);}
      this.thinking = false;
      this.#pushStatus(session);
    }
  }

  /**
   * Run the AI seat until the cursor leaves it. One loop per game at a time;
   * a trigger that arrives mid-loop schedules a re-check when the loop ends.
   */
  async act(session: GameSession): Promise<void> {
    if (this.busy) {
      this.#rerun = true;
      return;
    }
    this.busy = true;
    try {
      do {
        this.#rerun = false;
        await this.#segment(session);
      } while (this.#rerun && aiSeatMustAct(session, this.seat));
    } finally {
      this.busy = false;
      if (this.thinking) {
        this.thinking = false;
        this.#pushStatus(session);
      }
    }
  }

  async #segment(session: GameSession): Promise<void> {
    let actions = 0;
    let stuck = 0;
    while (aiSeatMustAct(session, this.seat) && Date.now() >= this.holdUntil) {
      const state = session.engine.getState();
      const epoch = rewindEpoch(session);
      if (state.turn.number !== this.#memoryTurn) {
        this.#memoryTurn = state.turn.number;
        this.#memory = [];
      }
      if (!this.thinking) {
        this.thinking = true;
        this.#pushStatus(session);
      }
      let choice: Choice | null | typeof STALE;
      if (actions >= this.#opts.maxActionsPerSegment) {
        const fb = goldfishFallbackMove(session, this.seat);
        choice = fb ? { fallback: true, label: fb.label, moves: [{ moveId: fb.moveId, params: fb.params, playerId: fb.playerId }], rationale: "action cap reached" } : null;
      } else {
        choice = await this.#decide(session, epoch);
      }
      // A Rewind/Redo landed while the model was thinking: the choice was made
      // for a position that no longer exists — drop it (never re-validate it
      // against the rewound state) and let the debounce timer re-arm the seat.
      if (choice === STALE || rewindEpoch(session) !== epoch || Date.now() < this.holdUntil) {
        this.staleDiscards++;
        console.log(`[ai] discarded a stale decision after a rewind (epoch ${epoch} → ${rewindEpoch(session)})`);
        if (Date.now() < this.holdUntil) {
          break;
        }
        continue;
      }
      if (!choice) {
        this.#log(session, `🤖 ${this.shortName} has no legal action — waiting.`);
        this.#push(session, "aiIdle");
        break;
      }
      const historyBefore = session.engine.getReplayHistory().length;
      const ok = this.#apply(session, choice);
      const line = `🤖 ${this.shortName}: ${choice.label}${choice.rationale ? ` — '${choice.rationale}'` : ""}${choice.fallback ? " (fallback)" : ""}`;
      if (ok) {
        this.#log(
          session,
          line,
          publicActionLine(session, [...choice.moves, ...(choice.play ? [choice.play] : [])], line),
        );
        this.#memory.push(`${choice.label}${choice.rationale ? ` — ${choice.rationale}` : ""}`);
        stuck = 0;
      } else {
        this.#memory.push(`${choice.label} — REJECTED by the engine; pick something else`);
        stuck++;
      }
      this.#finishIfOver(session, historyBefore);
      this.#push(session, choice.moves[choice.moves.length - 1]?.moveId ?? "ai");
      actions++;
      if (stuck >= 3) {
        // Even the Goldfish move failed: force the turn along or give up this segment.
        const fb = goldfishFallbackMove(session, this.seat);
        if (fb && applySessionMove(session, this.seat, fb.moveId, { ...fb.params }).success) {
          const fbLine = `🤖 ${this.shortName}: ${fb.label} (fallback)`;
          this.#log(session, fbLine, publicActionLine(session, [fb as FlatMove], fbLine));
          this.#push(session, fb.moveId);
          stuck = 0;
          continue;
        }
        this.#log(session, `🤖 ${this.shortName} is stuck — use Rewind or end the turn from the sandbox controls.`);
        this.#push(session, "aiStuck");
        break;
      }
      await sleep(this.#opts.pacingMs);
    }
  }

  #finishIfOver(session: GameSession, historyBefore: number): void {
    if (!this.gameId) {
      return;
    }
    const after = session.engine.getState();
    if (after.status === "finished" && session.engine.getReplayHistory().length > historyBefore) {
      const startTime = gameLogger.getGameStartTime(this.gameId);
      gameLogger.logStateChange(this.gameId, "playing", "finished");
      const scores = Object.fromEntries(Object.entries(after.players ?? {}).map(([pid, p]) => [pid, (p as { victoryPoints?: number }).victoryPoints ?? 0]));
      gameLogger.logGameCompleted(this.gameId, after.winner ?? after.turn.activePlayer ?? null, scores, session.engine.getReplayHistory().length, startTime ? Date.now() - startTime : 0);
      // Match flow: announce game_over / match_over (server/match.ts).
      noteGameState(session, this.gameId);
    }
  }
}

function describeAnswer(session: GameSession, d: Decision, a: Answer): string {
  // rule 128.3 / 424.1.a — this line lands in the shared session log and is
  // broadcast to every client, so a PRIVATE prompt (a look at a Secret zone —
  // a look is not a Reveal) may only name the ability that asked, never the
  // cards it looked at. The engine flags the prompt itself; the answer has not
  // been applied yet, so it is still the open one.
  const pendingPrivate =
    (session.engine.getState().pendingChoice as { private?: boolean } | undefined)?.private === true;
  if (pendingPrivate) {
    const what = a.kind === "decline" ? "declined" : "answered privately";
    return `${shortenRefs(session, d.prompt)} → ${what}`;
  }
  const optLabel = (key: string): string => {
    const opts = d.kind === "pick" ? d.options : d.kind === "order" ? d.items : d.kind === "distribute" ? d.buckets : [];
    return shortenRefs(session, opts.find((o) => o.key === key)?.label ?? key);
  };
  const prompt = shortenRefs(session, d.prompt);
  switch (a.kind) {
    case "pick": {
      return `${prompt} → ${a.keys.map(optLabel).join(", ")}`;
    }
    case "decline": {
      return `${prompt} → decline`;
    }
    case "yes-no": {
      return `${prompt} → ${a.value ? "yes" : "no"}`;
    }
    case "integer": {
      return `${prompt} → ${a.value}`;
    }
    case "order": {
      return `${prompt} → ${a.keys.length ? a.keys.map(optLabel).join(" then ") : "listed order"}`;
    }
    case "distribute": {
      return `${prompt} → ${Object.entries(a.allocation).map(([k, n]) => `${n} to ${optLabel(k)}`).join(", ")}`;
    }
    case "name": {
      return `${prompt} → ${a.name}`;
    }
    default: {
      return prompt;
    }
  }
}

// ---------------------------------------------------------------------------
// Dispatch from the move handlers
// ---------------------------------------------------------------------------

/**
 * Called after every applied human move (WebSocket + REST), after pregame
 * finalisation, and on reconnect: hands the opponent seat to its driver.
 * Goldfish → the synchronous policy loop in turn.ts; Claude → the async loop
 * above (fire-and-forget; one in flight per game).
 */
export function runOpponent(session: GameSession, opts: { humanSeat?: string; gameId?: string; goldfish?: boolean } = {}): void {
  // Goldfish — active (hot seat): no driver at all; the human answers for both seats.
  if (!session.sandbox || session.pregame || session.hotSeat) {
    return;
  }
  const ai = session.opponent;
  if (ai && ai.info.kind === "claude") {
    if (opts.gameId && ai instanceof ClaudeOpponent && !ai.gameId) {
      ai.gameId = opts.gameId;
    }
    void ai.act(session).catch((error) => {
      console.error(`[ai] loop crashed: ${redactKey((error as Error)?.message ?? String(error), envApiKey())}`);
    });
    return;
  }
  if (opts.goldfish === false) {
    return;
  }
  const human = opts.humanSeat ?? session.players[0];
  const goldfish = session.players.find((p) => p !== human);
  if (goldfish) {
    sandboxAutoPlay(session, goldfish);
  }
}

/** FNV-1a → an index in [0, n): a per-game deterministic pick that never touches the engine RNG (replays stay exact). */
function seededIndex(seedText: string, n: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return n > 0 ? h % n : 0;
}

/**
 * Pregame battlefield pick (Match, rule 486.5) for the sandbox bot seat.
 * Claude seat → one bounded model call (ClaudeOpponent.pickBattlefield); the
 * Goldfish, or any model failure/timeout → a pick seeded by the game seed.
 * Returns the definition id plus a shared-log line explaining who chose how.
 */
export async function chooseBotBattlefield(
  session: GameSession,
  seat: string,
  optionDefIds: readonly string[],
): Promise<{ defId: string; note: string; publicNote: string }> {
  const seeded = (): string => {
    const seed = `${session.engine.getRNG().getSeed()}|bf|${seat}|${optionDefIds.join(",")}`;
    return optionDefIds[seededIndex(seed, optionDefIds.length)] as string;
  };
  // rule 486.5 — the pick is simultaneous with the human's, so every note comes
  // in two wordings: the full one (kept on the bot's own seat until both are
  // locked, server/pregame.ts) and a `publicNote` that names no battlefield.
  const ai = session.opponent;
  if (ai instanceof ClaudeOpponent) {
    const r = await ai.pickBattlefield(session, optionDefIds);
    if ("index" in r) {
      const defId = optionDefIds[r.index] as string;
      return {
        defId,
        note: `🤖 ${ai.shortName} chose its battlefield: ${defName(defId) ?? defId}${r.rationale ? ` — '${r.rationale}'` : ""}`,
        publicNote: `🤖 ${ai.shortName} chose its battlefield.`,
      };
    }
    const defId = seeded();
    return {
      defId,
      note: `🤖 ${ai.shortName}: ${r.error} — battlefield picked at random (${defName(defId) ?? defId}).`,
      publicNote: `🤖 ${ai.shortName}: ${r.error} — battlefield picked at random.`,
    };
  }
  const defId = seeded();
  const fish = session.playerNames[seat] ?? "Goldfish";
  return {
    defId,
    note: `🐟 ${fish} picked a battlefield at random: ${defName(defId) ?? defId}.`,
    publicNote: `🐟 ${fish} picked a battlefield at random.`,
  };
}

const pendingTimers = new WeakMap<GameSession, ReturnType<typeof setTimeout>>();

/** Debounce before the Claude seat answers a rewound position (ms). Mutable so tests can shorten it. */
export const aiTiming = { rewindRearmMs: 3000 };

/**
 * Debounced re-arm for the Claude seat only (undo/redo can hand it the cursor
 * back). The Goldfish keeps its historical behaviour of acting on moves only.
 */
export function scheduleOpponent(session: GameSession, opts: { humanSeat?: string; gameId?: string } = {}, delayMs = aiTiming.rewindRearmMs): void {
  const ai = session.opponent;
  if (ai?.info.kind !== "claude") {
    return;
  }
  // Hold the seat for the debounce window even if its loop is mid-flight: a
  // decision that comes back inside the window is discarded, not applied.
  if (ai instanceof ClaudeOpponent) {
    ai.holdUntil = Date.now() + delayMs;
  }
  const prev = pendingTimers.get(session);
  if (prev) {
    clearTimeout(prev);
  }
  pendingTimers.set(
    session,
    setTimeout(() => {
      pendingTimers.delete(session);
      if (ai instanceof ClaudeOpponent) {
        ai.holdUntil = 0;
      }
      runOpponent(session, opts);
    }, delayMs),
  );
}


/** Install the driver for `spec` on a freshly created session (Goldfish → nothing to install). */
export function attachOpponent(session: GameSession, spec: OpponentSpec | undefined, opts: ClaudeOpponentOptions = {}): void {
  if (!spec || spec.kind !== "claude") {
    return;
  }
  session.opponent = createOpponent(spec, opts);
  const label = session.opponent?.info.label;
  if (label) {
    session.playerNames = { ...session.playerNames, "player-2": label };
  }
}

/** Public status for the client's opponent picker (no key material). */
export function aiStatus(): { envKey: boolean; mock: boolean; models: { key: ModelKey; label: string }[] } {
  return { envKey: Boolean(envApiKey()), mock: aiMockEnabled(), models: listModels() };
}
