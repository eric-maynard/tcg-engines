/**
 * riftjudge-engine-bridge — Stage 2 + Stage 3
 *
 * Stage 2: Scenario -> engine GameState + ordered engine moves.
 * Stage 3: apply the moves, capturing per-step state deltas + events.
 *
 * This module CONSUMES the engine — it never reimplements rules. It builds
 * state with the rules-audit helpers (createMinimalGameState/createCard/
 * createBattlefield) and drives behavior through real engine moves
 * (modifyBuff, addBuff, addDamage, killUnit, drawCard, resolveFullCombat).
 */

import {
  applyMove,
  createBattlefield,
  createCard,
  createMinimalGameState,
  dispatchEventWithMaintenanceForTest,
  getCardMeta,
  getCardOwner,
  getCardZone,
  getCardsInZone,
  getState,
  P1,
  P2,
  type AuditEngine,
} from "../../../../packages/riftbound-engine/src/__tests__/rules-audit/helpers";
import {
  computeEffectiveMight,
  getGlobalCardRegistry,
} from "../../../../packages/riftbound-engine/src/operations/card-lookup";
import { getCardRegistry } from "../../../../packages/riftbound-cards/src/data/all-cards";
import type {
  PrimitiveEffect,
  Scenario,
  ScenarioAction,
  Side,
  SpellCondition,
} from "./scenario-schema";
import { scenarioKind } from "./scenario-schema";
import { expandRulesDemo } from "./rules-demo";

// ---------------------------------------------------------------------------
// Side <-> engine PlayerId mapping
// ---------------------------------------------------------------------------

function pid(side: Side): string {
  return side === "me" ? P1 : P2;
}

function sideOf(playerId: string | undefined): Side | "?" {
  if (playerId === P1) {
    return "me";
  }
  if (playerId === P2) {
    return "opp";
  }
  return "?";
}

// ---------------------------------------------------------------------------
// Card-name -> definition lookup (against the real cards registry)
// ---------------------------------------------------------------------------

let _nameIndex: Map<string, ReturnType<typeof getCardRegistry> extends Map<string, infer V> ? V : never> | null = null;

function cardByName(name: string | undefined) {
  if (!name) {
    return undefined;
  }
  if (!_nameIndex) {
    _nameIndex = new Map();
    for (const c of getCardRegistry().values()) {
      const n = ((c as { name?: string }).name ?? "").toLowerCase();
      if (n && !_nameIndex.has(n)) {
        _nameIndex.set(n, c);
      }
    }
  }
  return _nameIndex.get(name.toLowerCase());
}

// ---------------------------------------------------------------------------
// Event log
// ---------------------------------------------------------------------------

export interface StepEvent {
  /** 1-based action index this event belongs to. */
  step: number;
  /** Short kind, e.g. "moveApplied", "moveFailed", "death", "buff", "combat",
   *  "spellFizzled", "conquer", "win". */
  kind: string;
  /** Human-readable detail. */
  detail: string;
  /** Optional structured payload. */
  data?: Record<string, unknown>;
}

export interface StepRecord {
  step: number;
  action: ScenarioAction;
  /** State summary after this step. */
  after: StateSummary;
  events: StepEvent[];
}

export interface UnitSummary {
  id: string;
  side: Side | "?";
  zone: string | undefined;
  printedMight: number;
  effectiveMight: number;
  damage: number;
  buffed: boolean;
  mightModifier: number;
  alive: boolean;
}

export interface BattlefieldSummary {
  id: string;
  controller: Side | "?" | null;
  contested: boolean;
}

export interface StateSummary {
  turnPlayer: Side | "?";
  phase: string;
  units: UnitSummary[];
  battlefields: BattlefieldSummary[];
  winner: Side | "?" | null;
  status: string;
}

// ---------------------------------------------------------------------------
// Build the GameState from the premise (Stage 2a)
// ---------------------------------------------------------------------------

export interface BuiltScenario {
  engine: AuditEngine;
  scenario: Scenario;
  /** Notes about anything synthesized (cards not in the set, etc.). */
  buildNotes: string[];
  /** map of premise unit id -> battlefield id it sits on (or "base"). */
  unitLocations: Record<string, string>;
}

function locationToZone(location: string | undefined): string {
  if (!location || location === "base") {
    return "base";
  }
  return `battlefield-${location}`;
}

