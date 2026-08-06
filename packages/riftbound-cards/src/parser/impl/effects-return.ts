/**
 * Effect parsers: banish / return-to-hand / recall.
 */

import type {
  BanishEffect,
  RecallEffect,
  ReturnToHandEffect,
} from "@tcg/riftbound-types/abilities/effect-types";
import type { AnyTarget, Location } from "@tcg/riftbound-types/targeting";
import { parseTarget } from "../parsers/target-parser";
import { wordToNumber } from "./tokens";

/**
 * Try to parse a banish effect: "Banish TARGET."
 *
 * Handles:
 * - "Banish me." / "Banish this." / "Banish it." (self / trigger source)
 * - "Banish a unit." / "Banish an enemy unit."
 * - "Banish a friendly unit at a battlefield."
 * - "Banish all damaged units."
 * - "Banish a card from your trash."
 * - "Banish all units from your trash."
 */
export function parseBanishEffect(text: string): BanishEffect | undefined {
  // Self reference: "Banish me." / "Banish this."
  if (/^Banish (me|this)\.?$/i.test(text)) {
    return { target: "self" as AnyTarget, type: "banish" };
  }

  // Trigger-source reference: "Banish it."
  if (/^Banish it\.?$/i.test(text)) {
    return { target: { type: "unit" } as AnyTarget, type: "banish" };
  }

  // "Banish a/all card(s) from your trash."
  const fromTrashMatch = text.match(
    /^Banish (a|an|all)\s+(card|cards|unit|units|spell|spells|gear|gears)(?:\s+from\s+(?:your|its owner's|owner's|their)\s+trash)\.?$/i,
  );
  if (fromTrashMatch) {
    const quantifier = fromTrashMatch[1].toLowerCase();
    const typeStr = fromTrashMatch[2].toLowerCase().replace(/s$/, "");
    const target: Record<string, unknown> = {
      location: "trash",
      type: typeStr,
    };
    if (quantifier === "all") {
      target.quantity = "all";
    }
    return { target: target as unknown as AnyTarget, type: "banish" };
  }

  // General target: "Banish [a/an/all/another] [damaged/stunned] [friendly/enemy] unit(s) [here/at a battlefield]."
  const match = text.match(
    /^Banish ((?:(?:a|an|all|another)\s+)?(?:damaged\s+|stunned\s+)?(?:friendly\s+|enemy\s+)?(?:unit|units|gear|gears)(?:\s+(?:at a battlefield|here|there))?)\.?$/i,
  );
  if (!match) {
    return undefined;
  }

  const targetStr = match[1].toLowerCase().trim();
  const isGear = /gear/.test(targetStr);
  const target: {
    type: "unit" | "gear";
    controller?: "friendly" | "enemy";
    location?: Location;
    filter?: string;
    quantity?: "all";
    excludeSelf?: boolean;
  } = { type: isGear ? "gear" : "unit" };

  if (targetStr.includes("enemy")) {
    target.controller = "enemy";
  } else if (targetStr.includes("friendly")) {
    target.controller = "friendly";
  }

  if (targetStr.includes("here")) {
    target.location = "here" as Location;
  } else if (targetStr.includes("at a battlefield")) {
    target.location = "battlefield";
  }

  if (targetStr.includes("damaged")) {
    target.filter = "damaged";
  } else if (targetStr.includes("stunned")) {
    target.filter = "stunned";
  }

  if (/^all\b/.test(targetStr)) {
    target.quantity = "all";
  } else if (/^another\b/.test(targetStr)) {
    target.excludeSelf = true;
  }

  return { target: target as AnyTarget, type: "banish" };
}

/**
 * Try to parse a return-to-hand effect: "Return TARGET to owner's hand."
 */
