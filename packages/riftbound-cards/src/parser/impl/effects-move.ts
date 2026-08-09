/**
 * Effect parsers: move.
 */

import type {
  Effect,
  MoveEffect,
  SequenceEffect,
} from "@tcg/riftbound-types/abilities/effect-types";
import type { AnyTarget, Filter, Location, SimpleFilter } from "@tcg/riftbound-types/targeting";
import { parseMightBoundClause } from "../parsers/target-parser";
import { parseEffect } from "./effect";
import { parseEffects } from "./effects";
import { parseLocationString } from "./targets";
import { wordToNumber } from "./tokens";

/**
 * rule-id: sfd-109-221 (Akshan) — "Move an enemy gear to your base. You
 * control it until I leave the board. [REST]" The control clause rides on the
 * moved card as a layered take-control that expires when the source leaves
 * the board; without this the flexible move fallback swallowed the clause.
 */
export function parseMoveAndTakeControlEffect(text: string): SequenceEffect | undefined {
  const m = text.match(
    /^(Move .+?)\.\s+You control (?:it|them) until I leave the board\.?(?:\s+(.+))?$/i,
  );
  if (!m) {
    return undefined;
  }
  const move = parseMoveEffect(`${m[1]}.`);
  if (!move) {
    return undefined;
  }
  const effects: Effect[] = [
    move,
    {
      duration: "until-leaves",
      target: { type: "pending-value" } as unknown as AnyTarget,
      type: "take-control",
    } as Effect,
  ];
  const rest = m[2] ? (parseEffects(m[2]) ?? parseEffect(m[2])) : undefined;
  if (rest) {
    effects.push(rest);
  }
  return { effects, pendingValue: { source: 0 }, type: "sequence" } as SequenceEffect;
}

/**
 * Try to parse a move effect: "Move TARGET [to LOCATION]."
 */