export function buildScenario(scenario: Scenario): BuiltScenario {
  const buildNotes: string[] = [];
  const unitLocations: Record<string, string> = {};

  if (!scenario.premise) {
    throw new Error(
      "buildScenario requires scenario.premise — this Scenario has no board (it's a rules-question / out-of-engine-scope; route it to Track B instead).",
    );
  }
  const premise = scenario.premise;

  const engine = createMinimalGameState({
    phase: "main",
    currentPlayer: pid(premise.turnPlayer),
    // Give both players a generous pool so any spell-cost checks don't choke.
    runePools: {
      [P1]: { energy: 10, power: { fire: 5, mind: 5, order: 5, body: 5, calm: 5, chaos: 5 } },
      [P2]: { energy: 10, power: { fire: 5, mind: 5, order: 5, body: 5, calm: 5, chaos: 5 } },
    } as never,
  });

  // Battlefields first so units can be placed on them.
  for (const bf of premise.battlefields ?? []) {
    createBattlefield(engine, bf.id, {
      controller: bf.controller == null ? null : pid(bf.controller),
      contested: bf.contested ?? false,
      contestedBy: bf.contestedBy ? pid(bf.contestedBy) : undefined,
    });
  }

  // Units.
  for (const u of premise.units) {
    const def = cardByName(u.name);
    let keywords = u.keywords ?? [];
    if (u.name && !def) {
      buildNotes.push(
        `Card "${u.name}" not found in the cards registry — synthesized a stand-in unit with Might ${u.might}${keywords.length ? ` and keywords [${keywords.join(", ")}]` : ""}.`,
      );
    } else if (def) {
      // Prefer the real card's printed keywords when present.
      const dk = (def as { keywords?: string[] }).keywords;
      if (dk && dk.length && !u.keywords) {
        keywords = dk;
      }
    }
    const zone = locationToZone(u.location);
    unitLocations[u.id] = u.location ?? "base";
    if (zone !== "base" && !getState(engine).battlefields[u.location as string]) {
      throw new Error(
        `Unit "${u.id}" references battlefield "${u.location}" which is not declared in premise.battlefields.`,
      );
    }
    createCard(engine, u.id, {
      cardType: "unit",
      might: u.might,
      owner: pid(u.side),
      zone: zone as never,
      keywords,
      meta: {
        damage: u.damage ?? 0,
        buffed: (u.buffs ?? 0) > 0,
      },
    });
    // Extra buffs beyond the first are applied as moves later? No — just bake
    // them as mightModifier on the meta is wrong (buffed is a single flag).
    // The engine models multiple buffs via repeated addBuff at runtime; in the
    // premise we collapse "buffs" to the single `buffed` flag (1 buff). If the
    // author needs >1 buff, they should use addBuff actions.
    if ((u.buffs ?? 0) > 1) {
      buildNotes.push(
        `Unit "${u.id}" premise requested ${u.buffs} buffs; the engine's buff flag is binary, so only +1 Might was baked in. Use addBuff actions for more.`,
      );
    }
  }

  // Filler main-deck cards for each player so that `drawCard` actions draw
  // throwaway cards rather than reshuffling the trash back in (rule 607.2.a) and
  // pulling a just-trashed premise unit back into hand — an artifact of the
  // bridge starting from an otherwise-empty deck. Real games have full decks.
  for (const side of ["me", "opp"] as const) {
    for (let i = 0; i < 6; i++) {
      createCard(engine, `__filler_${side}_${i}`, {
        cardType: "spell",
        owner: pid(side),
        zone: "mainDeck" as never,
      });
    }
  }

  return { engine, scenario, buildNotes, unitLocations };
}

// ---------------------------------------------------------------------------
// State summary
// ---------------------------------------------------------------------------

export function summarize(built: BuiltScenario): StateSummary {
  const { engine, scenario } = built;
  const st = getState(engine);
  const registry = getGlobalCardRegistry();
  const units: UnitSummary[] = (scenario.premise?.units ?? []).map((u) => {
    const meta = getCardMeta(engine, u.id) ?? {};
    const zone = getCardZone(engine, u.id);
    const printed = registry.getMight(u.id);
    const effective = computeEffectiveMight(u.id, (cid) => getCardMeta(engine, cid as never) as never, registry);
    const alive = zone !== undefined && !String(zone).startsWith("trash") && zone !== "trash" && zone !== "banishment";
    return {
      id: u.id,
      side: sideOf(getState(engine) ? undefined : undefined) === "?" ? (u.side as Side) : (u.side as Side),
      zone: zone as string | undefined,
      printedMight: printed,
      effectiveMight: effective,
      damage: (meta as { damage?: number }).damage ?? 0,
      buffed: !!(meta as { buffed?: boolean }).buffed,
      mightModifier: (meta as { mightModifier?: number }).mightModifier ?? 0,
      alive,
    };
  });
  const battlefields: BattlefieldSummary[] = Object.values(st.battlefields ?? {}).map((b) => {
    const bf = b as { id: string; controller: string | null; contested: boolean };
    return {
      id: bf.id,
      controller: bf.controller == null ? null : sideOf(bf.controller),
      contested: !!bf.contested,
    };
  });
  return {
    turnPlayer: sideOf(st.turn.activePlayer),
    phase: String(st.turn.phase),
    units,
    battlefields,
    winner: st.winner ? sideOf(st.winner as string) : null,
    status: String(st.status),
  };
}

// ---------------------------------------------------------------------------
// Condition evaluation (Stage 3 helper for playSpell)
// ---------------------------------------------------------------------------

