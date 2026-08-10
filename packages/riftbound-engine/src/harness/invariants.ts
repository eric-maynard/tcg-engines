/**
 * Invariants: cheap oracles evaluated after every harness step.
 *
 * An invariant sees the previous and current full snapshots plus the step
 * that connected them and returns human-readable violation strings.
 */

import type { PlayerId } from "@tcg/core";
import { getGlobalCardRegistry } from "../operations/card-lookup";
import { getActingSeat, getPendingChoiceChooser } from "../views/acting-seat";
import { isTokenInstance } from "./card-state";
import type { FullSnapshot, HarnessEngine } from "./internal";
import type { ExecutedMove } from "./types";

export interface StepInfo {
  readonly seq: number;
  readonly executed: readonly ExecutedMove[];
}

export interface InvariantContext {
  readonly prev: FullSnapshot | null;
  readonly cur: FullSnapshot;
  readonly step?: StepInfo;
  readonly engine: HarnessEngine;
}

export interface Invariant {
  readonly name: string;
  check(ctx: InvariantContext): string[];
}

/** Moves that express "it is my decision" (as opposed to free rune adds / concede). */
const PRIORITY_CLASS = new Set([
  "playUnit",
  "playSpell",
  "playGear",
  "playFromChampionZone",
  "playFromZone",
  "activateAbility",
  "standardMove",
  "gankingMove",
  "hideCard",
  "revealHidden",
  "passChainPriority",
  "passShowdownFocus",
  "resolvePendingChoice",
  "endTurn",
]);

export const energyNonNegative: Invariant = {
  check: ({ cur }) => {
    const out: string[] = [];
    for (const [pid, pool] of Object.entries(cur.state.runePools ?? {})) {
      if (pool.energy < 0) {
        out.push(`${pid} energy ${pool.energy} < 0`);
      }
      for (const [d, n] of Object.entries(pool.power ?? {})) {
        if ((n ?? 0) < 0) {
          out.push(`${pid} power.${d} ${n} < 0`);
        }
      }
    }
    return out;
  },
  name: "energyNonNegative",
};

export const cardConservation: Invariant = {
  check: ({ prev, cur }) => {
    const out: string[] = [];
    // Zone membership ↔ cards[id].zone agreement, and single membership.
    const seenIn = new Map<string, string>();
    for (const [zoneId, ids] of Object.entries(cur.zones)) {
      for (const id of ids) {
        const other = seenIn.get(id);
        if (other && other !== zoneId) {
          out.push(`${id} listed in both ${other} and ${zoneId}`);
        }
        seenIn.set(id, zoneId);
        const inst = cur.cards[id];
        if (!inst) {
          out.push(`${id} in zone ${zoneId} but missing from cards`);
        } else if (inst.zone !== zoneId) {
          out.push(`${id} in zone ${zoneId} but cards[].zone=${inst.zone}`);
        }
      }
    }
    for (const [id, inst] of Object.entries(cur.cards)) {
      if (!seenIn.has(id)) {
        out.push(`${id} (cards[].zone=${inst.zone}) is in no zone list`);
      }
    }
    if (prev) {
      for (const id of Object.keys(prev.cards)) {
        if (!cur.cards[id] && !isTokenInstance(id, prev.cards[id]?.definitionId)) {
          out.push(`${id} vanished`);
        }
      }
      for (const id of Object.keys(cur.cards)) {
        if (!prev.cards[id] && !isTokenInstance(id, cur.cards[id]?.definitionId)) {
          out.push(`${id} appeared from nowhere`);
        }
      }
    }
    return out;
  },
  name: "cardConservation",
};

export const pendingChoiceGatesMoves: Invariant = {
  check: ({ cur, engine }) => {
    const pc = cur.state.pendingChoice;
    if (!pc || cur.state.status !== "playing") {
      return [];
    }
    const chooser = getPendingChoiceChooser(pc);
    const out: string[] = [];
    for (const pid of Object.keys(cur.state.players)) {
      const legal = engine.enumerateMoves(pid as PlayerId, { validOnly: true });
      for (const m of legal) {
        if (m.moveId === "concede") {
          continue;
        }
        // rule 444.2.c / 429.3 — the Pay window an `opt-in` prompt opens for
        // its own player keeps that player's rune Add abilities usable
        // (`resources.ts runeAddAllowedDuringChoice`); not a gating violation.
        // rule 419.2.a — the same holds for a `reveal-and-pick` that PLAYS the
        // picked card: accepting it pays that card's remaining cost.
        const payWindow =
          pc.type === "opt-in" ||
          (pc.type === "reveal-and-pick" && (pc as { onPicked?: string }).onPicked === "play");
        if ((m.moveId === "exhaustRune" || m.moveId === "recycleRune") && payWindow && pid === chooser) {
          continue;
        }
        if (m.moveId !== "resolvePendingChoice") {
          out.push(`${pid} may ${m.moveId} while a ${pc.type} choice is pending`);
        } else if (pid !== chooser) {
          out.push(`${pid} may resolvePendingChoice but chooser is ${chooser}`);
        }
      }
    }
    return out;
  },
  name: "pendingChoiceGatesMoves",
};