export function parseReturnToHandEffect(text: string): ReturnToHandEffect | undefined {
  // Self-return: "Return me to my owner's hand." (case-insensitive)
  if (/^return me to (?:my|its) owner's hand\.?$/i.test(text)) {
    return { target: "self" as AnyTarget, type: "return-to-hand" };
  }

  // "Return it to its owner's hand." — refers to trigger source (not self)
  if (/^return it to its owner's hand(?:\s+instead)?\.?$/i.test(text)) {
    return { target: { type: "unit" } as AnyTarget, type: "return-to-hand" };
  }

  // Area return: "Return all units [with N [Might] or less] to their owners' hands."
  // Or: "Return all units and gear to their owners' hands."
  const areaMatch = text.match(
    /^Return all (units(?:\s+and\s+gear)?|gear(?:\s+and\s+units)?)(?:\s+with\s+(\d+)\s*:rb_might:\s*or\s*less)?\s+to\s+their owners'?\s+hands?\.?$/i,
  );
  if (areaMatch) {
    const what = areaMatch[1].toLowerCase();
    const mightLte = areaMatch[2] ? Number.parseInt(areaMatch[2], 10) : undefined;
    const target: Record<string, unknown> = { quantity: "all", type: "unit" };
    if (mightLte !== undefined) {
      target.filter = { might: { lte: mightLte } };
    }
    if (what.includes("gear") && what.includes("unit")) {
      // Both units and gear — use type "permanent" to represent the union
      target.type = "permanent";
    } else if (what.startsWith("gear")) {
      target.type = "gear";
    }
    return { target: target as unknown as AnyTarget, type: "return-to-hand" };
  }

  // From-trash pattern: "Return a/an [friendly/enemy] (spell|unit|gear|card|unit or gear|...)
  //                      [with X [Might] or less] from your trash to your hand."
  // Also handles tag-filter list: "return a Bird, Cat, Dog, or Poro from your trash to your hand."
  const fromTrashMatch = text.match(
    /^Return (?:(a|an|up to (?:one|two|three|four|five|\d+))\s+)?((?:[A-Z][A-Za-z-]*(?:,\s+or\s+|,\s*|\s+or\s+))+[A-Z][A-Za-z-]*|unit or gear|gear or unit|unit|units|gear|spell|spells|card|cards)(?:\s+with\s+\[?hidden\]?)?(?:\s+with\s+(\d+)\s*:rb_might:\s*or\s*less)?\s+from\s+(?:your|its owner's|their|owner's)\s+trash\s+to\s+(?:your|their|its owner's)\s+hand\.?$/i,
  );
  if (fromTrashMatch) {
    const quantityStr = fromTrashMatch[1]?.toLowerCase();
    const typeRaw = fromTrashMatch[2].trim();
    const mightLte = fromTrashMatch[3] ? Number.parseInt(fromTrashMatch[3], 10) : undefined;

    const target: Record<string, unknown> = { location: "trash" };

    // Parse type: check for tag-list (commas / "or") first
    const typeLower = typeRaw.toLowerCase();
    if (typeLower === "unit" || typeLower === "units") {
      target.type = "unit";
    } else if (typeLower === "gear" || typeLower === "gears") {
      target.type = "gear";
    } else if (typeLower === "spell" || typeLower === "spells") {
      target.type = "spell";
    } else if (typeLower === "card" || typeLower === "cards") {
      target.type = "card";
    } else if (typeLower === "unit or gear" || typeLower === "gear or unit") {
      target.type = "permanent";
    } else if (/[,]|\s+or\s+/i.test(typeRaw)) {
      // Tag list: e.g., "Bird, Cat, Dog, or Poro"
      const tags = typeRaw
        .split(/,\s*or\s+|,\s*|\s+or\s+/i)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.toLowerCase() !== "and");
      target.type = "unit";
      target.filter = tags.length === 1 ? { tag: tags[0] } : tags.map((t) => ({ tag: t }));
    } else {
      // Single capitalized word: treat as a tag
      target.type = "unit";
      target.filter = { tag: typeRaw };
    }

    if (mightLte !== undefined) {
      const existing = target.filter;
      const mightFilter = { might: { lte: mightLte } };
      target.filter = existing
        ? (Array.isArray(existing)
          ? [...existing, mightFilter]
          : [existing, mightFilter])
        : mightFilter;
    }

    if (quantityStr) {
      const upToMatch = quantityStr.match(/^up to (one|two|three|four|five|\d+)$/);
      if (upToMatch) {
        target.quantity = { upTo: wordToNumber(upToMatch[1]) };
      }
    }

    return { target: target as unknown as AnyTarget, type: "return-to-hand" };
  }

  // Compound type pattern: "Return [another] friendly gear, unit, or facedown card to its owner's hand."
  // Treats the union of types as `permanent` (units + gear + facedown).
  const compoundMatch = text.match(
    /^Return (?:(another)\s+)?(?:(friendly|enemy)\s+)?(?:gear,?\s+unit,?\s*(?:or\s+)?(?:facedown\s+card)?|unit,?\s+gear,?\s*(?:or\s+)?(?:facedown\s+card)?)\s+to\s+(?:its owner's|my owner's|your|their owner's)\s+hand\.?$/i,
  );
  if (compoundMatch) {
    const target: Record<string, unknown> = { type: "permanent" };
    if (compoundMatch[1]) {
      target.excludeSelf = true;
    }
    if (compoundMatch[2]) {
      target.controller = compoundMatch[2].toLowerCase();
    }
    return { target: target as unknown as AnyTarget, type: "return-to-hand" };
  }

  // General pattern: "Return [another] [a/an] [friendly|enemy] unit/gear [at a battlefield|here]
  //                   [with N [Might] or less] to its owner's hand."
  // Also accepts "another unit" without "a/an" (bare "another").
  const match = text.match(
    /^Return (?:(another)\s+)?((?:(?:a|an)\s+)?(?:friendly|enemy)?\s*(?:unit|gear)(?:\s+(?:at a battlefield|here|there))?(?:\s+with\s+\d+\s*:rb_might:\s*or\s*less)?)\s+to\s+(?:its owner's|my owner's|your|their owner's)\s+hand\.?$/i,
  );
  if (match) {
    const another = match[1];
    const targetStr = match[2];
    const mightMatch = targetStr.match(/with\s+(\d+)\s*:rb_might:\s*or\s*less/i);
    const target: Record<string, unknown> = { type: "unit" };

    if (/\bgear\b/i.test(targetStr)) {
      target.type = "gear";
    }
    if (/\benemy\b/i.test(targetStr)) {
      target.controller = "enemy";
    } else if (/\bfriendly\b/i.test(targetStr)) {
      target.controller = "friendly";
    }
    if (/\bat a battlefield\b/i.test(targetStr)) {
      target.location = "battlefield";
    } else if (/\bhere\b/i.test(targetStr)) {
      target.location = "here";
    }
    if (another) {
      target.excludeSelf = true;
    }
    if (mightMatch) {
      target.filter = { might: { lte: Number.parseInt(mightMatch[1], 10) } };
    }

    return { target: target as unknown as AnyTarget, type: "return-to-hand" };
  }

  return undefined;
}

/**
 * Try to parse a recall effect: "Recall TARGET [exhausted]."
 */
export function parseRecallEffect(text: string): RecallEffect | undefined {
  const match = text.match(
    /^Recall (me|it|them|ALL units|a unit|that unit|an? (?:friendly |enemy )?unit)(?:\s+(exhausted))?\.?$/i,
  );
  if (!match) {
    return undefined;
  }
  const rawTarget = match[1];
  // Special cases for pronouns / global targets that parseTarget doesn't handle.
  let target;
  const lower = rawTarget.toLowerCase();
  if (lower === "it") {
    target = { type: "unit" };
  } else if (lower === "them") {
    target = { type: "unit" };
  } else if (lower === "all units") {
    target = { type: "unit" };
  } else {
    target = parseTarget(rawTarget);
  }
  const exhausted = match[2]?.toLowerCase() === "exhausted";
  return exhausted
    ? ({ exhausted: true, target, type: "recall" } as RecallEffect)
    : ({ target, type: "recall" } as RecallEffect);
}