export function parseMoveEffect(text: string): MoveEffect | undefined {
  // rule 710 (ven-105-166 Twilight Step) — "Move a unit with 3 [Might] or
  // less.": a trailing Might bound restricts WHICH unit may be chosen. Strip it
  // before the shape patterns run (they would swallow it) and re-attach it as a
  // filter on whatever target they produce.
  const mightBound = parseMightBoundClause(text.replace(/\.\s*$/, ""));
  if (mightBound) {
    const base = parseMoveEffect(`${mightBound.rest}.`);
    const baseTarget = base?.target;
    if (base && typeof baseTarget === "object" && baseTarget !== null) {
      const existing = (baseTarget as { filter?: Filter | Filter[] }).filter;
      const filter = existing === undefined ? mightBound.filter : [...[existing].flat(), mightBound.filter];
      return { ...base, target: { ...(baseTarget as object), filter } as AnyTarget };
    }
    return base;
  }

  // Swap pattern: "Move me to its location and it to my original location"
  // Represent as a self-move to the chosen unit's location ("here").
  if (/^move me to its location and it to my original location\.?$/i.test(text)) {
    return { target: "self" as AnyTarget, to: "here", type: "move" };
  }

  // From/to pattern — allows optional "another", optional state qualifier, and controller
  // Accepts both orderings: "exhausted a friendly" and "an exhausted friendly"
  const fromToMatch = text.match(
    /^Move (?:(another)\s+)?(?:(exhausted|ready|stunned|damaged)\s+)?(a|an)\s+(?:(exhausted|ready|stunned|damaged)\s+)?(?:(friendly|enemy)\s+)?(units?) from (a battlefield|battlefield|(?:your |its )?base|here) to (its base|(?:your )?base|here|a battlefield|battlefield)\.?$/i,
  );
  if (fromToMatch) {
    const another = fromToMatch[1];
    const state = fromToMatch[2]?.toLowerCase() ?? fromToMatch[4]?.toLowerCase();
    const controllerStr = fromToMatch[5]?.toLowerCase();
    const from = parseLocationString(fromToMatch[7]);
    const to = parseLocationString(fromToMatch[8]);
    const target: Record<string, unknown> = { type: "unit" };
    if (controllerStr === "friendly" || controllerStr === "enemy") {
      target.controller = controllerStr;
    }
    if (another) {
      target.excludeSelf = true;
    }
    if (state) {
      target.filter = state;
    }
    // rule 355.8: "Move a unit FROM a battlefield" may only choose a unit that
    // is already there — the origin restricts the target, not just the motion.
    if (from === "battlefield" || from === "base" || from === "here") {
      target.location = from;
    }
    return { from, target: target as unknown as AnyTarget, to, type: "move" };
  }

  // Self-move: "Move me to your base." / "Move it to here."
  const selfMoveMatch = text.match(
    /^Move (me|it) to (base|here|its base|your base|a battlefield|battlefield|this battlefield|an occupied enemy battlefield)\.?$/i,
  );
  if (selfMoveMatch) {
    const pronoun = selfMoveMatch[1].toLowerCase();
    const selfTarget: AnyTarget = pronoun === "me" ? "self" : ({ type: "unit" } as AnyTarget);
    return {
      target: selfTarget,
      to: parseLocationString(selfMoveMatch[2]),
      type: "move",
    };
  }

  // "any number of" pattern
  // rule-id: ven-091-166 (Corrupted Dragon) — optional "here" location and
  // "each with N :rb_might: or less" per-unit Might filter on the chosen set.
  const anyNumberMatch = text.match(
    /^Move any number of (your |friendly |enemy )?((?:\w+\s+)?units?)(?:\s+(at a battlefield)|\s+(here))?(?:\s+(?:each )?with (\d+) :rb_might: or (less|more))?\s+to\s+(base|here|its base|your base|their base|a battlefield|battlefield|this battlefield|an open battlefield|a single location)\.?$/i,
  );
  if (anyNumberMatch) {
    const controllerRaw = anyNumberMatch[1]?.trim().toLowerCase();
    // rule-id: sfd-177-221 — "any number of" is a player-choice quantity ("any"),
    // not a mandatory "all"; and the optional qualifier word before "units"
    // (e.g. "token") is a target filter that must not be dropped.
    const unitPhrase = anyNumberMatch[2].toLowerCase();
    const qualifier = unitPhrase.replace(/\s*units?$/, "").trim();
    // rule 355.11.b: "at a battlefield" is a location restriction — units in a base are never legal.
    const atBattlefieldStr = anyNumberMatch[3];
    const hereStr = anyNumberMatch[4];
    const mightN = anyNumberMatch[5];
    const mightDir = anyNumberMatch[6]?.toLowerCase();
    const target: {
      type: "unit";
      controller?: "friendly" | "enemy";
      location?: Location;
      quantity: "any";
      filter?: Filter | Filter[];
    } = {
      quantity: "any",
      type: "unit",
    };
    if (hereStr) {
      target.location = "here";
    } else if (atBattlefieldStr) {
      target.location = "battlefield";
    }
    if (controllerRaw === "your" || controllerRaw === "friendly") {
      target.controller = "friendly";
    } else if (controllerRaw === "enemy") {
      target.controller = "enemy";
    }
    if (qualifier) {
      const simpleFilters: readonly SimpleFilter[] = [
        "mighty",
        "buffed",
        "damaged",
        "stunned",
        "ready",
        "exhausted",
        "token",
        "equipped",
        "attacking",
        "defending",
        "alone",
        "facedown",
      ];
      target.filter = (simpleFilters as readonly string[]).includes(qualifier)
        ? (qualifier as SimpleFilter)
        : { tag: qualifier.charAt(0).toUpperCase() + qualifier.slice(1) };
    }
    if (mightN) {
      const n = Number.parseInt(mightN, 10);
      const mightFilter = { might: mightDir === "more" ? { gte: n } : { lte: n } } as Filter;
      target.filter = target.filter ? [target.filter as Filter, mightFilter] : mightFilter;
    }
    const to = parseLocationString(anyNumberMatch[7]);
    return { target: target as AnyTarget, to, type: "move" };
  }

  // Basic pattern (supports "another", quantity, attacking modifier, optional "at a battlefield"
  // Suffix on target, and an optional "from/to" location clause).
  //
  // Examples:
  //   "Move a friendly unit." / "Move a friendly unit to its base."
  //   "Move another friendly unit to a battlefield."
  //   "Move a unit at a battlefield to its base."
  //   "Move a friendly unit at a battlefield to its base."
  //   "Move up to 2 friendly units to base."
  //   "Move up to one enemy unit from here to its base."
  const basicMatch = text.match(
    /^Move (?:(another)\s+)?(a|an|up to (?:one|two|three|four|five|\d+))\s+(attacking enemy |attacking |friendly |enemy )?(units?)(?:\s+(at a battlefield|here|there))?(?:\s+from\s+(a battlefield|battlefield|here|its base|your base|base))?(?:\s+to\s+(base|here|its base|your base|their base|a battlefield|battlefield|this battlefield|the same battlefield|that battlefield|an open battlefield|a battlefield you control))?(?:\s+and ready (?:it|them))?\.?$/i,
  );
  if (basicMatch) {
    const another = basicMatch[1];
    const quantityStr = basicMatch[2].toLowerCase();
    const controllerStr = basicMatch[3]?.trim().toLowerCase();
    const atStr = basicMatch[5]?.toLowerCase();
    const fromStr = basicMatch[6];
    const destStr = basicMatch[7];

    const target: {
      type: "unit";
      controller?: "friendly" | "enemy";
      excludeSelf?: boolean;
      filter?: { state: string };
      quantity?: { upTo: number } | number;
    } = { type: "unit" };

    if (controllerStr) {
      if (controllerStr.includes("enemy")) {
        target.controller = "enemy";
      } else if (controllerStr.includes("friendly")) {
        target.controller = "friendly";
      }
      if (controllerStr.includes("attacking")) {
        target.filter = { state: "attacking" };
      }
    }

    if (another) {
      target.excludeSelf = true;
    }

    // rule 355.8: "a friendly unit AT A BATTLEFIELD" restricts which units may be
    // chosen — a unit already in a base is not a legal choice.
    if (atStr === "at a battlefield") {
      (target as { location?: Location }).location = "battlefield";
    } else if (atStr === "here" || atStr === "there") {
      (target as { location?: Location }).location = "here";
    }

    const upToNumMatch = quantityStr.match(/^up to (one|two|three|four|five|\d+)$/);
    if (upToNumMatch) {
      target.quantity = { upTo: wordToNumber(upToNumMatch[1]) };
    }

    // rule-id: ogn-173-298 (rule 355.4 / 355.4.a) — no stated destination means
    // the controller chooses any valid location other than the current one, so
    // emit "choose" (engine raises a choose-destination prompt) rather than base.
    const to: Location | "choose" = destStr ? parseLocationString(destStr) : "choose";

    const effect: MoveEffect = { target: target as AnyTarget, to, type: "move" };
    if (fromStr) {
      const from = parseLocationString(fromStr);
      // rule 355.8: the stated origin restricts which units may be chosen.
      if (from === "battlefield" || from === "base" || from === "here") {
        (target as { location?: Location }).location = from;
      }
      return { ...effect, from } as MoveEffect;
    }
    return effect;
  }

  // rule-id: ogn-259-298 (rule 355.4) — "Move a friendly unit TO OR FROM ITS
  // BASE": the destination is a choice, but only across the unit's own base
  // boundary. A unit at a battlefield may only go to base, never sideways to
  // another battlefield.
  const toOrFromBaseMatch = text.match(
    /^Move (?:(another)\s+)?(?:a|an)\s+(friendly |enemy )?units?\s+to or from (?:its|their) base\.?$/i,
  );
  if (toOrFromBaseMatch) {
    const target: { type: "unit"; controller?: "friendly" | "enemy"; excludeSelf?: boolean } = {
      type: "unit",
    };
    const controllerStr = toOrFromBaseMatch[2]?.trim().toLowerCase();
    if (controllerStr === "friendly" || controllerStr === "enemy") {
      target.controller = controllerStr;
    }
    if (toOrFromBaseMatch[1]) {
      target.excludeSelf = true;
    }
    return { target: target as AnyTarget, to: "choose", toOrFromBase: true, type: "move" } as MoveEffect;
  }

  // Flexible fallback for sentences that have extra trailing clauses
  // E.g., "Move a unit you control to a battlefield you control..."
  const flexMoveMatch = text.match(
    /^Move (a|an|another) (friendly |enemy )?(unit|units|gear)(?:\s+you control)?(?:\s+to\s+(base|here|its base|your base|a battlefield|battlefield|the same battlefield|a battlefield you control))?(?:\s+.*)?\.?$/i,
  );
  if (flexMoveMatch) {
    const quantityStr = flexMoveMatch[1].toLowerCase();
    const targetType = flexMoveMatch[3].toLowerCase().replace(/s$/, "") as "unit" | "gear";
    const target: {
      type: "unit" | "gear";
      controller?: "friendly" | "enemy";
      excludeSelf?: boolean;
    } = { type: targetType };
    const controllerStr = flexMoveMatch[2]?.trim();
    if (controllerStr) {
      target.controller = controllerStr.toLowerCase() as "friendly" | "enemy";
    } else if (/\byou control\b/i.test(text)) {
      target.controller = "friendly";
    }
    if (quantityStr === "another") {
      target.excludeSelf = true;
    }
    const toStr = flexMoveMatch[4];
    // rule-id: ogn-173-298 (rule 355.4) — absent destination is a player choice.
    const to: Location | "choose" = toStr ? parseLocationString(toStr) : "choose";
    return { target: target as AnyTarget, to, type: "move" } as MoveEffect;
  }

  return undefined;
}