function effectiveMightOf(engine: AuditEngine, unitId: string): number {
  const registry = getGlobalCardRegistry();
  return computeEffectiveMight(unitId, (cid) => getCardMeta(engine, cid as never) as never, registry);
}

function isAlive(engine: AuditEngine, unitId: string): boolean {
  const zone = getCardZone(engine, unitId);
  return zone !== undefined && zone !== "trash" && zone !== "banishment";
}

function getCardOwnerSide(engine: AuditEngine, unitId: string): Side | undefined {
  const owner = getCardOwner(engine, unitId);
  if (owner === P1) {
    return "me";
  }
  if (owner === P2) {
    return "opp";
  }
  return undefined;
}

function evalCondition(engine: AuditEngine, cond: SpellCondition): { ok: boolean; why: string } {
  switch (cond.kind) {
    case "targetMighty": {
      const threshold = cond.threshold ?? 5;
      const m = effectiveMightOf(engine, cond.target);
      return {
        ok: m >= threshold,
        why: `${cond.target} effective Might is ${m}; "Mighty" requires >= ${threshold}`,
      };
    }
    case "targetAlive": {
      const a = isAlive(engine, cond.target);
      return { ok: a, why: `${cond.target} is ${a ? "still on the board" : "no longer on the board"}` };
    }
    case "targetMightCompare": {
      const m = effectiveMightOf(engine, cond.target);
      const ok =
        cond.op === ">=" ? m >= cond.value : cond.op === "<=" ? m <= cond.value : m === cond.value;
      return { ok, why: `${cond.target} effective Might is ${m}; condition needs Might ${cond.op} ${cond.value}` };
    }
  }
}

// ---------------------------------------------------------------------------
// Apply one primitive effect via the engine. Returns events.
// ---------------------------------------------------------------------------

function findBattlefieldId(scenario: Scenario, ref: string): string {
  const bf = (scenario.premise?.battlefields ?? []).find((b) => b.id === ref);
  if (!bf) {
    throw new Error(`Action references battlefield "${ref}" not in premise.battlefields.`);
  }
  return bf.id;
}

/** Unit-targeting primitives — for the "target already left the board" guard. */
const UNIT_TARGETING_PRIMITIVES = new Set([
  "modifyMight",
  "addBuff",
  "addDamage",
  "killUnit",
  "moveUnit",
  "exhaustUnit",
  "grantKeyword",
  "recallToBase",
  "replaceDeath",
]);

