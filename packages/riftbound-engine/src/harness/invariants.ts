/**
 * Invariants: cheap oracles evaluated after every harness step.
 *
 * An invariant sees the previous and current full snapshots plus the step
 * that connected them and returns human-readable violation strings.
 */

import type { PlayerId } from "@tcg/core";
import { isPaymentPromptFor } from "../game-definition/moves/chain/activate-ability";
import { promptPayableCost } from "../game-definition/moves/prompt-cost";
import { getGlobalCardRegistry } from "../operations/card-lookup";
import type { PendingChoice } from "../types";
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
      // rule 186.1 / 652.3 — a card removed from the game stops being an object;
      // its owner is kept on the departed-owner record (rule 183), which is what
      // tells a legitimate removal apart from a card the engine lost.
      const departed = (cur.state as { departedOwners?: Record<string, string> }).departedOwners ?? {};
      for (const id of Object.keys(prev.cards)) {
        if (!cur.cards[id] && !isTokenInstance(id, prev.cards[id]?.definitionId) && departed[id] === undefined) {
          out.push(`${id} vanished`);
        }
      }
      for (const id of Object.keys(cur.cards)) {
        // rule 438.5.a / 438.7.b — a Replaced battlefield card waits in
        // Banishment as the SAME object under a new instance id (the token took
        // over the slot's id): it continues the card that just left the row.
        const continues = (cur.metas[id] as { replacedFromCardId?: string } | undefined)
          ?.replacedFromCardId;
        if (continues !== undefined && prev.cards[continues]) {
          continue;
        }
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
        // rule 444.2.c / 429.3 — a prompt that CHARGES its answer opens a Pay
        // window for the seat being asked, and their rune Add abilities stay
        // usable inside it (`resources.ts runeAddAllowedDuringChoice`); not a
        // gating violation. `promptPayableCost` is the single source of truth
        // for which prompts those are — a cost-bearing `opt-in`, a
        // `reveal-and-pick` that PLAYS the pick (419.2.a), the [X] pay, and a
        // surcharged target pick whose pick-time price is the payment (809.1.c.1).
        const payWindow = promptPayableCost(cur.state, pc)?.payerId === pid;
        if ((m.moveId === "exhaustRune" || m.moveId === "recycleRune") && payWindow) {
          continue;
        }
        // rule 444.2.c / 429.3.a — a payment prompt (the [X] pay, or a resolving
        // spell's "unless its controller pays" ransom) is a Pay step: the payer
        // may also crack NON-rune Reaction [Add] abilities (a legend's "[E]:
        // Add") to fund it. `chain/activate-ability.ts isPaymentPromptFor`
        // enumerates exactly those, so this is not a gating violation.
        if (m.moveId === "activateAbility" && pid === chooser && isPaymentPromptFor(cur.state, pid, pc)) {
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

/**
 * rule 355.8 / 358.3.a — NEVER RAISE A PROMPT WITH AN EMPTY ANSWER SET.
 *
 * A choice with no legal object is not a choice: rule 355.8 says such an option
 * is not offered, and rule 358.3.a says an instruction that can do nothing is
 * simply SKIPPED as it resolves. A prompt raised with zero selectable options
 * is therefore never right — and it is worse than wrong, it is a HANG: no seat
 * can answer it, `settle()` cannot drain it, and `advanceTurn()` refuses to end
 * a turn while a choice is pending. A real game stops dead there.
 *
 * So every raiser must decide "nothing to offer ⇒ skip the instruction" before
 * it writes `pendingChoice`, and this oracle turns any that forgets into a test
 * failure. Only the option-BEARING prompt shapes are judged; a yes/no, a
 * number, a name-a-card and a `new-choices` slot that may be kept are all
 * answerable with an empty option list.
 */
export const noEmptyPrompt: Invariant = {
  check: ({ cur }) => {
    if (cur.state.status !== "playing") {
      return [];
    }
    const out: string[] = [];
    for (const pc of [cur.state.pendingChoice, cur.state.pendingTriggerOrder]) {
      if (!pc) {
        continue;
      }
      const n = selectableOptionCount(pc);
      if (n === 0) {
        const chooser = getPendingChoiceChooser(pc);
        const source = (pc as { sourceCardId?: string }).sourceCardId;
        out.push(
          `${pc.type} prompt raised for ${chooser}${source ? ` from ${source}` : ""} with zero selectable options` +
            ` — 355.8/358.3.a: offer nothing and skip the instruction instead (nobody can answer this, and settle() cannot drain it)`,
        );
      }
    }
    return out;
  },
  name: "noEmptyPrompt",
};

/**
 * How many options the seat may actually pick from, or `undefined` for prompt
 * shapes that carry no option list (yes/no, a number, a card name) and are
 * answerable regardless.
 */
function selectableOptionCount(pc: PendingChoice): number | undefined {
  switch (pc.type) {
    case "choose-target":
    case "choose-destination":
    case "choose-mode":
    case "choose-player":
    case "weaponmaster-equip":
    case "combat-damage":
    case "pick-many":
      return pc.options.length;
    case "order":
      return pc.items.length;
    case "order-cards":
      return pc.cards.length;
    case "reveal-and-pick":
      return pc.revealed.length;
    // rule 751–755 — a slot with nothing to re-choose to is answerable while it
    // may be KEPT (753.2 settles it otherwise); only a slot that MUST be named
    // and has nothing to name is a trap.
    case "new-choices":
      return pc.keepable ? undefined : pc.options.length;
    default:
      return undefined;
  }
}

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
      const before0 = prev.state.runePools[ex.seat];
      const after0 = cur.state.runePools[ex.seat];
      // rule 356.4 — a QUOTED price must be the price that is charged. When the
      // play carries the quote the enumerator showed (`play-options.ts`), that
      // quote IS the oracle: it already contains the variant's additional costs,
      // discounts and [Deflect] instalment. Reading the card's PRINTED cost
      // instead flagged every correctly-charged discounted play as a violation.
      const quote = ex.params.quote as
        | { energy?: number; any?: number; power?: Record<string, number>; free?: boolean }
        | undefined;
      if (quote && typeof quote.energy === "number" && before0 && after0 && step.executed.length === 1) {
        const name = registry.get(cardId)?.name ?? cardId;
        const spentEnergy = before0.energy - after0.energy;
        if (spentEnergy !== quote.energy) {
          out.push(
            `${ex.moveId} ${name}: quoted energy ${quote.energy} but pool ${before0.energy}→${after0.energy}`,
          );
        }
        const totalPower = (pool: typeof before0): number =>
          Object.values(pool.power ?? {}).reduce<number>((a, n) => a + (n ?? 0), 0);
        const quotedPower =
          (quote.any ?? 0) + Object.values(quote.power ?? {}).reduce<number>((a, n) => a + (n ?? 0), 0);
        const spentPower = totalPower(before0) - totalPower(after0);
        if (spentPower !== quotedPower) {
          out.push(
            `${ex.moveId} ${name}: quoted power ${quotedPower} but pool ${totalPower(before0)}→${totalPower(after0)}`,
          );
        }
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
  noEmptyPrompt,
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