export const singleDecisionCursor: Invariant = {
  check: ({ cur, engine }) => {
    if (cur.state.status !== "playing") {
      return [];
    }
    const holders: string[] = [];
    // rule 383.3.d — the soft trigger-order offer keeps `resolvePendingChoice`
    // legal for its chooser beside the real cursor; it is not a second cursor.
    const softOrderOnly = !cur.state.pendingChoice && cur.state.pendingTriggerOrder !== undefined;
    for (const pid of Object.keys(cur.state.players)) {
      const legal = engine.enumerateMoves(pid as PlayerId, { validOnly: true });
      if (
        legal.some(
          (m) => PRIORITY_CLASS.has(m.moveId) && !(softOrderOnly && m.moveId === "resolvePendingChoice"),
        )
      ) {
        holders.push(pid);
      }
    }
    const acting = getActingSeat(cur.state);
    // Ambush units (reaction-timed) may legitimately give a second seat a play; tolerate ≤1 mismatch only when nobody holds.
    if (holders.length > 1) {
      return [`priority-class moves legal for ${holders.join(", ")} (acting seat ${acting})`];
    }
    if (holders.length === 1 && holders[0] !== acting) {
      return [`priority-class moves legal for ${holders[0]} but acting seat is ${acting}`];
    }
    return [];
  },
  name: "singleDecisionCursor",
};

export const noOrphanChain: Invariant = {
  check: ({ cur }) => {
    const chain = cur.state.interaction?.chain;
    if (chain?.active && chain.items.length === 0) {
      return ["chain.active with no items"];
    }
    return [];
  },
  name: "noOrphanChain",
};

export const costPaid: Invariant = {
  check: ({ prev, cur, step }) => {
    if (!prev || !step) {
      return [];
    }
    const out: string[] = [];
    const registry = getGlobalCardRegistry();
    for (const ex of step.executed) {
      if (!/^play(Unit|Spell|Gear)$/.test(ex.moveId)) {
        continue;
      }
      const cardId = ex.params.cardId as string | undefined;
      if (!cardId) {
        continue;
      }
      const meta = prev.metas[cardId] as { costModifier?: number } | undefined;
      if (meta?.costModifier) {
        continue;
      }
      if (ex.params.viaFlow === true || ex.params.chosenTargetId !== undefined) {
        continue;
      }
      // rule-id: ogn-014-298 — a card whose OWN static scales its Energy cost
      // ("reduced by the highest Might among units you control") legitimately
      // pays less than the printed cost; the invariant cannot recompute it.
      const selfScales = (
        (registry.getAbilities(cardId) ?? []) as readonly {
          type?: string;
          effect?: { type?: string };
        }[]
      ).some(
        (a) =>
          a.type === "static" &&
          (a.effect?.type === "cost-reduction" || a.effect?.type === "cost-increase"),
      );
      if (selfScales) {
        continue;
      }
      const def = registry.get(cardId);
      const before = prev.state.runePools[ex.seat];
      const after = cur.state.runePools[ex.seat];
      if (!def || !before || !after) {
        continue;
      }
      const cost = def.energyCost ?? 0;
      if (cost > 0 && before.energy - after.energy < cost && step.executed.length === 1) {
        out.push(`${ex.moveId} ${def.name}: energy cost ${cost} but pool ${before.energy}→${after.energy}`);
      }
    }
    return out;
  },
  name: "costPaid",
};

export const DEFAULT_INVARIANTS: readonly Invariant[] = [
  energyNonNegative,
  cardConservation,
  pendingChoiceGatesMoves,
  singleDecisionCursor,
  noOrphanChain,
  costPaid,
];

export function runInvariants(invariants: readonly Invariant[], ctx: InvariantContext): { invariant: string; message: string }[] {
  const out: { invariant: string; message: string }[] = [];
  for (const inv of invariants) {
    let messages: string[];
    try {
      messages = inv.check(ctx);
    } catch (error) {
      messages = [`invariant threw: ${error instanceof Error ? error.message : String(error)}`];
    }
    for (const message of messages) {
      out.push({ invariant: inv.name, message });
    }
  }
  return out;
}