function applyPrimitive(
  built: BuiltScenario,
  step: number,
  eff: PrimitiveEffect,
): StepEvent[] {
  const { engine, scenario } = built;
  const events: StepEvent[] = [];
  const src = (eff as { source?: string }).source ? ` (from ${(eff as { source?: string }).source})` : "";

  // Illegal-target guard: a unit-targeting effect whose target already left the
  // board (e.g. it was killed earlier — as an additional cost — by the time a
  // later-resolving Reaction tries to touch it) does nothing. Rule: a target
  // that is no longer a valid game object is removed; if all targets are gone
  // the effect doesn't happen (rule 359 / illegal-target handling).
  if (UNIT_TARGETING_PRIMITIVES.has(eff.kind)) {
    const targetId = (eff as { target: string }).target;
    if (!isAlive(engine, targetId)) {
      events.push({
        step,
        kind: "illegalTarget",
        detail: `${targetId} is no longer on the board (it's in the trash) — ${eff.kind}${src} has no legal target, so it does nothing.`,
      });
      return events;
    }
  }

  switch (eff.kind) {
    case "modifyMight": {
      const before = effectiveMightOf(engine, eff.target);
      const aliveBefore = isAlive(engine, eff.target);
      const r = applyMove(engine, "modifyBuff", { cardId: eff.target, deltaMight: eff.delta });
      const aliveAfter = isAlive(engine, eff.target);
      // If the unit died here, its meta (incl. mightModifier) gets cleared on
      // the move to trash — so `after` would read its printed Might, which is
      // misleading. Report the *intended* new effective Might (before + delta,
      // floor 0 for display) and flag the death explicitly.
      const intendedAfter = Math.max(0, before + eff.delta);
      const displayedAfter = aliveAfter ? effectiveMightOf(engine, eff.target) : intendedAfter;
      events.push({
        step,
        kind: r.success ? "mightModified" : "moveFailed",
        detail: r.success
          ? `${eff.target}: effective Might ${before} -> ${displayedAfter} (${eff.delta >= 0 ? "+" : ""}${eff.delta} this turn)${src}`
          : `modifyBuff failed: ${r.error}`,
        data: { before, after: displayedAfter, delta: eff.delta },
      });
      if (aliveBefore && !aliveAfter) {
        events.push({
          step,
          kind: "death",
          detail: `${eff.target} died — its effective Might dropped to ${intendedAfter}, now ≤ its marked damage (lethal, rule 143.2.a).`,
        });
      }
      break;
    }
    case "addBuff": {
      const n = eff.count ?? 1;
      const aliveBefore = isAlive(engine, eff.target);
      for (let i = 0; i < n; i++) {
        applyMove(engine, "addBuff", { cardId: eff.target });
      }
      events.push({
        step,
        kind: "buff",
        detail: `${eff.target} gained ${n} buff counter${n === 1 ? "" : "s"} (+${n} Might)${src}`,
      });
      if (aliveBefore && !isAlive(engine, eff.target)) {
        events.push({ step, kind: "death", detail: `${eff.target} died after the buff change.` });
      }
      break;
    }
    case "addDamage": {
      const aliveBefore = isAlive(engine, eff.target);
      const r = applyMove(engine, "addDamage", { cardId: eff.target, amount: eff.amount });
      events.push({
        step,
        kind: r.success ? "damage" : "moveFailed",
        detail: r.success ? `${eff.target} took ${eff.amount} damage${src}` : `addDamage failed: ${r.error}`,
      });
      // Death from state-based check runs in post-move cleanup automatically.
      if (aliveBefore && !isAlive(engine, eff.target)) {
        events.push({ step, kind: "death", detail: `${eff.target} died (marked damage ≥ its Might — lethal, rule 143.2.a).` });
      }
      break;
    }
    case "killUnit": {
      const aliveBefore = isAlive(engine, eff.target);
      const r = applyMove(engine, "killUnit", { cardId: eff.target });
      const aliveAfter = isAlive(engine, eff.target);
      if (!r.success) {
        events.push({ step, kind: "moveFailed", detail: `killUnit failed: ${r.error}` });
      } else if (aliveBefore && !aliveAfter) {
        events.push({ step, kind: "death", detail: `${eff.target} was killed -> trash${src}` });
      } else {
        // The kill was intercepted by a "die"-replacement on the board — the
        // unit stays on the board (healed/exhausted/recalled). The cost (if
        // this was a cost) is still considered paid (rule 357.2.a).
        events.push({
          step,
          kind: "deathReplaced",
          detail: `${eff.target} would have been killed${src}, but a "die"-replacement on the board intercedes — instead of going to the trash it's healed, exhausted, and recalled to base. (A cost whose kill was replaced is still considered paid — rule 357.2.a.)`,
        });
      }
      break;
    }
    case "draw": {
      const n = eff.count ?? 1;
      applyMove(engine, "drawCard", { playerId: pid(eff.side), count: n });
      events.push({ step, kind: "draw", detail: `${eff.side === "me" ? "You" : "Opponent"} drew ${n} card${n === 1 ? "" : "s"}${src}` });
      break;
    }
    case "moveUnit": {
      const bfId = findBattlefieldId(scenario, eff.to);
      const owner = getCardOwnerSide(engine, eff.target);
      const r = applyMove(engine, "standardMove", {
        playerId: owner ? pid(owner) : undefined,
        destination: bfId,
        unitIds: [eff.target],
      });
      const zone = getCardZone(engine, eff.target);
      events.push({
        step,
        kind: r.success ? "move" : "moveFailed",
        detail: r.success
          ? `${eff.target} moved to ${eff.to} (now at ${zone}); a Standard Move exhausts it (rule 596.3.a)${src}`
          : `standardMove failed: ${r.error}`,
      });
      break;
    }
    case "exhaustUnit": {
      const r = applyMove(engine, "exhaustCard", { cardId: eff.target });
      events.push({
        step,
        kind: r.success ? "exhaust" : "moveFailed",
        detail: r.success ? `${eff.target} was exhausted${src}` : `exhaustCard failed: ${r.error}`,
      });
      break;
    }
    case "grantKeyword": {
      // The engine's `grant-keyword` effect appends a `{keyword,duration,value}`
      // entry to the unit's `grantedKeywords` meta. We do the same write through
      // engine internal state (the rules-audit helpers expose no meta mutator),
      // matching the `forceContested` internal-mutation pattern. After the write
      // the engine honors the keyword everywhere it checks keywords (combat
      // damage assignment, [Assault N]/[Shield N] combat Might, static recalc).
      const duration = eff.duration ?? "turn";
      grantKeywordInternal(engine, eff.target, eff.keyword, eff.value, duration);
      events.push({
        step,
        kind: "grantKeyword",
        detail: `${eff.target} gained [${eff.keyword}${eff.value !== undefined ? ` ${eff.value}` : ""}]${duration === "permanent" ? " (permanent)" : duration === "combat" ? " (this combat)" : " (until end of turn)"}${src}`,
      });
      break;
    }
    case "recallToBase": {
      // Recalls are engine-internal (the `recallUnit` move is condition-gated to
      // never appear as a player move — recalls happen only as consequences of
      // game effects, rules 616-619), so invoke the reducer directly. A recall
      // to base is NOT a Standard Move: it doesn't exhaust and doesn't fire
      // move-triggers. A unit recalled out of a Combat Showdown leaves the
      // combat (it's no longer at the battlefield).
      const owner = getCardOwnerSide(engine, eff.target);
      const fromZone = getCardZone(engine, eff.target);
      const r = applyMoveUnchecked(engine, "recallUnit", {
        playerId: owner ? pid(owner) : undefined,
        unitId: eff.target,
      });
      const toZone = getCardZone(engine, eff.target);
      events.push({
        step,
        kind: r.success ? "recall" : "moveFailed",
        detail: r.success
          ? `${eff.target} was recalled to base (${fromZone} → ${toZone}); a recall is not a Move — it doesn't exhaust and the unit leaves any combat it was in${src}`
          : `recallUnit failed: ${r.error}`,
      });
      break;
    }
    case "replaceDeath": {
      // Give the unit a "die"-replacement ability — what an "instead of dying…"
      // card text (Zhonya's Hourglass / Tactical Retreat / Guardian Angel /
      // Sett's legend) does. We re-register the unit's card definition in the
      // global registry with a `{type:"replacement", replaces:"die", …}` entry
      // appended; the engine's state-based death check + the `killUnit`/`kill`
      // move/effect then consult `checkReplacement({type:"die"})` and skip the
      // trash move (the engine doesn't yet run the replacement's own heal/
      // exhaust/recall body — it just keeps the unit on the board). A `"next"`
      // replacement is consumed after firing once.
      const scope = eff.scope ?? "next";
      const mode = eff.mode ?? "recall";
      const duration = scope === "permanent" ? "static" : scope;
      addDieReplacementInternal(engine, eff.target, duration, mode);
      events.push({
        step,
        kind: "replaceDeath",
        detail: `${eff.target} now has a "die"-replacement (${
          mode === "prevent" ? "its death is prevented" : "instead of dying it's healed, exhausted, and recalled to base"
        }${duration === "next" ? "; fires once then is consumed" : duration === "turn" ? "; this turn" : "; always-on"})${src}. A "kill" cost on it is still considered paid (rule 357.2.a); a unit saved this way never enters the trash, so its [Deathknell] won't fire (rule 808.1.d.1).`,
      });
      break;
    }
    case "playCard": {
      const def = cardByName(eff.name);
      if (!def) {
        events.push({
          step,
          kind: "playFailed",
          detail: `playCard: card "${eff.name}" not found in the cards registry — action is a no-op.`,
        });
        break;
      }
      const cardType = ((def as { cardType?: string }).cardType ?? "unit") as string;
      const ownerPid = pid(eff.side);
      // Destination zone — default by card type. Spells resolve straight into
      // trash (we don't model the chain stack for the spell body itself here;
      // a `playSpell` action with `effects` is the path for spell-effect bodies).
      let destZone: string;
      if (eff.to) {
        if (eff.to === "base" || eff.to === "trash" || eff.to === "hand") {
          destZone = eff.to;
        } else {
          // Treat as a battlefield id from the premise.
          const bfId = findBattlefieldId(scenario, eff.to);
          destZone = `battlefield-${bfId}`;
        }
      } else {
        destZone = cardType === "spell" ? "trash" : "base";
      }
      // Register the card definition WITH its parsed abilities + keywords +
      // type + costs preserved, and place an instance in the destination zone.
      // This is the lever: subsequent triggers fan out over `def.abilities`
      // via the engine's listener registry, so any "when you play me / play a
      // card / when I'm played" listener fires through normal machinery.
      const abilities = (def as { abilities?: unknown[] }).abilities ?? [];
      const keywords = ((def as { keywords?: string[] }).keywords ?? []) as string[];
      const might = (def as { might?: number }).might;
      const energyCost = (def as { energyCost?: number }).energyCost;
      const powerCost = (def as { powerCost?: string[] }).powerCost;
      const domain = (def as { domain?: string | string[] }).domain;
      createCard(engine, eff.instanceId, {
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
      // Bump cardsPlayedThisTurn (rule 555 / 724) — the engine's main play
      // reducers do this; we mirror it so Legion / "if you've played another
      // card" listeners fire correctly across multiple plays in one scenario.
      const internal = asInternalView(engine);
      const st = (engine as unknown as { currentState: { cardsPlayedThisTurn?: Record<string, number> } }).currentState;
      if (st && st.cardsPlayedThisTurn) {
        st.cardsPlayedThisTurn[ownerPid] = (st.cardsPlayedThisTurn[ownerPid] ?? 0) + 1;
      }
      void internal;
      // Dispatch the play events through the event bus (the listener registry
      // polls every live card's parsed abilities for matching triggers and
      // queues them onto the chain in turn/APNAP order).
      const playSelfFired = dispatchEventWithMaintenanceForTest(engine, {
        cardId: eff.instanceId,
        playerId: ownerPid,
        type: "play-self",
      });
      const playCardFired = dispatchEventWithMaintenanceForTest(engine, {
        cardId: eff.instanceId,
        cardType,
        playerId: ownerPid,
        type: "play-card",
      });
      if (cardType === "spell") {
        dispatchEventWithMaintenanceForTest(engine, {
          cardId: eff.instanceId,
          playerId: ownerPid,
          type: "play-spell",
        });
      }
      const totalFired = playSelfFired + playCardFired;
      events.push({
        step,
        kind: "playCard",
        detail: `${eff.side === "me" ? "You" : "The opponent"} played "${(def as { name?: string }).name ?? eff.name}" [${(def as { id?: string }).id}] as ${eff.instanceId} → ${destZone}. ${
          totalFired > 0
            ? `${totalFired} listener(s) fired through the event bus (parsed abilities subscribing to play-self/play-card).`
            : `No listeners fired — no card subscribed to the play events.`
        }`,
        data: {
          listenersFired: totalFired,
          cardType,
          zone: destZone,
          abilityCount: abilities.length,
        },
      });
      break;
    }
    case "resolveCombat": {
      const bfId = findBattlefieldId(scenario, eff.battlefield);
      // Force the battlefield contested with the given attacker so
      // resolveFullCombat's gate is satisfied. We do this by mutating state via
      // a re-create of the battlefield entry with contested=true.
      forceContested(engine, bfId, pid(eff.attacker));
      const beforeUnits = unitsAtBf(engine, scenario, eff.battlefield);
      const r = applyMove(engine, "resolveFullCombat", { battlefieldId: bfId });
      const afterUnits = unitsAtBf(engine, scenario, eff.battlefield);
      const st = getState(engine);
      const bf = (st.battlefields as Record<string, { controller: string | null }>)[bfId];
      const survivors = afterUnits.filter((u) => isAlive(engine, u));
      const killed = beforeUnits.filter((u) => !isAlive(engine, u));
      events.push({
        step,
        kind: r.success ? "combat" : "moveFailed",
        detail: r.success
          ? `Combat at ${eff.battlefield}: attacker=${eff.attacker}. Killed: [${killed.join(", ") || "none"}]. Survivors: [${survivors.join(", ") || "none"}].`
          : `resolveFullCombat failed: ${r.error}`,
        data: { killed, survivors },
      });
      for (const k of killed) {
        events.push({ step, kind: "death", detail: `${k} died in combat.` });
      }
      if (bf?.controller) {
        events.push({
          step,
          kind: "conquer",
          detail: `Battlefield ${eff.battlefield} is now controlled by ${sideOf(bf.controller)}.`,
        });
      } else {
        events.push({ step, kind: "combatResult", detail: `Battlefield ${eff.battlefield} is uncontrolled / no result.` });
      }
      if (st.winner) {
        events.push({ step, kind: "win", detail: `${sideOf(st.winner as string)} wins the game.` });
      }
      break;
    }
  }
  return events;
}

function unitsAtBf(engine: AuditEngine, scenario: Scenario, bfRef: string): string[] {
  // Premise units whose location is this battlefield AND that are still there.
  return (scenario.premise?.units ?? []).filter((u) => (u.location ?? "base") === bfRef).map((u) => u.id);
}

/** Internal view of the engine's mutable working state (mirrors the rules-audit
 *  helpers' narrow cast — `getCardZone`/`getCardMeta`/`createCard` all read &
 *  write `internalState`). */
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

/** Append a granted-keyword entry to a unit's `grantedKeywords` meta — exactly
 *  what the engine's `grant-keyword` effect handler does. */
function grantKeywordInternal(
  engine: AuditEngine,
  cardId: string,
  keyword: string,
  value: number | undefined,
  duration: "turn" | "permanent" | "combat",
): void {
  const meta = asInternalView(engine).internalState.cardMetas[cardId];
  if (!meta) {
    return;
  }
  const existing = (meta.grantedKeywords as { keyword: string; duration?: string; value?: number }[] | undefined) ?? [];
  const entry: { keyword: string; duration: string; value?: number } = { keyword, duration };
  if (value !== undefined) {
    entry.value = value;
  }
  meta.grantedKeywords = [...existing, entry];
}

/** Append a `{type:"replacement", replaces:"die", …}` ability to a unit's card
 *  definition in the global registry — what an "instead of dying…" card text
 *  does. The engine's death checks (`state-based-checks`, the `killUnit` move,
 *  the `kill` effect) consult `checkReplacement({type:"die"})` and, when one
 *  matches, skip the trash move (keep the unit on the board) and consume
 *  single-fire `"next"`-duration replacements. `mode` is recorded as the
 *  `replacement` payload ("recall" → a non-"prevent" payload the engine treats
 *  the same as "prevent" for now; "prevent" → the literal "prevent" sentinel). */
function addDieReplacementInternal(
  engine: AuditEngine,
  cardId: string,
  duration: "next" | "turn" | "static",
  mode: "recall" | "prevent",
): void {
  const registry = getGlobalCardRegistry();
  const def = registry.get(cardId);
  if (!def) {
    return;
  }
  const replacement =
    mode === "prevent"
      ? "prevent"
      : { type: "recall", target: { type: "self" } };
  const ability = {
    duration,
    replacement,
    replaces: "die" as const,
    target: { controller: "friendly" as const, type: "unit" as const },
    type: "replacement" as const,
  };
  const existingAbilities = (def.abilities ?? []) as unknown[];
  registry.register(cardId, {
    ...def,
    abilities: [...existingAbilities, ability] as never,
  });
}

/** Recall a unit to its owner's base — what the engine's `recallUnit` reducer
 *  does (`zones.moveCard` to the shared "base" zone). Not a Move: doesn't
 *  exhaust, doesn't fire move-triggers. Returns `{success}` like `applyMove`. */
function applyMoveUnchecked(
  engine: AuditEngine,
  moveId: string,
  params: Record<string, unknown>,
): { success: boolean; error?: string } {
  if (moveId !== "recallUnit") {
    // Only `recallUnit` is currently routed this way; fall back to the normal
    // (condition-checked) path for anything else.
    return applyMove(engine, moveId, params);
  }
  const cardId = String(params.unitId);
  const internal = asInternalView(engine).internalState;
  const card = internal.cards[cardId];
  if (!card) {
    return { success: false, error: `unit ${cardId} not found` };
  }
  const fromZoneId = card.zone;
  const fromZone = internal.zones[fromZoneId];
  if (fromZone) {
    fromZone.cardIds = fromZone.cardIds.filter((id) => id !== cardId);
  }
  const baseZone = internal.zones["base"];
  if (!baseZone) {
    return { success: false, error: `no "base" zone on the engine` };
  }
  baseZone.cardIds.push(cardId);
  card.zone = "base";
  // A recall clears combat role + exhaust (the unit leaves any combat); keep
  // other meta (recall is not a zone-clearing move out of play).
  const meta = internal.cardMetas[cardId];
  if (meta) {
    meta.combatRole = null;
  }
  return { success: true };
}

function forceContested(engine: AuditEngine, bfId: string, attackerPid: string): void {
  // Reach into engine internal state the same way the rules-audit helpers do.
  const internal = engine as unknown as { currentState: { battlefields: Record<string, unknown> } };
  const cloned = structuredClone(internal.currentState);
  const bf = (cloned.battlefields as Record<string, { contested: boolean; contestedBy?: string; controller: string | null }>)[bfId];
  if (bf) {
    bf.contested = true;
    bf.contestedBy = attackerPid;
  }
  internal.currentState = cloned as never;
  (engine.getFlowManager?.() as { syncState?: (s: unknown) => void } | undefined)?.syncState?.(cloned);
}

// ---------------------------------------------------------------------------
// Run the whole scenario (Stage 3)
// ---------------------------------------------------------------------------

export interface RunResult {
  built: BuiltScenario;
  initialState: StateSummary;
  steps: StepRecord[];
  finalState: StateSummary;
  /** Flat list of all events. */
  allEvents: StepEvent[];
  /** Engine-derived move list (for display): one line per action. */
  moveLog: string[];
}

export function runScenario(scenario: Scenario): RunResult {
  // A `rules-demo` Scenario has no board of its own — expand it into a concrete
  // `engine-scenario` that demonstrates the rule, then run that.
  if (scenarioKind(scenario) === "rules-demo") {
    scenario = expandRulesDemo(scenario);
  }
  const built = buildScenario(scenario);
  const initialState = summarize(built);
  const steps: StepRecord[] = [];
  const moveLog: string[] = [];

  // --- Pre-pre-pass: top-level `replaceDeath` actions are SETUP ---
  // A `replaceDeath` listed as a top-level action represents a pre-existing
  // "instead of dying…" protection (e.g. "a unit already targeted by Tactical
  // Retreat earlier this turn"). It must be in place BEFORE any cost is paid or
  // any later action resolves, so we apply top-level `replaceDeath` actions
  // first (in listed order). (A `replaceDeath` *inside* a `playSpell`'s
  // `effects` — Tactical Retreat cast as a Reaction in this very chain — runs
  // when that spell resolves, in the normal action loop.)
  const replaceDeathSetup = (scenario.actions ?? []).filter(
    (a): a is Extract<ScenarioAction, { kind: "replaceDeath" }> => a.kind === "replaceDeath",
  );
  const setupEvents: StepEvent[] = [];
  for (const rd of replaceDeathSetup) {
    setupEvents.push(...applyPrimitive(built, 0, rd));
  }
  if (setupEvents.length) {
    steps.push({
      step: 0,
      action: { kind: "killUnit", target: "(pre-existing die-replacement setup)" } as ScenarioAction,
      after: summarize(built),
      events: setupEvents,
    });
  }

  // --- Pre-pass: additional costs (paid at PLAY time, before the chain) ---
  // Actions are listed in LIFO resolution order (last-played reaction first);
  // play order is the reverse. Costs are paid when each spell is *played*, so we
  // apply every spell's `additionalCosts` here, in play order, before resolving
  // any action. This makes a later-resolving Reaction unable to undo a cost that
  // was already paid (rule 357 / RiftJudge FAQ #9906 — costs precede the chain).
  const spellActionsInResolutionOrder = (scenario.actions ?? []).filter(
    (a): a is Extract<ScenarioAction, { kind: "playSpell" }> => a.kind === "playSpell",
  );
  const spellActionsInPlayOrder = [...spellActionsInResolutionOrder].reverse();
  const preEvents: StepEvent[] = [];
  for (const sp of spellActionsInPlayOrder) {
    if (!sp.additionalCosts || sp.additionalCosts.length === 0) {
      continue;
    }
    preEvents.push({
      step: 0,
      kind: "costPaid",
      detail: `"${sp.name}" (played by ${sp.side === "me" ? "you" : "the opponent"}) pays its additional cost(s) as it is played — before it goes on the chain, so no Reaction can be played in between (rule 357).`,
    });
    for (const eff of sp.additionalCosts) {
      preEvents.push(...applyPrimitive(built, 0, eff));
    }
  }
  if (preEvents.length) {
    steps.push({
      step: 0,
      action: { kind: "killUnit", target: "(additional-cost pre-pass)" } as ScenarioAction,
      after: summarize(built),
      events: preEvents,
    });
  }

  (scenario.actions ?? []).forEach((action, idx) => {
    const step = idx + 1;
    const events: StepEvent[] = [];

    // Top-level `replaceDeath` actions were already applied in the setup
    // pre-pre-pass (they model pre-existing protection); record a placeholder
    // step here so step numbering stays aligned with the action list.
    if (action.kind === "replaceDeath") {
      moveLog.push(`${step}. ${describePrimitive(action)} — applied as pre-existing setup (see step 0)`);
      steps.push({
        step,
        action,
        after: summarize(built),
        events: [{ step, kind: "replaceDeathSetup", detail: `(this die-replacement was applied before the action sequence — see step 0)` }],
      });
      return;
    }

    if (action.kind === "playSpell") {
      const def = cardByName(action.name);
      moveLog.push(
        `${step}. playSpell "${action.name}"${def ? ` [${(def as { id?: string }).id}]` : " [stand-in]"} by ${action.side}` +
          (action.condition ? ` — gated on ${action.condition.kind}` : ""),
      );
      if (!def) {
        built.buildNotes.push(`Spell "${action.name}" not in cards registry — treated as a generic spell whose listed effects are applied directly.`);
      }
      if (action.condition) {
        const { ok, why } = evalCondition(built.engine, action.condition);
        events.push({
          step,
          kind: ok ? "spellConditionMet" : "spellFizzled",
          detail: ok ? `"${action.name}" precondition met: ${why}.` : `"${action.name}" fizzled: precondition not met — ${why}. None of its effects happen.`,
        });
        if (!ok) {
          steps.push({ step, action, after: summarize(built), events });
          return;
        }
      }
      for (const eff of action.effects) {
        events.push(...applyPrimitive(built, step, eff));
      }
    } else {
      moveLog.push(`${step}. ${describePrimitive(action)}`);
      events.push(...applyPrimitive(built, step, action));
    }

    steps.push({ step, action, after: summarize(built), events });
  });

  const finalState = summarize(built);
  return {
    built,
    initialState,
    steps,
    finalState,
    allEvents: steps.flatMap((s) => s.events),
    moveLog,
  };
}

function describePrimitive(eff: PrimitiveEffect): string {
  switch (eff.kind) {
    case "modifyMight":
      return `modifyMight ${eff.target} ${eff.delta >= 0 ? "+" : ""}${eff.delta}${eff.source ? ` (${eff.source})` : ""}`;
    case "addBuff":
      return `addBuff ${eff.target} x${eff.count ?? 1}`;
    case "addDamage":
      return `addDamage ${eff.target} ${eff.amount}`;
    case "killUnit":
      return `killUnit ${eff.target}`;
    case "draw":
      return `draw ${eff.side} ${eff.count ?? 1}`;
    case "moveUnit":
      return `moveUnit ${eff.target} -> @${eff.to}${eff.source ? ` (${eff.source})` : ""}`;
    case "exhaustUnit":
      return `exhaustUnit ${eff.target}${eff.source ? ` (${eff.source})` : ""}`;
    case "grantKeyword":
      return `grantKeyword ${eff.target} +[${eff.keyword}${eff.value !== undefined ? ` ${eff.value}` : ""}]${eff.source ? ` (${eff.source})` : ""}`;
    case "recallToBase":
      return `recallToBase ${eff.target}${eff.source ? ` (${eff.source})` : ""}`;
    case "replaceDeath":
      return `replaceDeath ${eff.target} [${eff.mode ?? "recall"}, ${eff.scope ?? "next"}]${eff.source ? ` (${eff.source})` : ""}`;
    case "playCard":
      return `playCard "${eff.name}" as ${eff.instanceId} by ${eff.side}${eff.to ? ` -> ${eff.to}` : ""}`;
    case "resolveCombat":
      return `resolveCombat @${eff.battlefield} (attacker=${eff.attacker})`;
  }
}
