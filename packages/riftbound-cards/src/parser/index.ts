/**
 * Riftbound Ability Parser
 *
 * Parser for converting card ability text to structured ability objects.
 */

import type {
  Ability,
  AbilityWithText,
  ActivatedAbility,
  CostKeyword,
  CostKeywordAbility,
  EffectKeywordAbility,
  KeywordAbility,
  SimpleKeyword,
  SimpleKeywordAbility,
  SpellAbility,
  StaticAbility,
  TriggeredAbility,
  ValueKeyword,
  ValueKeywordAbility,
} from "@tcg/riftbound-types";
import type { Cost, Domain } from "@tcg/riftbound-types/abilities/cost-types";
import type {
  AddResourceEffect,
  BanishEffect,
  BuffEffect,
  ChannelEffect,
  ChoiceEffect,
  CounterEffect,
  CreateTokenEffect,
  DamageEffect,
  DrawEffect,
  Effect,
  FightEffect,
  GainControlOfSpellEffect,
  GrantKeywordEffect,
  KillEffect,
  LookEffect,
  ModifyMightEffect,
  MoveEffect,
  PreventDamageEffect,
  RecallEffect,
  ReturnToHandEffect,
  SequenceEffect,
  StunEffect,
  TokenDefinition,
} from "@tcg/riftbound-types/abilities/effect-types";
import type { AnyTarget, Location, Target } from "@tcg/riftbound-types/targeting";
import {
  parseLeadingIfCondition,
  parseTrailingIfCondition,
} from "./parsers/condition-parser";
import { parseCost } from "./parsers/cost-parser";
import { parseCostKeyword } from "./parsers/keyword-parser";
import { parseEffectKeywordsWithPositions } from "./parsers/effect-keyword-parser";
import { parseStaticAbility } from "./parsers/static-parser";
import { parseTarget } from "./parsers/target-parser";

/**
 * Options for controlling parser behavior and output
 */
export interface ParserOptions {
  /** Omit the 'id' field from AbilityWithText results */
  readonly omitId?: boolean;
  /** Omit the 'text' field from AbilityWithText results */
  readonly omitText?: boolean;
  /** Card ID prefix for generating ability IDs (e.g., "card-1") */
  readonly cardId?: string;
  /** Generate unique IDs for abilities */
  readonly generateAbilityUids?: boolean;
}

/**
 * Result of parsing a single ability text
 */
export interface ParseResult {
  readonly success: boolean;
  readonly ability?: Ability;
  readonly error?: string;
}

/**
 * Result of parsing ability text that may contain multiple abilities
 */
export interface ParseAbilitiesResult {
  readonly success: boolean;
  readonly abilities?: Ability[];
  readonly error?: string;
}

// ============================================================================
// Emoji / Token Pattern Constants
// ============================================================================

const ENERGY_RE = /:rb_energy_(\d+):/g;
const POWER_RE = /:rb_rune_(fury|calm|mind|body|chaos|order|rainbow):/g;
const EXHAUST_TOKEN = ":rb_exhaust:";
const MIGHT_TOKEN = ":rb_might:";

// ============================================================================
// Reminder / Parenthetical Text Removal
// ============================================================================

/**
 * Remove parenthesized reminder text from ability text.
 * Handles italic markers like `_ (...)_`
 */
function stripReminders(text: string): string {
  // Strip italic-wrapped reminder text like `_ (...)_` or `_(...)_`
  let cleaned = text.replace(/_?\s*\([^)]*\)\s*_?/g, "");
  // Also strip standalone parenthetical reminders
  cleaned = cleaned.replace(/\s*\([^)]*\)\s*/g, " ");
  return cleaned.trim();
}

/**
 * Normalize token syntax in effect text.
 * Converts human-readable bracket tokens to parser-expected emoji tokens:
 *   - `[Might]` -> `:rb_might:`
 *   - `[Buff]` -> `Buff` (strip brackets so it's treated as a plain verb)
 *   - `[Exhaust]` -> `:rb_exhaust:`
 *   - `[N]` (number) -> `:rb_energy_N:`
 *   - `[fury]`, `[calm]`, etc. -> `:rb_rune_X:`
 *   - `[&gt;]` / `[>]` / `[>>]` indicator markers -> stripped. These are
 *     visual arrows that separate a timing / threshold prefix (e.g.
 *     `[Reaction][>]`, `[Level 6][>]`, `[Deathknell][>]`) from the effect
 *     text and carry no parser-relevant meaning.
 */
function normalizeTokens(text: string): string {
  let result = text;
  // Decode the HTML entity used in card text for the ">" arrow.
  result = result.replace(/&gt;/g, ">");
  // Strip "[>]" / "[>>]" indicator arrows wherever they appear.
  result = result.replace(/\[>>?\]/g, " ");
  // Convert [Might] to :rb_might: (case-insensitive)
  result = result.replace(/\[Might\]/gi, ":rb_might:");
  // Convert [Buff] to Buff (strip brackets so "Buff TARGET" patterns match)
  result = result.replace(/\[Buff\]/gi, "Buff");
  // Convert [Stun] to Stun (strip brackets so "Stun TARGET" patterns match)
  result = result.replace(/\[Stun\]/gi, "Stun");
  // Convert [Exhaust] to :rb_exhaust:
  result = result.replace(/\[Exhaust\]/gi, ":rb_exhaust:");
  // Convert [N] (numeric energy cost) to :rb_energy_N:
  result = result.replace(/\[(\d+)\]/g, ":rb_energy_$1:");
  // Convert [domain] to :rb_rune_domain:
  result = result.replace(
    /\[(fury|calm|mind|body|chaos|order|rainbow)\]/gi,
    (_match, domain: string) => `:rb_rune_${domain.toLowerCase()}:`,
  );
  // Collapse runs of whitespace left behind by arrow/entity removal.
  result = result.replace(/\s{2,}/g, " ");
  return result;
}

// ============================================================================
// Cost Parsing Helpers
// ============================================================================

/**
 * Parse an activation cost string before the `::` separator.
 * Handles `:rb_energy_N:`, `:rb_rune_DOMAIN:`, `:rb_exhaust:` and combinations.
 */
function parseActivationCost(costStr: string): Cost {
  return parseCost(costStr);
}

// ============================================================================
// Resource Parsing Helpers
// ============================================================================

/**
 * Parse energy and power from an `[Add]` resource payload.
 * e.g. `:rb_energy_1:`, `:rb_rune_fury:`, `:rb_energy_1::rb_rune_fury:`
 */
function parseResourcePayload(payload: string): AddResourceEffect {
  const effect: { type: "add-resource"; energy?: number; power?: Domain[] } = {
    type: "add-resource",
  };

  const energyPattern = new RegExp(ENERGY_RE.source, "g");
  let energyMatch: RegExpExecArray | null;
  while ((energyMatch = energyPattern.exec(payload)) !== null) {
    effect.energy = (effect.energy ?? 0) + Number.parseInt(energyMatch[1], 10);
  }

  const powerPattern = new RegExp(POWER_RE.source, "g");
  let powerMatch: RegExpExecArray | null;
  while ((powerMatch = powerPattern.exec(payload)) !== null) {
    if (!effect.power) {
      effect.power = [];
    }
    effect.power.push(powerMatch[1] as Domain);
  }

  return effect as AddResourceEffect;
}

// ============================================================================
// Word-to-Number Helper
// ============================================================================

const WORD_NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  five: 5,
  four: 4,
  one: 1,
  six: 6,
  three: 3,
  two: 2,
};

function wordToNumber(word: string): number {
  return WORD_NUMBERS[word.toLowerCase()] ?? (Number.parseInt(word, 10) || 1);
}

// ============================================================================
// Effect Parsers
// ============================================================================

/**
 * Try to parse a draw effect: "Draw N."
 */
function parseDrawEffect(text: string): DrawEffect | undefined {
  // Handle "Draw N for each [other] battlefield you (or allies )?control" patterns
  const forEachBattlefieldMatch = text.match(
    /^Draw (\d+) for each (other )?battlefield you(?: or allies)? control\.?$/i,
  );
  if (forEachBattlefieldMatch) {
    const perUnit = Number.parseInt(forEachBattlefieldMatch[1], 10);
    const excludeSelf = Boolean(forEachBattlefieldMatch[2]);
    const countObj: {
      count: AnyTarget;
      multiplier?: number;
    } = {
      count: {
        controller: "friendly-or-allies",
        excludeSelf,
        type: "battlefield",
      } as unknown as AnyTarget,
      ...(perUnit !== 1 ? { multiplier: perUnit } : {}),
    };
    return { amount: countObj, type: "draw" } as unknown as DrawEffect;
  }

  // Handle "Draw N for each ..." conditional draw patterns
  const forEachMatch = text.match(
    /^Draw (\d+) for each (?:of )?((?:your |other |friendly )?(?:\[?\w+\]?\s*)?(?:units?|friendly units?|cards?|gear)(?:\s+(?:here|at a battlefield|there))?)\.?$/i,
  );
  if (forEachMatch) {
    const perUnit = Number.parseInt(forEachMatch[1], 10);
    const countTarget = forEachMatch[2].trim().toLowerCase();
    const countObj: {
      count: AnyTarget;
      multiplier?: number;
    } = {
      count: parseTarget(countTarget) as AnyTarget,
      ...(perUnit !== 1 ? { multiplier: perUnit } : {}),
    };
    return { amount: countObj, type: "draw" } as unknown as DrawEffect;
  }

  // Handle "Its controller draws N" / "Their controller draws N"
  const controllerDrawMatch = text.match(/^Its controller draws (\d+)\.?$/i);
  if (controllerDrawMatch) {
    return {
      amount: Number.parseInt(controllerDrawMatch[1], 10),
      player: "opponent",
      type: "draw",
    };
  }

  // Handle "They draw N" / "that player draws N"
  const theyDrawMatch = text.match(/^(?:They|that player) draws? (\d+)\.?$/i);
  if (theyDrawMatch) {
    return { amount: Number.parseInt(theyDrawMatch[1], 10), player: "opponent", type: "draw" };
  }

  // Handle "Each player draws N" / "you and that player each draw N"
  const eachDrawMatch = text.match(/^(?:Each player|you and that player each) draws? (\d+)\.?$/i);
  if (eachDrawMatch) {
    return { amount: Number.parseInt(eachDrawMatch[1], 10), player: "each", type: "draw" };
  }

  // Basic "Draw N" pattern (anchored to end to avoid matching partial compounds)
  const match = text.match(/^Draw (\d+)\.?$/i);
  if (!match) {
    return undefined;
  }
  return { amount: Number.parseInt(match[1], 10), type: "draw" };
}

/**
 * Try to parse a channel effect: "Channel N rune(s) [exhausted]."
 *
 * Also supports "Each player channels N rune(s) [exhausted]." — used by
 * some battlefield/hold triggers — encoded with `player: "each"`.
 */
function parseChannelEffect(text: string): ChannelEffect | undefined {
  // "Each player channels N rune(s) [exhausted]."
  const eachMatch = text.match(/^each player channels? (\d+) runes?(?:\s+(exhausted))?\.?$/i);
  if (eachMatch) {
    const amount = Number.parseInt(eachMatch[1], 10);
    const exhausted = eachMatch[2]?.toLowerCase() === "exhausted";
    const effect: ChannelEffect & { player?: "each" } = exhausted
      ? { amount, exhausted: true, type: "channel" }
      : { amount, type: "channel" };
    (effect as { player: "each" }).player = "each";
    return effect;
  }

  const match = text.match(/^channel (\d+) runes?(?:\s+(exhausted))?\.?/i);
  if (!match) {
    return undefined;
  }
  const amount = Number.parseInt(match[1], 10);
  const exhausted = match[2]?.toLowerCase() === "exhausted";
  return exhausted ? { amount, exhausted: true, type: "channel" } : { amount, type: "channel" };
}

/**
 * Try to parse a buff effect: "Buff TARGET."
 *
 * Handles: "Buff me/it", "Buff a [friendly] unit", "Buff another friendly unit",
 * "Buff up to N [other] friendly units", "Buff all units here", "Buff friendly units"
 */
function parseBuffEffect(text: string): BuffEffect | undefined {
  const match = text.match(
    /^Buff (me|it|(?:up to (?:two|three|four|five|six|\d+)\s+)?(?:another\s+|other\s+)?(?:all\s+)?(?:a\s+|an\s+)?(?:exhausted\s+|stunned\s+|damaged\s+)?(?:friendly |enemy )?(?:unit|units)(?:\s+(?:here|there|at a battlefield))?)\.?/i,
  );
  if (!match) {
    return undefined;
  }
  const targetText = match[1].toLowerCase().trim();

  // Self references
  if (targetText === "me" || targetText === "it") {
    return { target: "self" as AnyTarget, type: "buff" };
  }

  // Build target from text
  const buffTarget: {
    type: "unit";
    controller?: "friendly" | "enemy";
    location?: Location;
    quantity?: "all" | number | { upTo: number };
    excludeSelf?: boolean;
    filter?: string;
  } = { type: "unit" };

  if (targetText.includes("friendly")) {
    buffTarget.controller = "friendly";
  } else if (targetText.includes("enemy")) {
    buffTarget.controller = "enemy";
  }

  if (targetText.includes("here")) {
    buffTarget.location = "here" as Location;
  } else if (targetText.includes("there")) {
    buffTarget.location = "there" as Location;
  } else if (targetText.includes("at a battlefield")) {
    buffTarget.location = "battlefield";
  }

  if (targetText.includes("all ")) {
    buffTarget.quantity = "all";
  } else if (targetText.includes("another") || targetText.includes("other")) {
    buffTarget.excludeSelf = true;
  }

  // Parse state filters
  if (targetText.includes("exhausted")) {
    buffTarget.filter = "exhausted";
  } else if (targetText.includes("stunned")) {
    buffTarget.filter = "stunned";
  } else if (targetText.includes("damaged")) {
    buffTarget.filter = "damaged";
  }

  // Parse "up to N" quantity
  const upToMatch = targetText.match(/up to (two|three|four|five|six|\d+)/);
  if (upToMatch) {
    buffTarget.quantity = { upTo: wordToNumber(upToMatch[1]) };
  }

  return { target: buffTarget as AnyTarget, type: "buff" };
}

/**
 * Parse a damage/kill target string into a Target-like object.
 * Extracts controller, location, quantity, and filter from natural language.
 */
function parseCardTarget(targetText: string): {
  type: "unit";
  controller?: "friendly" | "enemy";
  location?: Location;
  quantity?: "all" | number | { upTo: number };
  filter?: string;
} {
  const lower = targetText.toLowerCase();
  const target: {
    type: "unit";
    controller?: "friendly" | "enemy";
    location?: Location;
    quantity?: "all" | number | { upTo: number };
    filter?: string;
  } = { type: "unit" };

  if (lower.includes("enemy")) {
    target.controller = "enemy";
  } else if (lower.includes("friendly")) {
    target.controller = "friendly";
  }

  if (lower.includes("all ") || lower.includes("each ")) {
    target.quantity = "all";
  }
  const upToMatch = lower.match(/up to (\w+)/);
  if (upToMatch) {
    const numWord = upToMatch[1];
    const wordMap: Record<string, number> = {
      eight: 8,
      five: 5,
      four: 4,
      nine: 9,
      one: 1,
      seven: 7,
      six: 6,
      ten: 10,
      three: 3,
      two: 2,
    };
    target.quantity = { upTo: wordMap[numWord] ?? (Number.parseInt(numWord, 10) || 1) };
  }

  if (
    lower.includes("at a battlefield") ||
    lower.includes("at battlefields") ||
    lower.includes("at my battlefield")
  ) {
    target.location = "battlefield";
  } else if (
    lower.includes("in a base") ||
    lower.includes("at base") ||
    lower.includes("in base")
  ) {
    target.location = "base";
  } else if (lower.includes("here") || lower.includes("at the same location")) {
    target.location = "here" as Location;
  }

  if (lower.includes("damaged")) {
    target.filter = "damaged";
  } else if (lower.includes("stunned")) {
    target.filter = "stunned";
  } else if (lower.includes("[mighty]")) {
    target.filter = "mighty";
  }

  return target;
}

/**
 * Try to parse a damage effect: "Deal N to TARGET."
 */
function parseDamageEffect(text: string): DamageEffect | undefined {
  // Handle "deal N damage split among" pattern
  const splitMatch = text.match(/^Deal (\d+) damage split among (.+?)\.?$/i);
  if (splitMatch) {
    const amount = Number.parseInt(splitMatch[1], 10);
    const target = parseCardTarget(splitMatch[2]);
    return { amount, split: true, target: target as AnyTarget, type: "damage" } as DamageEffect;
  }

  // Handle "deal damage equal to my/its Might/[Assault]/[keyword] to TARGET" pattern
  const mightDamageMatch = text.match(
    /^Deal damage equal to (?:my|its|his|her)\s+(?:Might|\[\w+(?:-\w+)?\])\s+to\s+(.+?)\.?$/i,
  );
  if (mightDamageMatch) {
    const target = parseCardTarget(mightDamageMatch[1]);
    return {
      amount: { might: "self" },
      target: target as AnyTarget,
      type: "damage",
    } as DamageEffect;
  }

  // Handle "Deal N to TARGET" pattern
  const match = text.match(/^Deal (\d+) to (.+?)\.?$/i);
  if (match) {
    const amount = Number.parseInt(match[1], 10);
    const target = parseCardTarget(match[2]);
    return { amount, target: target as AnyTarget, type: "damage" };
  }

  return undefined;
}

/**
 * Try to parse a modify-might effect: "Give TARGET +/-N :rb_might: this turn[, to a minimum of M :rb_might:]."
 */
function parseModifyMightEffect(text: string): ModifyMightEffect | SequenceEffect | undefined {
  // Handle "Give a unit with the named tag +/-N :rb_might: this turn." (The List)
  const namedTagMatch = text.match(
    /^Give (?:a|an) unit with the named tag\s+([+-]\d+)\s*:rb_might:\s*(this turn)?\.?$/i,
  );
  if (namedTagMatch) {
    const amount = Number.parseInt(namedTagMatch[1], 10);
    const effect: {
      type: "modify-might";
      amount: number;
      target: AnyTarget;
      duration?: "turn";
    } = {
      amount,
      target: { filter: { tag: "named" }, type: "unit" } as AnyTarget,
      type: "modify-might",
    };
    if (namedTagMatch[2]) {
      effect.duration = "turn";
    }
    return effect as ModifyMightEffect;
  }

  // Handle compound: "Give TARGET1 +N :rb_might: this turn and another TARGET2 -M :rb_might: this turn."
  const compoundMatch = text.match(
    /^Give ((?:a|an|another|two|three|four|five|\d+)?\s*(?:friendly |enemy |attacking enemy )?(?:unit|units|me|it)(?:\s+(?:at a battlefield|here|there))?)\s+(?:each\s+)?([+-]\d+)\s*:rb_might:\s*(this turn)?(?:,?\s*(?:to a minimum of (\d+)\s*:rb_might:))?\s+and\s+(?:another\s+)?((?:a|an|another|two|three|four|five|\d+)?\s*(?:friendly |enemy |attacking enemy )?(?:unit|units|me|it)(?:\s+(?:at a battlefield|here|there))?)\s+([+-]\d+)\s*:rb_might:\s*(this turn)?(?:,?\s*(?:to a minimum of (\d+)\s*:rb_might:))?\.?$/i,
  );
  if (compoundMatch) {
    const effect1: {
      type: "modify-might";
      amount: number;
      target: AnyTarget;
      duration?: "turn";
      minimum?: number;
    } = {
      amount: Number.parseInt(compoundMatch[2], 10),
      target: parseTarget(compoundMatch[1]),
      type: "modify-might",
    };
    if (compoundMatch[3]) {
      effect1.duration = "turn";
    }
    if (compoundMatch[4] !== undefined) {
      effect1.minimum = Number.parseInt(compoundMatch[4], 10);
    }

    const effect2: {
      type: "modify-might";
      amount: number;
      target: AnyTarget;
      duration?: "turn";
      minimum?: number;
    } = {
      amount: Number.parseInt(compoundMatch[6], 10),
      target: parseTarget(compoundMatch[5]),
      type: "modify-might",
    };
    if (compoundMatch[7]) {
      effect2.duration = "turn";
    }
    if (compoundMatch[8] !== undefined) {
      effect2.minimum = Number.parseInt(compoundMatch[8], 10);
    }

    return {
      effects: [effect1 as Effect, effect2 as Effect],
      type: "sequence",
    } as SequenceEffect;
  }

  // Handle "Give TARGET each +N" and standard "Give TARGET +N"
  // The trailing "instead" modifier (used by [Level N] gated effects) is
  // Accepted and dropped; it's purely a text-level connector back to the
  // Base-level effect it replaces.
  const match = text.match(
    /^Give ((?:a|an|another|two|three|four|five|\d+)?\s*(?:friendly |enemy |attacking enemy )?(?:unit|units|me|it)(?:\s+(?:at a battlefield|here|there))?|your\s+\w+(?:\s+\w+)?)\s+(?:each\s+)?([+-]\d+)\s*:rb_might:\s*(this turn)?(?:,?\s*(?:to a minimum of (\d+)\s*:rb_might:))?(?:\s+instead)?\.?$/i,
  );
  if (!match) {
    return undefined;
  }

  const targetStr = match[1];
  const amount = Number.parseInt(match[2], 10);
  const durationStr = match[3];
  const minimumStr = match[4];

  // Parse target - check for tribal "your TAG" pattern
  let target: AnyTarget;
  const tribalMatch = targetStr.match(/^your\s+(.+)$/i);
  if (tribalMatch) {
    const tribeName = tribalMatch[1].trim();
    target = { controller: "friendly", filter: { tag: tribeName }, type: "unit" } as AnyTarget;
  } else {
    // Extract leading quantity word (two, three, etc.) before passing to parseTarget
    const quantityMatch = targetStr.match(
      /^(two|three|four|five|six|\d+)\s+((?:friendly |enemy |attacking enemy )?(?:unit|units).*)$/i,
    );
    if (quantityMatch) {
      const qty = wordToNumber(quantityMatch[1]);
      const restTarget = quantityMatch[2];
      target = parseTarget(restTarget);
      if (typeof target === "object" && target !== null && "type" in target) {
        (target as { quantity: number }).quantity = qty;
      }
    } else {
      target = parseTarget(targetStr);
    }
  }
  const effect: {
    type: "modify-might";
    amount: number;
    target: AnyTarget;
    duration?: "turn";
    minimum?: number;
  } = {
    amount,
    target,
    type: "modify-might",
  };

  if (durationStr) {
    effect.duration = "turn";
  }
  if (minimumStr !== undefined) {
    effect.minimum = Number.parseInt(minimumStr, 10);
  }

  return effect as ModifyMightEffect;
}

/**
 * Try to parse a kill effect: "Kill TARGET."
 *
 * Handles:
 * - "Kill me." / "Kill this." (self-kill)
 * - "Kill a/an/all [filter] [controller] unit/gear [location] [with ...]." (targeted kill)
 * - "Kill up to N gear." (quantity kill)
 * - "Each player kills one of their units/gear." (symmetric each-player kill)
 * - "Kill me to EFFECT." (self-sacrifice sequence)
 */
function parseKillEffect(text: string): KillEffect | SequenceEffect | undefined {
  // Handle "kill me/this to EFFECT" as a sequence: kill self, then another effect
  const killToMatch = text.match(/^Kill (me|this) to (.+?)\.?$/i);
  if (killToMatch) {
    const killSelf: KillEffect = { target: "self" as AnyTarget, type: "kill" };
    const thenText = killToMatch[2].trim();
    // Capitalize first letter for the sub-effect parser
    const normalizedThen = thenText.charAt(0).toUpperCase() + thenText.slice(1);
    const thenEffect = parseEffect(normalizedThen);
    if (thenEffect) {
      return { effects: [killSelf, thenEffect], type: "sequence" };
    }
    // If the "then" part can't be parsed, fall through to treat as simple kill
  }

  // Handle self-kill: "Kill me." / "Kill this."
  if (/^Kill (me|this)\.?$/i.test(text)) {
    return { target: "self" as AnyTarget, type: "kill" };
  }

  // Handle pronoun-referential kill: "Kill it."
  // Used inside replacement bodies and chained sequences where the subject
  // Was bound by an earlier step (e.g., "When any unit takes damage this
  // Turn, kill it"). The resolver treats this as a generic unit target.
  if (/^Kill (it|them)\.?$/i.test(text)) {
    return { target: { type: "unit" } as AnyTarget, type: "kill" };
  }

  // Handle "Each player [must] kills/kill one of their units/gear."
  const eachPlayerMatch = text.match(
    /^Each player (?:must\s+)?kills?\s+one of their (units?|gear)\.?$/i,
  );
  if (eachPlayerMatch) {
    const cardType = eachPlayerMatch[1].replace(/s$/, "") as "unit" | "gear";
    return {
      player: "each",
      target: { type: cardType } as unknown as AnyTarget,
      type: "kill",
    };
  }

  // Handle kill with filters/conditions: "kill all damaged enemy units here."
  // Also handles: "Kill a friendly [Mighty] unit.", "Kill an enemy unit here.",
  // "Kill up to one gear.", "Kill up to N units."
  const richMatch = text.match(
    /^Kill ((?:a|an|all|any number of|up to (?:one|two|three|four|five|\d+))\s+(?:damaged\s+|stunned\s+|\[Mighty\]\s+)?(?:friendly\s+|enemy\s+)?(?:\[Mighty\]\s+)?(?:unit|units|gear)(?:\s+(?:at a battlefield|here|there))?)(?:\s+with\s+.+)?\.?$/i,
  );
  if (richMatch) {
    const targetStr = richMatch[1];
    // Check if it looks like a gear target
    if (/gear/i.test(targetStr)) {
      const gearTarget: {
        type: "gear";
        controller?: "friendly" | "enemy";
        quantity?: "all" | { upTo: number };
      } = {
        type: "gear" as const,
      };
      if (/enemy/i.test(targetStr)) {
        gearTarget.controller = "enemy";
      } else if (/friendly/i.test(targetStr)) {
        gearTarget.controller = "friendly";
      }
      if (/all/i.test(targetStr)) {
        gearTarget.quantity = "all";
      }
      const upToGearMatch = targetStr.match(/up to (\w+)/i);
      if (upToGearMatch) {
        gearTarget.quantity = { upTo: wordToNumber(upToGearMatch[1]) };
      }
      return { target: gearTarget as unknown as AnyTarget, type: "kill" };
    }
    // Use parseCardTarget for unit targets (handles controller, location, quantity, filter)
    const target = parseCardTarget(targetStr);
    return { target: target as AnyTarget, type: "kill" };
  }

  return undefined;
}

/**
 * Try to parse a stun effect: "Stun TARGET."
 *
 * Handles:
 * - "Stun me." / "Stun it." (self/source references)
 * - "Stun a unit." / "Stun an enemy unit."
 * - "Stun another friendly unit."
 * - "Stun all enemy units here."
 * - "Stun an attacking [enemy] unit."
 * - "Stun an enemy unit at a battlefield."
 * - "Stun a friendly unit and an enemy unit..." (delegated to and-compound)
 */
function parseStunEffect(text: string): StunEffect | undefined {
  // Self references: "Stun me." / "Stun it."
  if (/^Stun (me|it)\.?$/i.test(text)) {
    const selfMatch = text.match(/^Stun (me|it)\.?$/i);
    const ref = selfMatch?.[1].toLowerCase();
    if (ref === "me") {
      return { target: "self" as AnyTarget, type: "stun" };
    }
    return { target: { type: "unit" } as AnyTarget, type: "stun" };
  }

  const match = text.match(
    /^Stun ((?:(?:all|another)\s+)?(?:a|an)?\s*(?:attacking\s+)?(?:friendly |enemy )?(?:attacking\s+)?(?:unit|units)(?:\s+(?:at a battlefield|at its location|here|there))?)\.?$/i,
  );
  if (!match) {
    return undefined;
  }
  const targetStr = match[1].toLowerCase().trim();
  const target: {
    type: "unit";
    controller?: "friendly" | "enemy";
    location?: Location;
    filter?: { state: string };
    quantity?: "all";
    excludeSelf?: boolean;
  } = { type: "unit" };

  if (targetStr.includes("enemy")) {
    target.controller = "enemy";
  } else if (targetStr.includes("friendly")) {
    target.controller = "friendly";
  }
  if (targetStr.includes("here")) {
    target.location = "here" as Location;
  } else if (targetStr.includes("at a battlefield")) {
    target.location = "battlefield";
  } else if (targetStr.includes("at its location")) {
    // "at its location" — scoped to the previously mentioned target's spot.
    // Encoded as "here" on the location axis; effect executor resolves
    // Relative to the current target context.
    target.location = "here" as Location;
  }
  if (targetStr.includes("attacking")) {
    target.filter = { state: "attacking" };
  }
  if (/^all\b/.test(targetStr)) {
    target.quantity = "all";
  } else if (/^another\b/.test(targetStr)) {
    target.excludeSelf = true;
  }
  return { target: target as AnyTarget, type: "stun" };
}

// ============================================================================
// Attach / Detach (Equipment) Effect Parsers
// ============================================================================

/**
 * Build an equipment-target from a captured string describing the equipment.
 * Handles "this"/"it"/"me" (self), and "a/an [detached|attached] Equipment [you control]".
 */
function parseEquipmentTargetLocal(text: string): AnyTarget {
  const lower = text.toLowerCase().trim();

  if (lower === "this" || lower === "it" || lower === "me") {
    return "self" as AnyTarget;
  }

  const target: {
    type: "equipment";
    controller?: "friendly" | "enemy";
    filter?: "detached" | "attached";
  } = { type: "equipment" };

  if (lower.includes("you control") || lower.includes("friendly")) {
    target.controller = "friendly";
  } else if (lower.includes("enemy")) {
    target.controller = "enemy";
  }

  if (lower.includes("detached")) {
    target.filter = "detached";
  } else if (lower.includes("attached")) {
    target.filter = "attached";
  }

  return target as AnyTarget;
}

/**
 * Build a unit-target (the attachment destination) from a captured string.
 * Handles "a unit you control" / "a friendly/enemy unit" / "me"/"it".
 */
function parseAttachUnitTargetLocal(text: string): AnyTarget {
  const lower = text.toLowerCase().trim();

  if (lower === "me") {
    return "self" as AnyTarget;
  }
  if (lower === "it") {
    // "it" in a trigger context refers to the trigger-source unit; resolve at runtime.
    return { type: "unit" } as AnyTarget;
  }

  const target: {
    type: "unit";
    controller?: "friendly" | "enemy";
    location?: Location;
  } = { type: "unit" };

  if (lower.includes("you control") || lower.includes("friendly")) {
    target.controller = "friendly";
  } else if (lower.includes("enemy")) {
    target.controller = "enemy";
  }

  if (lower.includes("here")) {
    target.location = "here" as Location;
  } else if (lower.includes("at a battlefield")) {
    target.location = "battlefield";
  } else if (lower.includes("there")) {
    target.location = "there" as Location;
  }

  return target as AnyTarget;
}

/**
 * Try to parse an attach effect.
 *
 * Handles:
 * - "Attach this to a unit you control."
 * - "Attach it to a unit you control." (trigger / reminder context)
 * - "attach it to a unit you control." (lowercase from trigger body)
 * - "Attach an Equipment you control to a unit you control."
 * - "Attach a detached Equipment you control to a unit you control."
 * - "Attach an attached Equipment you control to a unit you control."
 * - "Attach an Equipment to me."
 * - Trailing "(here)" location annotations are tolerated.
 */
function parseAttachEffect(text: string): Effect | undefined {
  const match = text.match(
    /^(?:then\s+)?attach\s+(this|it|me|(?:a|an)\s+(?:detached\s+|attached\s+)?(?:friendly\s+|enemy\s+)?[Ee]quipment(?:\s+you\s+control)?)\s+to\s+((?:a|an)\s+(?:friendly\s+|enemy\s+)?unit(?:\s+you\s+control)?(?:\s+(?:here|at\s+a\s+battlefield|there))?|me|it)(?:\s+\(here\))?\.?$/i,
  );
  if (!match) {
    return undefined;
  }

  const equipmentStr = match[1];
  const unitStr = match[2];

  const equipment = parseEquipmentTargetLocal(equipmentStr);
  const to = parseAttachUnitTargetLocal(unitStr);

  return {
    equipment,
    to,
    type: "attach",
  } as unknown as Effect;
}

/**
 * Try to parse a detach effect.
 *
 * Handles:
 * - "Detach an Equipment."
 * - "detach an Equipment from it." (e.g., "Then detach an Equipment from it.")
 * - "Detach a friendly Equipment from a unit you control."
 */
function parseDetachEffect(text: string): Effect | undefined {
  const match = text.match(
    /^(?:then\s+)?detach\s+((?:a|an|that|the)\s+(?:friendly\s+|enemy\s+)?[Ee]quipment(?:\s+you\s+control)?|it|this)(?:\s+from\s+(?:(?:a|an)\s+(?:friendly\s+|enemy\s+)?unit(?:\s+you\s+control)?|it|me))?\.?$/i,
  );
  if (!match) {
    return undefined;
  }

  const equipmentStr = match[1];
  const equipment = parseEquipmentTargetLocal(equipmentStr);

  return {
    equipment,
    type: "detach",
  } as unknown as Effect;
}

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
function parseBanishEffect(text: string): BanishEffect | undefined {
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
 * Try to parse a move effect: "Move TARGET [to LOCATION]."
 */
function parseMoveEffect(text: string): MoveEffect | undefined {
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
  const anyNumberMatch = text.match(
    /^Move any number of (your |friendly |enemy )?((?:\w+\s+)?units?)(?:\s+at a battlefield)?\s+to\s+(base|here|its base|your base|their base|a battlefield|battlefield|this battlefield|an open battlefield|a single location)\.?$/i,
  );
  if (anyNumberMatch) {
    const controllerRaw = anyNumberMatch[1]?.trim().toLowerCase();
    const target: { type: "unit"; controller?: "friendly" | "enemy"; quantity: "all" } = {
      quantity: "all",
      type: "unit",
    };
    if (controllerRaw === "your" || controllerRaw === "friendly") {
      target.controller = "friendly";
    } else if (controllerRaw === "enemy") {
      target.controller = "enemy";
    }
    const to = parseLocationString(anyNumberMatch[3]);
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
    /^Move (?:(another)\s+)?(a|an|up to (?:one|two|three|four|five|\d+))\s+(attacking enemy |attacking |friendly |enemy )?(units?)(?:\s+(?:at a battlefield|here|there))?(?:\s+from\s+(a battlefield|battlefield|here|its base|your base|base))?(?:\s+to\s+(base|here|its base|your base|their base|a battlefield|battlefield|this battlefield|the same battlefield|that battlefield|an open battlefield|a battlefield you control))?(?:\s+and ready (?:it|them))?\.?$/i,
  );
  if (basicMatch) {
    const another = basicMatch[1];
    const quantityStr = basicMatch[2].toLowerCase();
    const controllerStr = basicMatch[3]?.trim().toLowerCase();
    const fromStr = basicMatch[5];
    const destStr = basicMatch[6];

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

    const upToNumMatch = quantityStr.match(/^up to (one|two|three|four|five|\d+)$/);
    if (upToNumMatch) {
      target.quantity = { upTo: wordToNumber(upToNumMatch[1]) };
    }

    const to: Location = destStr ? parseLocationString(destStr) : "base";

    const effect: MoveEffect = { target: target as AnyTarget, to, type: "move" };
    if (fromStr) {
      return { ...effect, from: parseLocationString(fromStr) } as MoveEffect;
    }
    return effect;
  }

  // Flexible fallback for sentences that have extra trailing clauses
  // E.g., "Move a unit you control to a battlefield you control..."
  const flexMoveMatch = text.match(
    /^Move (a|an|another) (friendly |enemy )?(unit|units|gear)(?:\s+you control)?(?:\s+to\s+(base|here|its base|your base|a battlefield|battlefield|the same battlefield|a battlefield you control))?(?:\s+.*)$/i,
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
    const to: Location = toStr ? parseLocationString(toStr) : "base";
    return { target: target as AnyTarget, to, type: "move" } as MoveEffect;
  }

  return undefined;
}

/**
 * Try to parse a return-to-hand effect: "Return TARGET to owner's hand."
 */
function parseReturnToHandEffect(text: string): ReturnToHandEffect | undefined {
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
function parseRecallEffect(text: string): RecallEffect | undefined {
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

/**
 * Try to parse a ready effect: "Ready TARGET."
 */
function parseReadyEffect(text: string): Effect | undefined {
  // Pattern: "Ready [all/up to N/another] [controller] [TAG] TARGET [here]."
  // The broad alternation accepts:
  //   - pronouns: me, it, them
  //   - possessive plurals: your units, your runes
  //   - "something else" fallback
  //   - "up to N of them"
  //   - quantified/qualified targets ending in a card type OR a tag word (e.g., "Mech")
  const match = text.match(
    /^Ready (me|it|them|(?:(?:all|up to (?:two|three|four|five|six|\d+)|another)\s+)?(?:a |an )?(?:friendly |enemy |your )?(?:\w+\s+)*?(?:unit|units|gear|gears|legend|legends|rune|runes|equipment|card|permanent|[A-Z]\w*)(?:s)?(?:\s+(?:here|at a battlefield|there))?|your units|your runes|your legend|something else(?:\s+that's exhausted)?|up to (?:two|three|four|five|six|\d+) of them)\.?$/i,
  );
  if (!match) {
    return undefined;
  }
  const targetText = match[1].trim();
  const targetLower = targetText.toLowerCase();
  let target: AnyTarget;

  if (targetLower === "me") {
    target = "self";
  } else if (targetLower === "it" || targetLower === "them") {
    target = { type: "unit" as const } as AnyTarget;
  } else if (targetLower === "your units") {
    target = {
      controller: "friendly" as const,
      quantity: "all" as const,
      type: "unit" as const,
    } as AnyTarget;
  } else if (targetLower === "your runes") {
    target = {
      controller: "friendly" as const,
      quantity: "all" as const,
      type: "rune" as const,
    } as AnyTarget;
  } else if (targetLower === "your legend") {
    target = {
      controller: "friendly" as const,
      type: "legend" as const,
    } as AnyTarget;
  } else if (/^something else/i.test(targetLower)) {
    target = { type: "unit" as const } as AnyTarget;
  } else {
    // Handle "up to N of them" pronoun pattern
    const upToThemMatch = targetText.match(/^up to (\w+) of them$/i);
    if (upToThemMatch) {
      const quantity = { upTo: wordToNumber(upToThemMatch[1]) };
      target = { quantity, type: "unit" as const } as AnyTarget;
    } else {
      // Handle "all [controller] targets [location]" prefix
      const allMatch = targetText.match(/^all\s+(.+)$/i);
      if (allMatch) {
        const baseTarget = parseTarget(allMatch[1]) as Target;
        target = { ...baseTarget, quantity: "all" as const } as AnyTarget;
      } else {
        // Parse "up to N [word] ..." quantity prefix
        const upToMatch = targetText.match(/^up to (\w+)\s+(.+)$/i);
        if (upToMatch) {
          const quantity = { upTo: wordToNumber(upToMatch[1]) };
          const rest = upToMatch[2];
          const baseTarget = parseTarget(rest) as Target;
          target = { ...baseTarget, quantity } as AnyTarget;
        } else {
          // Parse "another [friendly] [Tag] [type]" patterns
          const anotherMatch = targetText.match(/^another\s+(.+)$/i);
          if (anotherMatch) {
            const baseTarget = parseTarget(anotherMatch[1]) as Target;
            target = { ...baseTarget, excludeSelf: true } as AnyTarget;
          } else {
            target = parseTarget(targetText);
          }
        }
      }
    }
  }
  return { target, type: "ready" };
}

/**
 * Try to parse a heal effect: "Heal TARGET." / "Heal it." / "Heal all friendly units."
 *
 * Heal removes damage counters. Used mostly inside replacement effects and
 * reaction spells like Highlander and Tactical Retreat
 * ("heal it, exhaust it, and recall it").
 */
function parseHealEffect(text: string): Effect | undefined {
  const match = text.match(
    /^Heal (me|it|them|(?:all\s+)?(?:friendly |enemy |your )?(?:unit|units|gear)(?:\s+(?:here|at a battlefield|there))?)\.?$/i,
  );
  if (!match) {
    return undefined;
  }
  const raw = match[1].trim().toLowerCase();
  let target: AnyTarget;
  if (raw === "me") {
    target = "self";
  } else if (raw === "it" || raw === "them") {
    target = { type: "unit" } as AnyTarget;
  } else {
    target = parseTarget(match[1]);
  }
  return { amount: "all", target, type: "heal" } as Effect;
}

/**
 * Try to parse an exhaust effect: "Exhaust TARGET."
 */
function parseExhaustEffect(text: string): Effect | undefined {
  // Compound: "exhaust this/me to <effect>" — sequence of self-exhaust + inner effect.
  // Used by gear like Fresh Beans: "you may exhaust this to draw 1".
  const exhaustToMatch = text.match(/^exhaust (?:this|me|myself) to (.+?)\.?$/i);
  if (exhaustToMatch) {
    const innerText = `${exhaustToMatch[1]}.`;
    const inner = parseEffect(innerText);
    if (inner) {
      return {
        effects: [{ target: "self" as AnyTarget, type: "exhaust" }, inner],
        type: "sequence",
      } as SequenceEffect;
    }
  }

  // Pattern: "Exhaust [all/another] [controller] [TAG] TARGET [here/at a battlefield] [you control]."
  const match = text.match(
    /^Exhaust (me|it|(?:(?:all|another)\s+)?(?:a |an )?(?:friendly |enemy )?(?:\w+\s+)*?(?:unit|units|gear|gears|legend|legends|rune|runes|equipment|card|permanent|[A-Z]\w*)(?:s)?(?:\s+(?:here|at a battlefield|there))?(?:\s+you control)?)\.?$/i,
  );
  if (!match) {
    return undefined;
  }
  const targetText = match[1].trim();
  const targetLower = targetText.toLowerCase();
  let target: AnyTarget;

  if (targetLower === "me") {
    target = "self";
  } else if (targetLower === "it") {
    target = { type: "unit" as const } as AnyTarget;
  } else {
    // Strip "you control" suffix and treat as "friendly"
    let cleaned = targetText;
    let youControl = false;
    const youControlMatch = cleaned.match(/^(.+?)\s+you control$/i);
    if (youControlMatch) {
      cleaned = youControlMatch[1];
      youControl = true;
    }

    // Check for "all" prefix
    const allMatch = cleaned.match(/^all\s+(.+)$/i);
    if (allMatch) {
      const baseTarget = parseTarget(allMatch[1]) as Target;
      target = { ...baseTarget, quantity: "all" as const } as AnyTarget;
    } else {
      // Check for "another" prefix
      const anotherMatch = cleaned.match(/^another\s+(.+)$/i);
      if (anotherMatch) {
        const baseTarget = parseTarget(anotherMatch[1]) as Target;
        target = { ...baseTarget, excludeSelf: true } as AnyTarget;
      } else {
        target = parseTarget(cleaned);
      }
    }

    // Apply "you control" as friendly controller
    if (youControl && typeof target === "object" && !("controller" in target)) {
      target = { ...target, controller: "friendly" as const } as AnyTarget;
    }
  }
  return { target, type: "exhaust" };
}

/**
 * Target portion for grant-keyword "Give TARGET ..." patterns.
 * Matches: "a unit", "a friendly unit", "it", "me", "them", "your other units here",
 * "your token units", "your units here", "one of your other units here",
 * "another friendly unit at a battlefield", etc.
 */
const GRANT_TARGET_RE =
  String.raw`(?:(?:one of\s+)?(?:(?:a|an|another|all|your other|your|its owner's|my|other)\s+)*` +
  "(?:friendly |enemy )?" +
  String.raw`(?:(?:\w+\s+)*?)` +
  "(?:unit|units|gear|gears|legend|legends|me|it|them)" +
  String.raw`(?:\s+(?:at a battlefield|here|there))?)`;

/**
 * Resolve a grant-keyword target string into an AnyTarget.
 */
function resolveGrantTarget(rawTargetStr: string): AnyTarget {
  const targetStr = rawTargetStr.trim();
  const lower = targetStr.toLowerCase();

  if (lower === "me") {
    return "self";
  }
  if (lower === "it" || lower === "them") {
    return { type: "unit" } as AnyTarget;
  }

  // Strip leading "one of"
  const cleaned = targetStr.replace(/^one of\s+/i, "");

  // Handle "your [other] units ..." / "your token units" / "your other units here"
  const yourMatch = cleaned.match(
    /^(?:your|my)\s+(other\s+)?(?:(\w+)\s+)?(unit|units|gear|gears|legend|legends)(?:\s+(here|at a battlefield|there))?$/i,
  );
  if (yourMatch) {
    const otherStr = yourMatch[1];
    const tagStr = yourMatch[2];
    const typeStr = yourMatch[3].toLowerCase().replace(/s$/, "");
    const isPlural = yourMatch[3].toLowerCase().endsWith("s");
    const locationStr = yourMatch[4];
    const result: Record<string, unknown> = {
      controller: "friendly",
      type: typeStr,
    };
    if (isPlural) {
      result.quantity = "all";
    }
    if (otherStr) {
      result.excludeSelf = true;
    }
    if (tagStr && tagStr.length > 0 && tagStr.toLowerCase() !== "other") {
      result.filter = { tag: tagStr.charAt(0).toUpperCase() + tagStr.slice(1).toLowerCase() };
    }
    if (locationStr) {
      if (locationStr.toLowerCase() === "here") {
        result.location = "here";
      } else if (locationStr.toLowerCase() === "at a battlefield") {
        result.location = "battlefield";
      }
    }
    return result as AnyTarget;
  }

  // Handle "another friendly unit", "all enemy units here", etc.
  const quantifierMatch = cleaned.match(
    /^(another|all)\s+((?:friendly |enemy )?(?:unit|units|gear|gears)(?:\s+(?:here|at a battlefield|there))?)$/i,
  );
  if (quantifierMatch) {
    const qualifier = quantifierMatch[1].toLowerCase();
    const rest = quantifierMatch[2];
    const baseTarget = parseTarget(rest) as Target;
    if (qualifier === "all") {
      return { ...baseTarget, quantity: "all" } as AnyTarget;
    }
    return { ...baseTarget, excludeSelf: true } as AnyTarget;
  }

  // Fallback: use parseTarget
  return parseTarget(cleaned);
}

/**
 * Parse a duration string suffix into a grant-keyword duration.
 * Returns undefined if no matching duration (permanent).
 */
function parseGrantDuration(text: string | undefined): "turn" | "combat" | undefined {
  if (!text) {
    return undefined;
  }
  const lower = text.toLowerCase();
  if (lower.includes("combat")) {
    return "combat" as "turn";
  }
  if (lower.includes("turn")) {
    return "turn";
  }
  return undefined;
}

/**
 * Try to parse a grant-keyword effect: "Give TARGET [KEYWORD] this turn."
 *
 * Handles:
 * - "Give a unit [Assault]" (no duration)
 * - "Give a friendly unit [Tank] this turn."
 * - "Give a unit [Assault 3] this turn."
 * - "Give me [Ganking] this turn."
 * - "Give your other units here [Shield] this turn."
 * - "Give your token units [Tank]."
 * - "Give one of your other units here +N [Might] and [Tank] this turn." (via and-compound)
 * - "It has [Evasive]." (source reference)
 * - "It gains [Shield 2] this combat."
 * - "Friendly units have [Shield]." (static aura)
 */
function parseGrantKeywordEffect(text: string): GrantKeywordEffect | undefined {
  // Handle "Give TARGET [KEYWORD N] [this turn/combat]." with optional value
  const giveRe = new RegExp(
    `^Give (${GRANT_TARGET_RE})\\s+\\[(\\w+(?:-\\w+)?)(?:\\s+(\\d+))?\\]\\s*(this turn|this combat)?\\.?$`,
    "i",
  );
  const match = text.match(giveRe);
  if (match) {
    const target = resolveGrantTarget(match[1]);
    const keyword = match[2];
    const valueStr = match[3];
    const duration = parseGrantDuration(match[4]);
    const effect: {
      type: "grant-keyword";
      keyword: string;
      target: AnyTarget;
      value?: number;
      duration?: "turn" | "combat";
    } = {
      keyword,
      target,
      type: "grant-keyword",
    };
    if (valueStr) {
      effect.value = Number.parseInt(valueStr, 10);
    }
    if (duration) {
      effect.duration = duration;
    }
    return effect as GrantKeywordEffect;
  }

  // "It has [Keyword]." / "It gains [Keyword N] this combat/turn." — source reference
  const itHasMatch = text.match(
    /^It (?:has|gains?) \[(\w+(?:-\w+)?)(?:\s+(\d+))?\]\s*(this turn|this combat)?\.?$/i,
  );
  if (itHasMatch) {
    const keyword = itHasMatch[1];
    const valueStr = itHasMatch[2];
    const duration = parseGrantDuration(itHasMatch[3]);
    const effect: {
      type: "grant-keyword";
      keyword: string;
      target: AnyTarget;
      value?: number;
      duration?: "turn" | "combat";
    } = {
      keyword,
      target: { type: "unit" } as AnyTarget,
      type: "grant-keyword",
    };
    if (valueStr) {
      effect.value = Number.parseInt(valueStr, 10);
    }
    if (duration) {
      effect.duration = duration;
    }
    return effect as GrantKeywordEffect;
  }

  // Handle "choose a unit. It gains [KEYWORD N] this combat/turn." pattern
  const chooseGainsMatch = text.match(
    /^choose a (?:friendly |enemy )?(?:unit|gear)\.\s*It gains \[(\w+(?:-\w+)?)\s*(\d+)?\]\s*(this (?:turn|combat))?\.?$/i,
  );
  if (chooseGainsMatch) {
    const keyword = chooseGainsMatch[1];
    const valueStr = chooseGainsMatch[2];
    const durationStr = chooseGainsMatch[3];
    const effect: {
      type: "grant-keyword";
      keyword: string;
      target: AnyTarget;
      value?: number;
      duration?: "turn" | "combat";
    } = {
      keyword,
      target: { type: "unit" } as AnyTarget,
      type: "grant-keyword",
    };
    if (valueStr) {
      effect.value = Number.parseInt(valueStr, 10);
    }
    if (durationStr) {
      effect.duration = durationStr.includes("combat") ? ("combat" as "turn") : "turn";
    }
    return effect as GrantKeywordEffect;
  }

  // Static aura: "Friendly units have [Keyword]." / "Your token units have [Tank]."
  const hasMatch = text.match(
    /^(?:(Friendly|Enemy|Your|Your other|Other friendly|Other enemy)\s+)(?:(\w+)\s+)?(unit|units|gear|gears)\s+have\s+\[(\w+(?:-\w+)?)(?:\s+(\d+))?\]\.?$/i,
  );
  if (hasMatch) {
    const qualifier = hasMatch[1].toLowerCase();
    const tagStr = hasMatch[2];
    const typeStr = hasMatch[3].toLowerCase().replace(/s$/, "");
    const keyword = hasMatch[4];
    const valueStr = hasMatch[5];
    const result: Record<string, unknown> = { quantity: "all", type: typeStr };
    if (qualifier.includes("friendly") || qualifier.includes("your")) {
      result.controller = "friendly";
    } else if (qualifier.includes("enemy")) {
      result.controller = "enemy";
    }
    if (qualifier.includes("other")) {
      result.excludeSelf = true;
    }
    if (tagStr && tagStr.length > 0) {
      result.filter = { tag: tagStr.charAt(0).toUpperCase() + tagStr.slice(1).toLowerCase() };
    }
    const effect: {
      type: "grant-keyword";
      keyword: string;
      target: AnyTarget;
      value?: number;
    } = {
      keyword,
      target: result as AnyTarget,
      type: "grant-keyword",
    };
    if (valueStr) {
      effect.value = Number.parseInt(valueStr, 10);
    }
    return effect as GrantKeywordEffect;
  }

  return undefined;
}

/**
 * Try to parse a counter effect: "Counter a spell."
 */
function parseCounterEffect(text: string): CounterEffect | undefined {
  // Handle "Counter a spell unless its controller pays :rb_energy_N:" pattern
  const unlessMatch = text.match(
    /^Counter (a spell|an? .+spell.*?) unless its controller pays (.+?)\.?$/i,
  );
  if (unlessMatch) {
    const costStr = unlessMatch[2];
    const unless = parseCost(costStr);
    return { type: "counter", unless } as CounterEffect;
  }

  const match = text.match(/^Counter (a spell.*|an? .+spell.*|that spell.*)\.?$/i);
  if (!match) {
    return undefined;
  }
  return { type: "counter" };
}

/**
 * Try to parse a look effect: "Look at the top N cards of your DECK."
 */
function parseLookEffect(text: string): LookEffect | undefined {
  const match = text.match(/^Look at the top (\d+) cards? of your (Main Deck|Rune Deck|deck)\.?/i);
  if (!match) {
    return undefined;
  }
  const amount = Number.parseInt(match[1], 10);
  const from = match[2].toLowerCase() === "rune deck" ? ("rune-deck" as const) : ("deck" as const);
  return { amount, from, type: "look" };
}

/**
 * Try to parse a fight effect
 */
function parseFightEffect(text: string): FightEffect | undefined {
  if (/deal damage equal to their Mights to each other\.?$/i.test(text)) {
    return {
      attacker: { controller: "friendly", type: "unit" } as AnyTarget,
      defender: { controller: "enemy", type: "unit" } as AnyTarget,
      type: "fight",
    };
  }
  return undefined;
}

/**
 * Try to parse a prevent-damage effect
 */
function parsePreventDamageEffect(text: string): PreventDamageEffect | undefined {
  const match = text.match(/^Prevent (all|the next)\s*(?:(\w+(?:\s+and\s+\w+)?)\s+)?damage/i);
  if (!match) {
    return undefined;
  }
  const effect: { type: "prevent-damage"; amount?: "all"; duration?: "turn" | "next" } = {
    type: "prevent-damage",
  };
  if (match[1].toLowerCase() === "all") {
    effect.amount = "all";
  }
  effect.duration = text.toLowerCase().includes("this turn") ? "turn" : "next";
  return effect as PreventDamageEffect;
}

/**
 * Try to parse a gain-control-of-spell effect
 */
function parseGainControlOfSpellEffect(text: string): GainControlOfSpellEffect | undefined {
  const match = text.match(/^Gain control of a spell\.?\s*(You may make new choices for it\.?)?$/i);
  if (!match) {
    return undefined;
  }
  return match[1]
    ? { newChoices: true, type: "gain-control-of-spell" }
    : { type: "gain-control-of-spell" };
}

/**
 * Try to parse a take-control effect: "Take control of TARGET." or "Take control of it and recall it."
 */
function parseTakeControlEffect(text: string): Effect | SequenceEffect | undefined {
  // Handle "Take control of it and recall it."
  const andRecallMatch = text.match(/^Take control of it and recall it\.?$/i);
  if (andRecallMatch) {
    return {
      effects: [
        { target: { type: "unit" } as AnyTarget, type: "take-control" } as Effect,
        { target: { type: "unit" } as AnyTarget, type: "recall" } as Effect,
      ],
      type: "sequence",
    };
  }

  // Handle "Take control of TARGET."
  const match = text.match(
    /^Take control of ((?:a|an)\s+(?:friendly |enemy )?(?:unit|gear)(?:\s+(?:at a battlefield|here|there|in a base))?)\.?$/i,
  );
  if (match) {
    const targetStr = match[1].toLowerCase();
    const target: {
      type: "unit" | "gear";
      controller?: "friendly" | "enemy";
      location?: Location;
    } = { type: "unit" };
    if (targetStr.includes("gear")) {
      target.type = "gear";
    }
    if (targetStr.includes("enemy")) {
      target.controller = "enemy";
    } else if (targetStr.includes("friendly")) {
      target.controller = "friendly";
    }
    if (targetStr.includes("at a battlefield")) {
      target.location = "battlefield";
    } else if (targetStr.includes("here")) {
      target.location = "here" as Location;
    } else if (targetStr.includes("in a base")) {
      target.location = "base";
    }
    return { target: target as AnyTarget, type: "take-control" } as Effect;
  }

  return undefined;
}

/**
 * Try to parse a lose-control effect: "Lose control of that unit and recall it at end of turn."
 */
function parseLoseControlEffect(text: string): Effect | undefined {
  const match = text.match(
    /^Lose control of (?:that|a|an|the) (\w+)(?: and (.+?))?(?:\s+at end of turn)?\.?$/i,
  );
  if (!match) {
    return undefined;
  }
  const targetType = match[1].toLowerCase();
  const andEffect = match[2];
  const loseControl: Effect = {
    target: { type: targetType } as AnyTarget,
    type: "lose-control",
  } as unknown as Effect;
  if (andEffect) {
    const additional = parseEffect(andEffect.trim() + ".");
    if (additional) {
      return { effects: [loseControl, additional], type: "sequence" } as SequenceEffect;
    }
  }
  return loseControl;
}

/**
 * Try to parse a spend-buff effect: "Spend a buff to EFFECT."
 */
function parseSpendBuffEffect(text: string): Effect | undefined {
  const match = text.match(/^Spend a buff to (.+?)\.?$/i);
  if (!match) {
    return undefined;
  }
  const thenText = match[1].trim();
  const thenEffect = parseEffect(thenText + ".");
  if (!thenEffect) {
    return undefined;
  }
  return { then: thenEffect, type: "spend-buff" } as Effect;
}

/**
 * Try to parse an extra-turn effect: "Take an extra turn after this one."
 */
function parseExtraTurnEffect(text: string): Effect | undefined {
  const match = text.match(/^Take an extra turn after this one\.?$/i);
  if (!match) {
    return undefined;
  }
  return { type: "extra-turn" } as Effect;
}

/**
 * Try to parse a win-game effect: "you win the game."
 */
function parseWinGameEffect(text: string): Effect | undefined {
  const match = text.match(/^you win the game\.?$/i);
  if (!match) {
    return undefined;
  }
  return { type: "win-game" } as Effect;
}

/**
 * Try to parse a create-token effect.
 * Handles patterns like:
 *   "Play a 1 :rb_might: Recruit unit token."
 *   "Play four 1 :rb_might: Recruit unit tokens."
 *   "Play a ready 3 :rb_might: Sprite unit token with [Temporary]."
 *   "Play a Gold gear token exhausted."
 *   Location suffixes: "here", "to your base"
 */
function parseCreateTokenEffect(text: string): CreateTokenEffect | undefined {
  // Pattern for gear tokens (no might): "Play a Gold gear token [exhausted]."
  const gearMatch = text.match(
    /^Play (a|an|one|two|three|four|five|six|\d+)\s+(\w+(?:\s+\w+)?)\s+(gear)\s+tokens?\s*(exhausted)?(?:\s+(?:here|to your base))?\.?$/i,
  );
  if (gearMatch) {
    const token: TokenDefinition = {
      name: gearMatch[2],
      type: gearMatch[3] as "gear",
    };
    const effect: {
      type: "create-token";
      token: TokenDefinition;
      amount?: number;
      location?: string;
    } = {
      token,
      type: "create-token",
    };
    const amount = wordToNumber(gearMatch[1]);
    if (amount > 1) {
      effect.amount = amount;
    }
    return effect as CreateTokenEffect;
  }

  // Pattern for unit tokens with might: "Play [a|N] [ready] N :rb_might: NAME unit token(s) [with [KEYWORD]] [location]."
  // Might value may also be expressed as ":rb_energy_N:" (the [N] bracket form
  // Gets normalized that way upstream).
  const unitMatch = text.match(
    /^Play (a|an|one|two|three|four|five|six|\d+)\s+(?:(ready)\s+)?(?::rb_energy_(\d+):\s*)?(\d+)?\s*:rb_might:\s+(\w+(?:\s+\w+)?)\s+(unit)\s+tokens?(?:\s+with\s+\[(\w+(?:-\w+)?)\])?\s*(here|to (?:your|their) base|into (?:your|their) base|at (?:your|their) base|exhausted)?\.?$/i,
  );
  if (unitMatch) {
    const quantityStr = unitMatch[1];
    const readyStr = unitMatch[2];
    const energyMightStr = unitMatch[3];
    const plainMightStr = unitMatch[4];
    const tokenName = unitMatch[5];
    const tokenType = unitMatch[6] as "unit";
    const keywordStr = unitMatch[7];
    const suffixStr = unitMatch[8];

    const mightStr = energyMightStr ?? plainMightStr;
    if (!mightStr) {
      return undefined;
    }
    const might = Number.parseInt(mightStr, 10);
    const amount = wordToNumber(quantityStr);

    const token: { name: string; type: "unit"; might: number; keywords?: string[] } = {
      might,
      name: tokenName,
      type: tokenType,
    };
    if (keywordStr) {
      token.keywords = [keywordStr];
    }

    const effect: {
      type: "create-token";
      token: TokenDefinition;
      amount?: number;
      ready?: boolean;
      location?: string;
    } = {
      token: token as TokenDefinition,
      type: "create-token",
    };

    if (amount > 1) {
      effect.amount = amount;
    }
    if (readyStr) {
      effect.ready = true;
    }

    if (suffixStr) {
      const lower = suffixStr.toLowerCase();
      if (lower === "here") {
        effect.location = "here";
      } else if (
        lower === "to your base" ||
        lower === "into your base" ||
        lower === "at your base" ||
        lower === "to their base" ||
        lower === "into their base" ||
        lower === "at their base"
      ) {
        effect.location = "base";
      }
    }

    return effect as CreateTokenEffect;
  }

  return undefined;
}

/**
 * Try to parse a discard effect: "Discard N."
 */
function parseDiscardEffect(text: string): Effect | undefined {
  // Handle "Each player discards their hand, then draws N"
  const eachDiscardHandMatch = text.match(
    /^Each player discards their hand,?\s*then draws? (\d+)\.?$/i,
  );
  if (eachDiscardHandMatch) {
    const drawAmount = Number.parseInt(eachDiscardHandMatch[1], 10);
    return {
      amount: "hand",
      player: "each",
      then: { amount: drawAmount, player: "each", type: "draw" } as DrawEffect,
      type: "discard",
    } as Effect;
  }

  // Handle "They discard N" / "that player discards N" (opponent-targeted)
  const theyDiscardMatch = text.match(/^(?:They|that player) discards? (\d+|a card|it)\.?$/i);
  if (theyDiscardMatch) {
    const amountStr = theyDiscardMatch[1].toLowerCase();
    const amount =
      amountStr === "a card" || amountStr === "it" ? 1 : Number.parseInt(amountStr, 10);
    return { amount, player: "opponent", type: "discard" } as Effect;
  }

  // Handle "discard N, then draw N" (sequence)
  const discardThenDrawMatch = text.match(/^discard (\d+),?\s*then draw (\d+)\.?$/i);
  if (discardThenDrawMatch) {
    const discardAmount = Number.parseInt(discardThenDrawMatch[1], 10);
    const drawAmount = Number.parseInt(discardThenDrawMatch[2], 10);
    return {
      amount: discardAmount,
      then: { amount: drawAmount, type: "draw" } as DrawEffect,
      type: "discard",
    } as Effect;
  }

  // Handle "discard a card" / "discard N"
  const match = text.match(/^discard (\d+|a card)\.?$/i);
  if (!match) {
    return undefined;
  }
  const amountStr = match[1].toLowerCase();
  const amount = amountStr === "a card" ? 1 : Number.parseInt(amountStr, 10);
  return { amount, type: "discard" } as Effect;
}

/**
 * Try to parse a recycle effect.
 *
 * Handles:
 * - Self-recycle: "Recycle me." / "Recycle this." -> { type: "recycle", from: "self", target: "self" }
 * - Targeted board recycle: "Recycle a rune." / "Recycle a unit." -> { type: "recycle", target, from: "board" }
 * - Simple card recycle: "Recycle a card." / "Recycle a gear."
 * - Quantified recycle from a zone:
 *     "Recycle 3 from your trash." -> { type: "recycle", amount: 3, from: "trash" }
 *     "Recycle 2 from your hand."  -> { type: "recycle", amount: 2, from: "hand" }
 *     "Recycle N cards from your trash/hand."
 *     "Recycle up to N cards from (your trash|trashes)."
 */
function parseRecycleEffect(text: string): Effect | undefined {
  // "Recycle this." / "Recycle me." / "Recycle myself." (self-recycle)
  const selfMatch = text.match(/^Recycle (?:this|me|myself)\.?$/i);
  if (selfMatch) {
    return { from: "self", target: "self" as AnyTarget, type: "recycle" } as Effect;
  }

  // "Recycle N [cards] from your trash|hand" / "Recycle up to N cards from (your trash|trashes)"
  const zoneMatch = text.match(
    /^Recycle (?:up to\s+)?(\d+)(?:\s+cards?)?\s+from\s+(?:your\s+(trash|hand)|(trashes))\.?$/i,
  );
  if (zoneMatch) {
    const amount = Number.parseInt(zoneMatch[1], 10);
    // "trashes" (plural, any player's trash) -> still "trash" for effect purposes.
    const fromZone = zoneMatch[2]?.toLowerCase() === "hand" ? "hand" : "trash";
    return { amount, from: fromZone, type: "recycle" } as Effect;
  }

  // "Recycle a/an <card-like target>." e.g. "Recycle a rune.", "Recycle a unit.", "Recycle a gear."
  // We treat targeted recycles (not "a card") as board-sourced.
  const targetedMatch = text.match(
    /^Recycle ((?:a|an)\s+(?:friendly |enemy )?(unit|rune|gear|legend|card))(?:\s+(?:at a battlefield|here|there|from your trash|from your hand))?\.?$/i,
  );
  if (targetedMatch) {
    const targetStr = targetedMatch[1];
    const cardType = targetedMatch[2].toLowerCase();
    const target = parseTarget(targetStr);
    // "a card" has no implicit source zone; default to trash (most common).
    // Everything else is a board permanent (unit, rune, gear, legend).
    const from: "board" | "trash" = cardType === "card" ? "trash" : "board";
    return { from, target, type: "recycle" } as Effect;
  }

  return undefined;
}

/**
 * Try to parse an add-resource effect.
 *
 * Resource tokens have already been normalized by `normalizeTokens`:
 *   [N]      -> :rb_energy_N:
 *   [fury]   -> :rb_rune_fury:  (same for calm/mind/body/chaos/order/rainbow)
 *
 * Handles:
 * - "[Add] :rb_rune_rainbow:."                -> { type: "add-resource", power: ["rainbow"] }
 * - "[Add] :rb_energy_1:."                    -> { type: "add-resource", energy: 1 }
 * - "[Add] :rb_rune_calm:."                   -> { type: "add-resource", power: ["calm"] }
 * - "[Add] :rb_energy_1::rb_rune_rainbow:."   -> energy + power
 * - "Add :rb_energy_2:."  (bare "Add" verb without brackets)
 */
function parseAddResourceEffect(text: string): AddResourceEffect | undefined {
  const match = text.match(
    /^(?:\[Add\]|Add)\s+((?::rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)):)+)\.?$/i,
  );
  if (!match) {
    return undefined;
  }
  return parseResourcePayload(match[1]);
}

/**
 * Try to parse a score effect: "you score N [additional] point(s)."
 *
 * Also handles bare "score N point(s)" (without a "you" subject) and
 * "they score N point(s)" — used inside sequences where the subject has
 * already been established by the outer clause.
 */
function parseScoreEffect(text: string): Effect | undefined {
  // "you score 1 point" — the common default.
  const youMatch = text.match(/^you score (\d+)(?: additional)? points?\.?$/i);
  if (youMatch) {
    return { amount: Number.parseInt(youMatch[1], 10), type: "score" } as Effect;
  }

  // Bare "score 1 point" (e.g. inside sequences or triggered effects).
  const bareMatch = text.match(/^score (\d+)(?: additional)? points?\.?$/i);
  if (bareMatch) {
    return { amount: Number.parseInt(bareMatch[1], 10), type: "score" } as Effect;
  }

  // "they score N point(s)" / "that player scores N point(s)" — opponent scores.
  const theyMatch = text.match(
    /^(?:they|that player) scores? (\d+)(?: additional)? points?\.?$/i,
  );
  if (theyMatch) {
    return {
      amount: Number.parseInt(theyMatch[1], 10),
      player: "opponent",
      type: "score",
    } as unknown as Effect;
  }

  return undefined;
}

/**
 * Try to parse a play-from-location effect: "play a spell/unit from your trash/hand/deck..."
 */
function parsePlayEffect(text: string): Effect | undefined {
  // Self-play: "play me." / "play this." (Flame Chompers etc.)
  if (/^play (?:me|this)\.?$/i.test(text)) {
    return { target: "self" as AnyTarget, type: "play" } as Effect;
  }

  // Pending-value play: "play it[, ignoring (its |the )cost]."
  // Used as the second step of a sequence that first banishes/chooses/reveals a
  // Card (e.g., "Banish a friendly unit, then play it, ignoring its cost").
  const pendingItMatch = text.match(
    /^(?:(?:its owner|you)\s+)?play(?:s)? it(?:\s+to (?:their|your) base)?(?:,?\s*ignoring (?:its|the)\s+(?:cost|energy cost|power cost))?\.?$/i,
  );
  if (pendingItMatch) {
    return {
      ignoreCost: true,
      target: { type: "pending-value" } as AnyTarget,
      type: "play",
    } as Effect;
  }

  // Pending-value play of revealed cards (Promising Future form).
  // "each player plays those cards, ignoring Energy costs"
  if (
    /^(?:starting with [^,]+,?\s+)?each player plays those cards(?:,?\s*ignoring (?:its|their|Energy) costs?)?\.?$/i.test(
      text,
    )
  ) {
    return {
      ignoreCost: true,
      target: { name: "revealed", type: "pending-value" } as AnyTarget,
      type: "play",
    } as Effect;
  }

  const match = text.match(/^play a (\w+) from your (trash|hand|deck)(?:\s+.*)$/i);
  if (!match) {
    return undefined;
  }
  const cardType = match[1].toLowerCase();
  const from = match[2].toLowerCase() as "trash" | "hand" | "deck";
  return { from, target: { type: cardType } as AnyTarget, type: "play" } as Effect;
}

/**
 * Try to parse a "Gain N XP" effect (UNL set).
 *
 * Handles:
 *   - "Gain 1 XP."
 *   - "Gain 2 XP"
 *   - "Gain 1 XP for each friendly unit."       -> AmountExpression {count: ...}
 */
function parseGainXpEffect(text: string): Effect | undefined {
  // "Gain N XP for each TARGET"
  const forEachMatch = text.match(
    /^Gain (\d+) XP for each ((?:of )?(?:your |other |friendly |enemy )?(?:\[?\w+\]?\s*)?(?:units?|cards?|gear|legends?)(?:\s+(?:here|at a battlefield|there))?)\.?$/i,
  );
  if (forEachMatch) {
    const perUnit = Number.parseInt(forEachMatch[1], 10);
    const countTarget = forEachMatch[2].trim().toLowerCase();
    const countObj: {
      count: AnyTarget;
      multiplier?: number;
    } = {
      count: parseTarget(countTarget) as AnyTarget,
      ...(perUnit !== 1 ? { multiplier: perUnit } : {}),
    };
    return { amount: countObj, type: "gain-xp" } as unknown as Effect;
  }

  // "Gain N XP."
  const basic = text.match(/^Gain (\d+) XP\.?$/i);
  if (basic) {
    return {
      amount: Number.parseInt(basic[1], 10),
      type: "gain-xp",
    } as unknown as Effect;
  }
  return undefined;
}

/**
 * Try to parse a "Spend N XP to <effect>" compound (UNL set).
 *
 * Produces a sequence of `[spend-xp, <inner effect>]`. The outer caller wraps
 * with `optional` / `conditional` as appropriate (e.g., when the trigger
 * clause had "you may ..."). Falls through if the inner effect can't be
 * parsed so a simpler parser can take another pass at the text.
 */
function parseSpendXpToEffect(text: string): Effect | undefined {
  const match = text.match(/^Spend (\d+) XP to (.+?)\.?$/i);
  if (!match) {
    return undefined;
  }
  const amount = Number.parseInt(match[1], 10);
  const inner = parseEffect(`${match[2]}.`);
  if (!inner) {
    return undefined;
  }
  return {
    effects: [
      { amount, type: "spend-xp" } as unknown as Effect,
      inner,
    ],
    type: "sequence",
  } as unknown as SequenceEffect;
}

/**
 * Try to parse a "Spend N XP" effect (UNL set) used as a standalone verb.
 * Most "spend N XP" usages appear as an activated-ability cost; this parser
 * handles rare cases where "spend N XP" is an effect on its own.
 */
function parseSpendXpEffect(text: string): Effect | undefined {
  const match = text.match(/^Spend (\d+) XP\.?$/i);
  if (!match) {
    return undefined;
  }
  return {
    amount: Number.parseInt(match[1], 10),
    type: "spend-xp",
  } as unknown as Effect;
}

/**
 * Try to parse a "[Predict]" / "[Predict N]" effect (UNL set).
 *
 * Predict N: look at the top N cards of the main deck, recycle any, then
 * put the rest back in any order.
 */
function parsePredictEffect(text: string): Effect | undefined {
  // Match the bracketed form with optional trailing period.
  // Example: "[Predict 2]." / "[Predict]"
  const match = text.match(/^\[Predict(?:\s+(\d+))?\]\.?$/i);
  if (!match) {
    return undefined;
  }
  const amount = match[1] ? Number.parseInt(match[1], 10) : 1;
  return { amount, type: "predict" } as unknown as Effect;
}

/**
 * Try to parse "The next unit you play this turn enters ready." style effects.
 * Emits a single-fire replacement effect shape backed by the engine's
 * `enters-ready` replacement event.
 */
function parseNextUnitEntersReadyEffect(text: string): Effect | undefined {
  const match = text.match(
    /^The next (unit|spell|card) you play this turn enters ready\.?$/i,
  );
  if (!match) {
    return undefined;
  }
  return {
    duration: "next",
    replaces: "enters-ready",
    target: { controller: "friendly", type: match[1].toLowerCase() },
    type: "replacement",
  } as unknown as Effect;
}

/**
 * Try to parse "The next spell you play this turn deals N Bonus Damage." style effects.
 * Emits a single-fire replacement effect shape backed by the engine's
 * `deals-bonus-damage` replacement event.
 */
function parseNextSpellBonusDamageEffect(text: string): Effect | undefined {
  const match = text.match(
    /^The next (spell|unit|card) you play this turn deals (\d+) Bonus Damage\.?$/i,
  );
  if (!match) {
    return undefined;
  }
  return {
    bonusDamage: Number.parseInt(match[2], 10),
    duration: "next",
    replaces: "deals-bonus-damage",
    target: { controller: "friendly", type: match[1].toLowerCase() },
    type: "replacement",
  } as unknown as Effect;
}

/**
 * Try to parse any known effect from text
 */
function parseEffect(text: string): Effect | undefined {
  let cleaned = normalizeTokens(stripReminders(text)).trim();
  if (!cleaned) {
    return undefined;
  }

  // Strip "You may" prefix for optional effects
  const youMayMatch = cleaned.match(/^You may\s+/i);
  if (youMayMatch) {
    cleaned = cleaned.slice(youMayMatch[0].length);
  }

  return (
    parseNextUnitEntersReadyEffect(cleaned) ??
    parseNextSpellBonusDamageEffect(cleaned) ??
    parseDrawEffect(cleaned) ??
    parseChannelEffect(cleaned) ??
    parseBuffEffect(cleaned) ??
    parseDamageEffect(cleaned) ??
    parseModifyMightEffect(cleaned) ??
    parseKillEffect(cleaned) ??
    parseHealEffect(cleaned) ??
    parseStunEffect(cleaned) ??
    parseBanishEffect(cleaned) ??
    parseMoveEffect(cleaned) ??
    parseReturnToHandEffect(cleaned) ??
    parseRecallEffect(cleaned) ??
    parseReadyEffect(cleaned) ??
    parseExhaustEffect(cleaned) ??
    parseGrantKeywordEffect(cleaned) ??
    parseCounterEffect(cleaned) ??
    parseLookEffect(cleaned) ??
    parseFightEffect(cleaned) ??
    parsePreventDamageEffect(cleaned) ??
    parseGainControlOfSpellEffect(cleaned) ??
    parseTakeControlEffect(cleaned) ??
    parseSpendBuffEffect(cleaned) ??
    parseLoseControlEffect(cleaned) ??
    parseExtraTurnEffect(cleaned) ??
    parseWinGameEffect(cleaned) ??
    parseCreateTokenEffect(cleaned) ??
    parseDiscardEffect(cleaned) ??
    parseRecycleEffect(cleaned) ??
    parseAddResourceEffect(cleaned) ??
    parseScoreEffect(cleaned) ??
    parsePlayEffect(cleaned) ??
    parseAttachEffect(cleaned) ??
    parseDetachEffect(cleaned) ??
    parseGainXpEffect(cleaned) ??
    parseSpendXpToEffect(cleaned) ??
    parseSpendXpEffect(cleaned) ??
    parsePredictEffect(cleaned) ??
    undefined
  );
}

/**
 * Split an effect string on sentence-level "then" connectors.
 *
 * Recognizes:
 *   - ". Then X"   (new sentence starting with "Then")
 *   - ", then X"   (clause continuation)
 *   - " Then X"    (sentence-terminal period missing)
 *
 * Avoids splitting on "then" that is part of a larger phrase (e.g. "then its
 * owner plays it" would still split — this is the desired behavior for
 * sequence detection; leaf parsers decide whether each chunk is well-formed).
 *
 * Returns an array of parts if the text was split on at least one "then"
 * boundary, otherwise undefined.
 */
function splitOnThen(text: string): string[] | undefined {
  // Split on any of: ", then " / ". Then " / " Then " (start-of-sentence "Then")
  // But NOT on "and then" (handled by andCompound) and NOT inside parentheses.
  // Preserve relative order.
  const parts: string[] = [];
  let buffer = "";
  let i = 0;
  const len = text.length;
  let depth = 0;
  while (i < len) {
    const ch = text[i];
    if (ch === "(") {depth++;}
    else if (ch === ")") {depth = Math.max(0, depth - 1);}

    if (depth === 0) {
      // Case 1: ", then " connector
      if (text.slice(i, i + 7).toLowerCase() === ", then ") {
        parts.push(buffer.trim());
        buffer = "";
        i += 7;
        continue;
      }
      // Case 2: ". Then " connector
      if (text.slice(i, i + 7) === ". Then ") {
        parts.push(buffer.trim());
        buffer = "";
        i += 7;
        continue;
      }
      // Case 3: ". Then," (e.g. "Then, do this:")
      if (text.slice(i, i + 7) === ". Then,") {
        parts.push(buffer.trim());
        buffer = "";
        i += 7;
        continue;
      }
      // Case 4: leading " Then " (tolerant of missing period)
      if (text.slice(i, i + 6) === " Then " && buffer.trim().length > 0) {
        parts.push(buffer.trim());
        buffer = "";
        i += 6;
        continue;
      }
    }

    buffer += ch;
    i++;
  }
  if (buffer.trim().length > 0) {
    parts.push(buffer.trim());
  }
  // Ensure each part ends with a period for downstream parsers
  const cleaned = parts
    .map((p) => p.replace(/^[,.\s]+/, "").replace(/\.$/, "").trim())
    .filter((p) => p.length > 0)
    .map((p) => `${p}.`);
  if (cleaned.length < 2) {
    return undefined;
  }
  return cleaned;
}

/**
 * Try to parse an "X. If you do, Y" (with optional "Otherwise, Z") pattern.
 *
 * Produces a sequence of:
 *   - an optional X effect (the "you may X" action)
 *   - a conditional { then: Y, else: Z } gated on that action having resolved
 *
 * The simplest, most useful shape is:
 *   sequence([optional(X), conditional(paid-additional-cost, Y, Z?)])
 *
 * We also support the bare "X. If you do, Y" without an else branch.
 */
function parseIfYouDoEffect(text: string): Effect | undefined {
  // Normalize: find ". If you do," boundary
  const ifYouDoRe = /\.\s+if you do,\s+/i;
  const m = text.match(ifYouDoRe);
  if (!m || m.index === undefined) {
    return undefined;
  }
  const leftText = text.slice(0, m.index).trim();
  let rightText = text.slice(m.index + m[0].length).trim();

  // Split off optional ". Otherwise, Z"
  let elseText: string | undefined;
  const otherwiseRe = /\.\s+otherwise,\s+/i;
  const om = rightText.match(otherwiseRe);
  if (om && om.index !== undefined) {
    elseText = rightText.slice(om.index + om[0].length).trim().replace(/\.$/, "");
    rightText = rightText.slice(0, om.index).trim();
  }
  rightText = rightText.replace(/\.$/, "").trim();

  // Strip leading framing phrases that describe trigger context but are not
  // The effect itself. Examples:
  //   "As you play me, you may discard 1 as an additional cost"
  //   "As an additional cost to play this, you may exhaust a friendly unit"
  //   "When I attack or defend, you may pay :rb_rune_fury:"
  let leftCore = leftText;
  leftCore = leftCore.replace(
    /^as an additional cost to play (?:this|me),?\s*/i,
    "",
  );
  leftCore = leftCore.replace(/^as you play (?:me|this),?\s*/i, "");
  // Trigger prefixes like "When I ...," are consumed by the outer trigger
  // Parser, but for defensive handling of cleaned text, strip them here too.
  leftCore = leftCore.replace(/^when i [^,]+,\s*/i, "");

  // Strip leading "you may " from the left side so parseEffect can find it
  const youMayMatch = leftCore.match(/^you may\s+/i);
  const isOptional = Boolean(youMayMatch);
  if (youMayMatch) {
    leftCore = leftCore.slice(youMayMatch[0].length);
  }
  // Also strip trailing "as an additional cost"
  leftCore = leftCore.replace(
    /\s+as an additional cost(?: to play (?:this|me))?/i,
    "",
  );

  const leftEffect = parseEffect(`${leftCore}.`);
  if (!leftEffect) {
    return undefined;
  }
  const rightEffect = parseEffect(`${rightText}.`);
  if (!rightEffect) {
    return undefined;
  }
  const elseEffect = elseText ? parseEffect(`${elseText}.`) : undefined;

  const conditional: {
    type: "conditional";
    condition: { type: "paid-additional-cost" };
    then: Effect;
    else?: Effect;
  } = {
    condition: { type: "paid-additional-cost" },
    then: rightEffect,
    type: "conditional",
  };
  if (elseEffect) {
    conditional.else = elseEffect;
  }

  const leftWrapped: Effect = isOptional
    ? ({ effect: leftEffect, type: "optional" } as unknown as Effect)
    : leftEffect;

  return {
    effects: [leftWrapped, conditional as unknown as Effect],
    type: "sequence",
  } as SequenceEffect;
}

/**
 * Parse multiple sequential effects from text, returning a sequence if more than one.
 * Splits on sentence boundaries (". ") and tries to parse each.
 */
function parseEffects(text: string): Effect | undefined {
  const cleaned = normalizeTokens(stripReminders(text)).trim();
  if (!cleaned) {
    return undefined;
  }

  // Try "X. If you do, Y" pattern BEFORE any other splitting.
  // This must run before splitOnThen because "If you do" is a conditional,
  // Not a sequence.
  const ifYouDoEffect = parseIfYouDoEffect(cleaned);
  if (ifYouDoEffect) {
    return ifYouDoEffect;
  }

  // Try "If <cond>, A. Otherwise, B" — a pure if/else conditional that
  // Belongs in a single effect slot. Used by cards like Solari Chief:
  // "If it is stunned, kill it. Otherwise, stun it."
  const ifElseEffect = parseIfElseEffect(cleaned);
  if (ifElseEffect) {
    return ifElseEffect;
  }

  // Try "Choose one — OPTION1.OPTION2." pattern
  const chooseOneMatch = cleaned.match(/^Choose one\s*—\s*(.+)$/is);
  if (chooseOneMatch) {
    const optionsText = chooseOneMatch[1];
    // For choose-one, split on any period followed by an uppercase letter (options are sentences)
    const options = optionsText
      .split(/\.(?=[A-Z])/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (options.length >= 2) {
      const parsedOptions: { effect: Effect }[] = [];
      for (const opt of options) {
        const eff = parseEffect(opt.trim());
        if (eff) {
          parsedOptions.push({ effect: eff });
        } else {
          parsedOptions.push({ effect: { text: opt.trim(), type: "raw" } as unknown as Effect });
        }
      }
      if (parsedOptions.length >= 2) {
        return { options: parsedOptions, type: "choice" } as ChoiceEffect;
      }
    }
  }

  // Try "X or Y" choice pattern before single-effect parse (e.g., "draw 1 or channel 1 rune exhausted")
  const choiceEffect = parseChoiceEffect(cleaned);
  if (choiceEffect) {
    return choiceEffect;
  }

  // Compound return-to-hand: "Return X and Y to their owners' hands."
  // Split the shared "to their owners' hands" suffix across two targets.
  const compoundReturnMatch = cleaned.match(
    /^Return (?:(another)\s+)?((?:(?:a|an)\s+)?(?:friendly|enemy)?\s*(?:unit|gear)(?:\s+(?:at a battlefield|here|there))?)\s+and\s+((?:(?:a|an)\s+)?(?:friendly|enemy)?\s*(?:unit|gear)(?:\s+(?:at a battlefield|here|there))?)\s+to\s+their owners'?\s+hands?\.?$/i,
  );
  if (compoundReturnMatch) {
    const another = compoundReturnMatch[1];
    const leftRaw = compoundReturnMatch[2].trim();
    const rightRaw = compoundReturnMatch[3].trim();
    // Ensure each target starts with a/an for the per-effect parser.
    const normalize = (s: string) => (/^(?:a|an)\s/i.test(s) ? s : `a ${s}`);
    const leftEff = parseReturnToHandEffect(
      `Return ${another ? "another " : ""}${normalize(leftRaw)} to its owner's hand.`,
    );
    const rightEff = parseReturnToHandEffect(
      `Return ${normalize(rightRaw)} to its owner's hand.`,
    );
    if (leftEff && rightEff) {
      return { effects: [leftEff, rightEff], type: "sequence" } as SequenceEffect;
    }
  }

  // Try splitting on " and " as a sequence separator BEFORE single-effect parse
  // So that "buff me and draw 1" produces a sequence instead of just a buff
  const andEffect = parseAndCompoundEffect(cleaned);
  if (andEffect) {
    return andEffect;
  }

  // Try splitting on comma-joined pronoun-chained effects:
  // "heal it, exhaust it, and recall it" / "heal it, exhaust it and recall it"
  // Only kicks in when every clause starts with a verb and refers to "it" / "me" / "them".
  const commaChainEffect = parseCommaPronounChain(cleaned);
  if (commaChainEffect) {
    return commaChainEffect;
  }

  // Try as a single effect
  const single = parseEffect(cleaned);
  if (single) {
    return single;
  }

  // Try splitting on "then" connectors (". Then ", ", then ", " Then ")
  // Before generic sentence splitting. This handles compound effects like
  // "Exhaust all friendly units, then deal 12 to ALL units at battlefields."
  const thenParts = splitOnThen(cleaned);
  if (thenParts && thenParts.length >= 2) {
    const thenEffects: Effect[] = [];
    let allParsed = true;
    for (const part of thenParts) {
      const eff = parseEffects(part);
      if (eff) {
        thenEffects.push(eff);
      } else {
        allParsed = false;
        break;
      }
    }
    if (allParsed && thenEffects.length >= 2) {
      return buildSequenceWithPendingValue(thenEffects);
    }
  }

  // Try splitting on sentence boundaries
  const sentences = splitSentences(cleaned);
  if (sentences.length <= 1) {
    return undefined;
  }

  const effects: Effect[] = [];
  for (const sentence of sentences) {
    const eff = parseEffect(sentence.trim());
    if (eff) {
      effects.push(eff);
    }
  }

  if (effects.length === 0) {
    return undefined;
  }
  if (effects.length === 1) {
    return effects[0];
  }
  return buildSequenceWithPendingValue(effects);
}

/**
 * Parse a pure "If <cond>, A. Otherwise, B." effect.
 *
 * Unlike `parseIfYouDoEffect` (which expects an "X. If you do, Y" framing),
 * this handles cards whose entire body is a conditional — e.g., Solari
 * Chief's "If it is stunned, kill it. Otherwise, stun it." The output is a
 * `ConditionalEffect` whose `condition` is parsed via
 * `parseLeadingIfCondition`.
 */
function parseIfElseEffect(text: string): Effect | undefined {
  if (!/^If\s/i.test(text)) {
    return undefined;
  }
  // Must have an "Otherwise" branch at a sentence boundary.
  const otherwiseMatch = text.match(/\.\s+Otherwise,\s+(.+?)\.?\s*$/i);
  if (!otherwiseMatch || otherwiseMatch.index === undefined) {
    return undefined;
  }
  const thenText = text.slice(0, otherwiseMatch.index).trim();
  const elseText = otherwiseMatch[1].trim();

  const condResult = parseLeadingIfCondition(thenText);
  if (!condResult) {
    return undefined;
  }
  const thenBody = condResult.effectText.trim().replace(/\.$/, "");
  const thenEffect = parseEffects(`${thenBody}.`) ?? parseEffect(`${thenBody}.`);
  const elseEffect = parseEffects(`${elseText}.`) ?? parseEffect(`${elseText}.`);
  if (!thenEffect || !elseEffect) {
    return undefined;
  }
  return {
    condition: condResult.condition,
    else: elseEffect,
    then: thenEffect,
    type: "conditional",
  } as Effect;
}

/**
 * Try to parse a compound effect connected by "and": "EFFECT_A and EFFECT_B"
 * Returns a sequence if both halves parse as effects.
 * Only splits on " and " that separates two independent effects,
 * not " and " inside phrases like "spell and ability damage".
 */
function parseAndCompoundEffect(text: string): SequenceEffect | undefined {
  // Special case: "Give TARGET +/-N :rb_might: [this turn] and [Keyword N] this turn."
  // The right half is a bare keyword clause that can't stand alone; re-use the target.
  const compoundMightKeywordMatch = text.match(
    /^Give (.+?)\s+([+-]\d+)\s*:rb_might:\s*(?:this turn\s+)?and\s+\[(\w+(?:-\w+)?)(?:\s+(\d+))?\]\s*(this turn|this combat)?\.?$/i,
  );
  if (compoundMightKeywordMatch) {
    const targetStr = compoundMightKeywordMatch[1];
    const amount = Number.parseInt(compoundMightKeywordMatch[2], 10);
    const keyword = compoundMightKeywordMatch[3];
    const valueStr = compoundMightKeywordMatch[4];
    const duration = parseGrantDuration(compoundMightKeywordMatch[5]);
    const target = resolveGrantTarget(targetStr);

    const mightEffect: {
      type: "modify-might";
      amount: number;
      target: AnyTarget;
      duration?: "turn";
    } = {
      amount,
      target,
      type: "modify-might",
    };
    if (duration === "turn") {
      mightEffect.duration = "turn";
    }

    const grantEffect: {
      type: "grant-keyword";
      keyword: string;
      target: AnyTarget;
      value?: number;
      duration?: "turn" | "combat";
    } = {
      keyword,
      target,
      type: "grant-keyword",
    };
    if (valueStr) {
      grantEffect.value = Number.parseInt(valueStr, 10);
    }
    if (duration) {
      grantEffect.duration = duration;
    }

    return {
      effects: [mightEffect as Effect, grantEffect as Effect],
      type: "sequence",
    } as SequenceEffect;
  }

  // Special case: "Give TARGET [Keyword1] and [Keyword2] this turn."
  const compoundTwoKeywordsMatch = text.match(
    /^Give (.+?)\s+\[(\w+(?:-\w+)?)(?:\s+(\d+))?\]\s+and\s+\[(\w+(?:-\w+)?)(?:\s+(\d+))?\]\s*(this turn|this combat)?\.?$/i,
  );
  if (compoundTwoKeywordsMatch) {
    const targetStr = compoundTwoKeywordsMatch[1];
    const keyword1 = compoundTwoKeywordsMatch[2];
    const value1Str = compoundTwoKeywordsMatch[3];
    const keyword2 = compoundTwoKeywordsMatch[4];
    const value2Str = compoundTwoKeywordsMatch[5];
    const duration = parseGrantDuration(compoundTwoKeywordsMatch[6]);
    const target = resolveGrantTarget(targetStr);

    const effect1: {
      type: "grant-keyword";
      keyword: string;
      target: AnyTarget;
      value?: number;
      duration?: "turn" | "combat";
    } = {
      keyword: keyword1,
      target,
      type: "grant-keyword",
    };
    if (value1Str) {
      effect1.value = Number.parseInt(value1Str, 10);
    }
    if (duration) {
      effect1.duration = duration;
    }

    const effect2: {
      type: "grant-keyword";
      keyword: string;
      target: AnyTarget;
      value?: number;
      duration?: "turn" | "combat";
    } = {
      keyword: keyword2,
      target,
      type: "grant-keyword",
    };
    if (value2Str) {
      effect2.value = Number.parseInt(value2Str, 10);
    }
    if (duration) {
      effect2.duration = duration;
    }

    return {
      effects: [effect1 as Effect, effect2 as Effect],
      type: "sequence",
    } as SequenceEffect;
  }

  const lower = text.toLowerCase();
  const andIndex = lower.indexOf(" and ");
  if (andIndex === -1) {
    return undefined;
  }

  const leftText = text.slice(0, andIndex).trim();
  const rightText = text.slice(andIndex + 5).trim();

  // Both halves must parse as valid effects
  const leftEffect = parseEffect(leftText);
  const rightEffect = parseEffect(rightText);

  if (!leftEffect || !rightEffect) {
    return undefined;
  }

  return { effects: [leftEffect, rightEffect], type: "sequence" } as SequenceEffect;
}

/**
 * Walk a parsed effect tree and return true if any leaf references a
 * `{ type: "pending-value" }` target. Used by sequence-building code to
 * detect when an earlier step must publish its produced value.
 */
function effectReferencesPendingValue(effect: Effect | undefined): boolean {
  if (!effect || typeof effect !== "object") {
    return false;
  }
  const obj = effect as unknown as Record<string, unknown>;
  if (
    obj.target &&
    typeof obj.target === "object" &&
    (obj.target as { type?: string }).type === "pending-value"
  ) {
    return true;
  }
  // Recurse into nested effects / control-flow children.
  const nested: unknown[] = [];
  if (Array.isArray(obj.effects)) {nested.push(...(obj.effects as unknown[]));}
  if (obj.effect) {nested.push(obj.effect);}
  if (obj.then) {nested.push(obj.then);}
  if (obj.else) {nested.push(obj.else);}
  for (const n of nested) {
    if (effectReferencesPendingValue(n as Effect)) {
      return true;
    }
  }
  return false;
}

/**
 * Return true if the effect is a "value-producing" step — one that can bind
 * a card id for a later `pending-value` reference (banish, reveal, look,
 * choose, play-from-deck-reveal, etc.).
 */
function effectProducesPendingValue(effect: Effect | undefined): boolean {
  if (!effect || typeof effect !== "object") {return false;}
  const t = (effect as { type?: string }).type;
  return t === "banish" || t === "look" || t === "reveal";
}

/**
 * Wrap an ordered list of sequence effects in a `SequenceEffect`, attaching
 * a `pendingValue` binding when a later step references a `pending-value`
 * target produced by an earlier step.
 */
function buildSequenceWithPendingValue(effects: Effect[]): SequenceEffect {
  let sourceIdx: number | undefined;
  for (let i = 1; i < effects.length; i++) {
    if (effectReferencesPendingValue(effects[i])) {
      // Find the most recent producing step before this one.
      for (let j = i - 1; j >= 0; j--) {
        if (effectProducesPendingValue(effects[j])) {
          sourceIdx = j;
          break;
        }
      }
      if (sourceIdx !== undefined) {
        break;
      }
    }
  }
  if (sourceIdx !== undefined) {
    return {
      effects,
      pendingValue: { source: sourceIdx },
      type: "sequence",
    } as SequenceEffect;
  }
  return { effects, type: "sequence" } as SequenceEffect;
}

/**
 * Parse a comma-joined chain of effects that all share the same pronoun
 * target ("it", "me", "them").
 *
 * Handles forms like:
 *   - "Heal it, exhaust it, and recall it."
 *   - "Heal it, exhaust it, recall it."
 *   - "Heal me, exhaust me."
 *
 * Each clause must parse as a standalone effect; the final clause may be
 * joined with "and". Returns a `SequenceEffect` containing the parsed
 * clauses in order, or `undefined` if any clause fails to parse.
 */
function parseCommaPronounChain(text: string): SequenceEffect | undefined {
  // Quick filter: must mention a pronoun at least twice.
  const pronounCount = (text.match(/\b(?:it|me|them)\b/gi) ?? []).length;
  if (pronounCount < 2) {
    return undefined;
  }
  // Must have at least one comma.
  if (!text.includes(",")) {
    return undefined;
  }

  // Split on commas, then the last clause may be prefixed by "and".
  const rawClauses = text
    .replace(/\.\s*$/, "")
    .split(/,\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (rawClauses.length < 2) {
    return undefined;
  }

  // Strip "and " from the last clause.
  const lastIdx = rawClauses.length - 1;
  rawClauses[lastIdx] = rawClauses[lastIdx].replace(/^and\s+/i, "");

  // Each clause must parse as a standalone effect.
  const effects: Effect[] = [];
  for (const clause of rawClauses) {
    // Add trailing period so single-effect parsers accept the clause.
    const eff = parseEffect(`${clause}.`);
    if (!eff) {
      return undefined;
    }
    effects.push(eff);
  }
  if (effects.length < 2) {
    return undefined;
  }
  return { effects, type: "sequence" } as SequenceEffect;
}

/**
 * Try to parse a choice effect: "EFFECT_A or EFFECT_B"
 */
function parseChoiceEffect(text: string): ChoiceEffect | undefined {
  // Split on " or " that separates two effects
  const orIndex = text.toLowerCase().indexOf(" or ");
  if (orIndex === -1) {
    return undefined;
  }

  const leftText = text.slice(0, orIndex).trim();
  const rightText = text.slice(orIndex + 4).trim();

  // Handle "VERB or VERB TARGET" patterns where a target is shared
  // E.g., "ready or exhaust a legend" => choice between ready(legend) and exhaust(legend)
  const sharedTargetMatch = text.match(/^(ready|exhaust|stun) or (ready|exhaust|stun)\s+(.+)$/i);
  if (sharedTargetMatch) {
    const verb1 = sharedTargetMatch[1].toLowerCase();
    const verb2 = sharedTargetMatch[2].toLowerCase();
    const targetStr = sharedTargetMatch[3];
    const target = parseTarget(targetStr);
    const effect1 = { target, type: verb1 } as Effect;
    const effect2 = { target, type: verb2 } as Effect;
    return {
      options: [{ effect: effect1 }, { effect: effect2 }],
      type: "choice",
    } as ChoiceEffect;
  }

  const leftEffect = parseEffect(leftText);
  const rightEffect = parseEffect(rightText);

  if (!leftEffect || !rightEffect) {
    return undefined;
  }

  return {
    options: [{ effect: leftEffect }, { effect: rightEffect }],
    type: "choice",
  } as ChoiceEffect;
}

/**
 * Split text into sentences, respecting periods followed by spaces
 */
function splitSentences(text: string): string[] {
  // Split on ". " or "." at end, but don't split on periods inside tokens like ":rb_might:"
  const parts: string[] = [];
  let current = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "." && (i === text.length - 1 || text[i + 1] === " " || text[i + 1] === "\n")) {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = "";
    } else {
      current += text[i];
    }
  }
  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
}

// ============================================================================
// Location Parsing
// ============================================================================

function parseLocationString(locationStr: string): Location {
  const normalized = locationStr.toLowerCase().trim();
  if (
    normalized === "base" ||
    normalized === "its base" ||
    normalized === "your base" ||
    normalized === "to base" ||
    normalized === "to its base" ||
    normalized === "to your base"
  ) {
    return "base";
  }
  if (normalized === "here" || normalized === "to here" || normalized === "this battlefield") {
    return "here";
  }
  if (
    normalized === "battlefield" ||
    normalized === "a battlefield" ||
    normalized === "to battlefield" ||
    normalized === "to a battlefield"
  ) {
    return "battlefield";
  }
  return "base";
}

// ============================================================================
// Activated Ability Parser
// ============================================================================

/**
 * Pattern for activated abilities: COST:: EFFECT
 * Cost section ends at `::`
 */
const ACTIVATED_PATTERN =
  /^((?::rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)|exhaust):(?::rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)|exhaust):)*(?:,\s*:rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)|exhaust):(?::rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)|exhaust):)*)*)):\s*(.+)$/s;

function parseActivatedAbility(text: string): ActivatedAbility | undefined {
  // Allow a leading "[Action]" / "[Reaction]" timing prefix on activated abilities
  // (rare but used by gear/legends like Dragonsoul Sage and Scorn of the Moon).
  // Parse the inner text without the prefix, then re-attach timing on the result.
  const leadingTimingMatch = text.match(/^\[(Action|Reaction)\]\s*/i);
  if (leadingTimingMatch) {
    const inner = text.slice(leadingTimingMatch[0].length).trim();
    const innerAbility = parseActivatedAbilityInner(inner);
    if (innerAbility) {
      const timingStr = leadingTimingMatch[1].toLowerCase() as "action" | "reaction";
      return { ...innerAbility, timing: timingStr } as ActivatedAbility;
    }
    return undefined;
  }
  return parseActivatedAbilityInner(text);
}

function parseActivatedAbilityInner(text: string): ActivatedAbility | undefined {
  // Compound: ":rb_energy_N::rb_rune_X:, Recycle <noun> from your trash, :rb_exhaust:: EFFECT"
  // Used by gear like Assembly Rig where the activation cost is energy + rune + recycle + exhaust.
  // Must run BEFORE the standard ACTIVATED_PATTERN because that pattern would otherwise
  // Greedily strip just the leading energy token and treat the rest as a raw effect.
  const compoundEnergyRecycleMatch = text.match(
    /^((?::rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)|exhaust):)+),\s*(Recycle (?:a |an )?(?:unit|gear|card|spell|legend) from your trash)((?:,\s*:rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)|exhaust):)*):\s*(.+)$/is,
  );
  if (compoundEnergyRecycleMatch) {
    const leadingCostStr = compoundEnergyRecycleMatch[1];
    const recyclePart = compoundEnergyRecycleMatch[2];
    const trailingCostTokens = compoundEnergyRecycleMatch[3]?.trim() ?? "";
    const effectPart = compoundEnergyRecycleMatch[4].trim();

    let cost: Cost = parseCost(leadingCostStr);
    cost = {
      ...cost,
      recycle: { amount: 1, from: "trash", text: recyclePart.trim() },
    } as Cost;
    if (trailingCostTokens) {
      const extraCost = parseCost(trailingCostTokens.replace(/^,\s*/, ""));
      cost = { ...cost, ...extraCost } as Cost;
    }

    const effect = parseEffects(effectPart);
    if (effect) {
      return { cost, effect, type: "activated" };
    }
    const stripped = stripReminders(effectPart).trim();
    if (stripped) {
      const rawEffect: Effect = { text: stripped, type: "raw" } as unknown as Effect;
      return { cost, effect: rawEffect, type: "activated" };
    }
  }

  const match = ACTIVATED_PATTERN.exec(text);
  if (!match) {
    // Try text-based activation costs. Supported leading-cost forms:
    //   "Recycle N from your trash/hand: EFFECT"
    //   "Recycle this: EFFECT" / "Recycle me: EFFECT" (self-recycle on basic runes)
    // These may optionally be followed by additional `, :rb_...:` costs before the `:` delimiter,
    // E.g. "Recycle 3 from your trash, :rb_energy_1:, :rb_exhaust:: EFFECT" (Garbage Grabber).
    // The `:` delimiter is required so bare effect text like "Recycle 3 from your trash."
    // Is not mis-split as a cost.
    const textCostMatch = text.match(
      /^(Recycle (?:\d+ (?:from your trash|from your hand|cards? from your trash|cards? from your hand)|this|me|myself))((?:,\s*:rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)|exhaust):)*):\s*(.+)$/is,
    );
    if (textCostMatch) {
      const recyclePart = textCostMatch[1].trim();
      const extraCostTokens = textCostMatch[2]?.trim() ?? "";
      const effectPart = textCostMatch[3].trim();
      const amountMatch = recyclePart.match(/^Recycle (\d+)/i);
      const isSelfRecycle = /^Recycle (?:this|me|myself)$/i.test(recyclePart);

      // Build the recycle portion of the cost.
      let cost: Cost;
      if (isSelfRecycle) {
        // Self-recycle cost (e.g. on basic runes: "Recycle this: [Add] [C]")
        cost = { recycle: { amount: 1, from: "board" } } as Cost;
      } else if (amountMatch) {
        const amount = Number.parseInt(amountMatch[1], 10);
        const fromHand = /from your hand/i.test(recyclePart);
        cost = fromHand
          ? ({ recycle: { amount, from: "hand" } } as Cost)
          : ({ recycle: amount } as Cost);
      } else {
        cost = {} as Cost;
      }

      // Merge any additional energy/rune/exhaust costs from the compound cost string.
      if (extraCostTokens) {
        const extraTokens = extraCostTokens.replace(/^,\s*/, "");
        const extraCost = parseCost(extraTokens);
        cost = { ...cost, ...extraCost } as Cost;
      }

      const effect = parseEffects(effectPart);
      if (effect) {
        return { cost, effect, type: "activated" };
      }
      const stripped = stripReminders(effectPart).trim();
      if (stripped) {
        const rawEffect: Effect = { text: stripped, type: "raw" } as unknown as Effect;
        return { cost, effect: rawEffect, type: "activated" };
      }
    }

    // Try "Spend N XP: EFFECT" or "Spend my buff: EFFECT"
    // Requires explicit ":" separator to distinguish from "Spend a buff to EFFECT" (which is an effect)
    // Effect body stops at `. Spend ` so consecutive activated abilities
    // (e.g., Voidreaver's paired "Spend 1 XP, [Exhaust]: ... Spend 2 XP, [Exhaust]: ...")
    // Don't collapse into one match.
    const spendCostMatch = text.match(
      /^(Spend (?:\d+ XP|my buff|its buff))((?:,\s*:rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)|exhaust):)*):\s*(.+?)(?=\.\s+Spend\s|$)\.?$/is,
    );
    if (spendCostMatch) {
      const costText = spendCostMatch[1].trim();
      const extraTokens = spendCostMatch[2]?.trim() ?? "";
      const effectPart = spendCostMatch[3].trim();

      // Build a structured cost object.
      // - "Spend N XP" → { xp: N }
      // - "Spend my buff" / "Spend its buff" → { spend: "buff" }
      let cost: Cost;
      const xpMatch = costText.match(/^Spend\s+(\d+)\s+XP/i);
      if (xpMatch) {
        cost = { xp: Number.parseInt(xpMatch[1], 10) } as Cost;
      } else {
        cost = { spend: "buff" } as Cost;
      }
      if (extraTokens) {
        const extraCost = parseCost(extraTokens.replace(/^,\s*/, ""));
        cost = { ...cost, ...extraCost } as Cost;
      }

      const effect = parseEffects(effectPart);
      if (effect) {
        return { cost, effect, type: "activated" };
      }
      const stripped = stripReminders(effectPart).trim();
      if (stripped) {
        const rawEffect: Effect = { text: stripped, type: "raw" } as unknown as Effect;
        return { cost, effect: rawEffect, type: "activated" };
      }
    }
    return undefined;
  }

  const costStr = match[1];
  const effectPart = match[2].trim();

  const cost = parseActivationCost(costStr);

  // Parse optional timing and conditions from effect part
  let remaining = effectPart;
  let timing: "action" | "reaction" | undefined;
  let condition: { type: "legion" } | undefined;

  // Check for [Reaction] timing
  // Strip "[Reaction]" plus any trailing separator (comma, em dash, or ">>" marker).
  const reactionMatch = remaining.match(/^\[Reaction\](?:\s*(?:,|—|-|>>))?\s*/i);
  if (reactionMatch) {
    timing = "reaction";
    remaining = remaining.slice(reactionMatch[0].length);
  }

  // Check for [Legion] condition
  const legionMatch = remaining.match(/^\[Legion\]\s*—?\s*/i);
  if (legionMatch) {
    condition = { type: "legion" };
    remaining = remaining.slice(legionMatch[0].length);
  }

  // Pre-strip "Spend this Energy only during showdowns" trailing restriction so
  // It doesn't break the [Add] match below.
  let preRestrictions: { type: string }[] | undefined;
  const earlyShowdown = remaining.match(
    /\s*Spend this Energy only during showdowns\.?\s*$/i,
  );
  if (earlyShowdown) {
    preRestrictions = [{ type: "energy-showdown-only" }];
    remaining = remaining.slice(0, remaining.length - earlyShowdown[0].length).trim();
  }

  // Check for [Add] resource pattern
  const addMatch = remaining.match(/^\[Add\]\s+(.+?)\.?\s*(?:\(.*\))?\.?\s*$/s);
  if (addMatch) {
    const resourceText = addMatch[1].trim();

    // Check if there's additional effect text after the resource (e.g., "[Add] :rb_energy_1:. Draw 1.")
    const addAndMore = remaining.match(
      /^\[Add\]\s+((?::rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)):)+)\.?\s+(.+)$/s,
    );
    if (addAndMore) {
      const resourceEffect = parseResourcePayload(addAndMore[1]);
      const additionalText = stripReminders(addAndMore[2]).trim();
      const additionalEffect = parseEffect(additionalText);
      if (additionalEffect) {
        const seqEffect: SequenceEffect = {
          effects: [resourceEffect, additionalEffect],
          type: "sequence",
        };
        const ability: ActivatedAbility = { cost, effect: seqEffect, type: "activated" };
        if (timing) {
          (ability as { timing: string }).timing = timing;
        }
        if (condition) {
          (ability as { condition: { type: "legion" } }).condition = condition;
        }
        return ability;
      }
    }

    const resourceEffect = parseResourcePayload(resourceText);
    const ability: ActivatedAbility = { cost, effect: resourceEffect, type: "activated" };
    if (timing) {
      (ability as { timing: string }).timing = timing;
    }
    if (condition) {
      (ability as { condition: { type: "legion" } }).condition = condition;
    }
    if (preRestrictions) {
      (ability as { restrictions: { type: string }[] }).restrictions = preRestrictions;
    }
    return ability;
  }

  // Extract "Use only if..." restriction from the text
  let restrictions: { type: string }[] | undefined = preRestrictions;
  const useOnlyMatch = remaining.match(
    /\s*Use only if you(?:'ve|'ve) played an Equipment this turn\.?\s*$/i,
  );
  if (useOnlyMatch) {
    restrictions = [{ type: "played-equipment-this-turn" }];
    remaining = remaining.slice(0, remaining.length - useOnlyMatch[0].length);
  }

  // Extract "Use this ability only while I'm at a battlefield" location restriction
  const useOnlyAtBattlefield = remaining.match(
    /\s*Use this ability only while I(?:'m| am) at a battlefield\.?\s*$/i,
  );
  if (useOnlyAtBattlefield) {
    restrictions = [...(restrictions ?? []), { type: "self-at-battlefield" }];
    remaining = remaining.slice(0, remaining.length - useOnlyAtBattlefield[0].length).trim();
  }

  // Extract "Spend this Energy only during showdowns" restriction (mana mod)
  const showdownEnergyOnly = remaining.match(
    /\s*Spend this Energy only during showdowns\.?\s*$/i,
  );
  if (showdownEnergyOnly) {
    restrictions = [...(restrictions ?? []), { type: "energy-showdown-only" }];
    remaining = remaining.slice(0, remaining.length - showdownEnergyOnly[0].length).trim();
  }

  // Parse the effect
  const effect = parseEffects(remaining);

  // If we have a cost and optionally a condition/timing but can't parse the effect,
  // Still return the activated ability with a raw text effect so the structure is valid
  if (!effect) {
    const stripped = stripReminders(remaining).trim();
    if (!stripped) {
      return undefined;
    }
    // Use a generic "raw" effect for unparsed text
    const rawEffect: Effect = { text: stripped, type: "raw" } as unknown as Effect;
    const ability: ActivatedAbility = { cost, effect: rawEffect, type: "activated" };
    if (timing) {
      (ability as { timing: string }).timing = timing;
    }
    if (condition) {
      (ability as { condition: { type: "legion" } }).condition = condition;
    }
    if (restrictions) {
      (ability as { restrictions: { type: string }[] }).restrictions = restrictions;
    }
    return ability;
  }

  const ability: ActivatedAbility = { cost, effect, type: "activated" };
  if (timing) {
    (ability as { timing: string }).timing = timing;
  }
  if (condition) {
    (ability as { condition: { type: "legion" } }).condition = condition;
  }
  if (restrictions) {
    (ability as { restrictions: { type: string }[] }).restrictions = restrictions;
  }
  return ability;
}

// ============================================================================
// Spell Ability Parser
// ============================================================================

/**
 * Pattern for spell abilities: [Action] or [Reaction] followed by effect text
 */
const SPELL_PATTERN = /^\[(Action|Reaction)\]\s*(?:_?\s*\([^)]*\)\s*_?\s*)?(.+)$/s;

function parseSpellAbility(text: string): SpellAbility | undefined {
  const match = SPELL_PATTERN.exec(text);
  if (!match) {
    return undefined;
  }

  const timingStr = match[1].toLowerCase() as "action" | "reaction";
  let effectText = match[2].trim();

  // Strip any additional cost text at the start (e.g., "As you play this, you may spend...")
  effectText = effectText.replace(/^As you play this[^.]*\.\s*/i, "");
  // Strip "If you do, ..." preamble (follows "As you play this...")
  effectText = effectText.replace(/^If you do[^.]*\.\s*/i, "");
  // Strip "I cost :rb_energy_N: less..." preamble
  effectText = effectText.replace(/^I cost[^.]*\.\s*/i, "");
  // Strip "This spell's Energy cost is reduced..." preamble
  effectText = effectText.replace(/^This spell's Energy cost[^.]*\.\s*/i, "");
  // Strip "If an enemy unit has died this turn, this costs..." preamble
  effectText = effectText.replace(/^If an enemy unit has died this turn[^.]*\.\s*/i, "");
  // Strip "If an opponent's score is within N points of the Victory Score, this costs..." preamble
  effectText = effectText.replace(
    /^If an opponent's score is within \d+ points? of the Victory Score[^.]*\.\s*/i,
    "",
  );
  // Strip "If you're within N points of winning, this costs..." preamble
  effectText = effectText.replace(
    /^If you(?:'re|'re) within \d+ points? of winning[^.]*\.\s*/i,
    "",
  );
  // Strip "Choose a/an ..." targeting preamble (e.g., "Choose an enemy unit at a battlefield.")
  effectText = effectText.replace(
    /^Choose (?:a|an) (?:friendly |enemy )?(?:unit|gear|spell)(?:\s+(?:at a battlefield|here|there|and (?:a|an) (?:friendly |enemy )?(?:unit|gear|spell)(?:\s+(?:at a battlefield|here|there))?))*\.\s*/i,
    "",
  );

  // Strip reminder text
  effectText = stripReminders(effectText).trim();

  // Try parsing the effect
  const effect = parseEffects(effectText);
  if (!effect) {
    // Some spells wrap a replacement ability (e.g., Tactical Retreat:
    // "The next time it would die this turn, heal it, exhaust it, and
    // Recall it instead"). Try the replacement parser before falling back
    // To raw text — this produces a structured replacement body.
    const replacementInner = parseReplacementAbility(effectText);
    if (replacementInner) {
      return {
        effect: replacementInner as unknown as Effect,
        timing: timingStr,
        type: "spell",
      };
    }

    // Some spells wrap a triggered ability in their body (e.g., Janna, Savior:
    // "[Reaction] When you play me, heal your units here, then move..."). In
    // That case the spell simply carries the triggered ability; parse and
    // Lift it into the spell's effect slot.
    const triggeredInner = parseTriggeredAbility(effectText);
    if (triggeredInner) {
      return {
        effect: triggeredInner as unknown as Effect,
        timing: timingStr,
        type: "spell",
      };
    }

    // For spell abilities with unparsed effects, use raw text effect
    if (!effectText) {
      return undefined;
    }
    const rawEffect: Effect = { text: effectText, type: "raw" } as unknown as Effect;
    return { effect: rawEffect, timing: timingStr, type: "spell" };
  }

  return { effect, timing: timingStr, type: "spell" };
}

// ============================================================================
// Triggered Ability Parser
// ============================================================================

/**
 * Patterns for triggered abilities
 */
const TRIGGER_PATTERNS: {
  pattern: RegExp;
  event: string;
  on?: string;
  restrictions?: readonly { type: string; count?: number }[];
}[] = [
  { event: "play-self", pattern: /^When you play (?:me|this)(?:\s+to a battlefield)?,\s*/i },
  { event: "become-mighty", on: "self", pattern: /^When I become \[Mighty\],\s*/i },
  { event: "attack", on: "self", pattern: /^When I attack,\s*/i },
  { event: "defend", on: "self", pattern: /^When I defend,\s*/i },
  { event: "conquer", on: "self", pattern: /^When I conquer an open battlefield,\s*/i },
  { event: "conquer", on: "self", pattern: /^When I conquer after an attack,\s*/i },
  { event: "conquer", on: "self", pattern: /^When I conquer,\s*/i },
  { event: "hold", on: "self", pattern: /^When I hold,\s*/i },
  { event: "win-combat", on: "self", pattern: /^When I win a combat,\s*/i },
  { event: "die", on: "self", pattern: /^When I die,\s*/i },
  { event: "move", on: "self", pattern: /^When I move,\s*/i },
  { event: "move-to-battlefield", on: "self", pattern: /^When I move to a battlefield,\s*/i },
  { event: "attack", on: "friendly-units", pattern: /^When a friendly unit attacks,\s*/i },
  { event: "defend", on: "friendly-units", pattern: /^When a friendly unit defends,\s*/i },
  { event: "conquer", on: "friendly-units", pattern: /^When a friendly unit conquers,\s*/i },
  { event: "hold", on: "friendly-units", pattern: /^When a friendly unit holds,\s*/i },
  { event: "die", on: "friendly-units", pattern: /^When a friendly unit dies,\s*/i },
  {
    event: "move-to-battlefield",
    on: "friendly-units",
    pattern: /^When a friendly unit moves to a battlefield,\s*/i,
  },
  {
    event: "move-to-battlefield",
    on: "opponent",
    pattern: /^When an opponent moves to a battlefield(?:\s+other than mine)?,\s*/i,
  },
  { event: "die", on: "another-friendly-units", pattern: /^When another friendly unit dies,\s*/i },
  {
    event: "die",
    on: "another-friendly-non-recruit",
    pattern: /^When another non-Recruit unit you control dies,\s*/i,
  },
  {
    event: "die",
    on: "another-friendly-non-recruit",
    pattern: /^When a non-Recruit unit you control dies,\s*/i,
  },
  { event: "die", on: "enemy-units", pattern: /^When an enemy unit dies,\s*/i },
  { event: "attack", on: "controller-here", pattern: /^When you attack here,\s*/i },
  { event: "conquer", on: "controller-here", pattern: /^When you conquer here,\s*/i },
  { event: "conquer", on: "controller", pattern: /^When you conquer,\s*/i },
  {
    event: "recycle-cards-to-deck",
    on: "controller",
    pattern: /^When you recycle one or more cards to your Main Deck,\s*/i,
  },
  {
    event: "kill-enemy-with-spell",
    on: "controller",
    pattern: /^When you kill (?:a|an) (?:stunned\s+)?enemy unit with a spell,\s*/i,
  },
  {
    event: "kill-enemy",
    on: "controller",
    pattern: /^When you kill (?:a|an) (?:stunned\s+)?enemy unit,\s*/i,
  },
  { event: "hold", on: "controller-here", pattern: /^When you hold here,\s*/i },
  { event: "hold", on: "controller", pattern: /^When you hold,\s*/i },
  { event: "win-combat", on: "controller", pattern: /^When you win a combat,\s*/i },
  { event: "defend", on: "controller-here", pattern: /^When you defend here,\s*/i },
  { event: "play-spell", on: "controller", pattern: /^When you play a spell,\s*/i },
  { event: "play-spell", on: "opponent", pattern: /^When an opponent plays a spell,\s*/i },
  { event: "discard", on: "controller", pattern: /^When you discard a card,\s*/i },
  { event: "discard", on: "self", pattern: /^When you discard me,\s*/i },
  { event: "buff", pattern: /^When you buff a (?:friendly )?unit,\s*/i },
  { event: "buff", on: "self", pattern: /^When I'm buffed,\s*/i },
  { event: "spend-buff", pattern: /^When you spend a buff,\s*/i },
  { event: "recycle", on: "controller", pattern: /^When you recycle one or more cards,\s*/i },
  { event: "choose-or-ready", on: "self", pattern: /^When you choose or ready me,\s*/i },
  { event: "attach-equipment", on: "self", pattern: /^When you attach an Equipment to me,\s*/i },
  {
    event: "defend-or-play-from-hidden",
    on: "self",
    pattern: /^When I defend or I'm played from \[Hidden\],\s*/i,
  },
  {
    event: "look-at-deck",
    on: "controller",
    pattern: /^When you look at cards from the top of your deck[^,]*,\s*/i,
  },
  {
    event: "play-from-hidden",
    on: "self",
    pattern: /^When you play (?:this|me) from (?:face down|\[Hidden\]),\s*/i,
  },
  {
    event: "beginning-phase",
    on: "controller",
    pattern: /^At (?:the )?start of your Beginning Phase,\s*/i,
  },
  { event: "start-of-turn", on: "controller", pattern: /^At the start of your turn,\s*/i },
  { event: "end-of-turn", on: "controller", pattern: /^At the end of your turn,\s*/i },
  { event: "attack", on: "self", pattern: /^Whenever I attack,\s*/i },
  { event: "hold", on: "self", pattern: /^Whenever I hold,\s*/i },
  // "The first time ... each turn" restriction patterns
  {
    event: "conquer",
    on: "self",
    pattern: /^The first time I conquer each turn,\s*/i,
    restrictions: [{ type: "first-time-each-turn" }],
  },
  {
    event: "move",
    on: "self",
    pattern: /^The first time I move each turn,\s*/i,
    restrictions: [{ type: "first-time-each-turn" }],
  },
  {
    event: "play-spell",
    on: "controller",
    pattern: /^The first time you play a spell each turn,\s*/i,
    restrictions: [{ type: "first-time-each-turn" }],
  },
  {
    event: "discard",
    on: "controller",
    pattern: /^The first time you discard a card each turn,\s*/i,
    restrictions: [{ type: "first-time-each-turn" }],
  },
  // "The Nth time ... in a turn" restriction patterns
  {
    event: "move",
    on: "self",
    pattern: /^The third time I move in a turn,\s*/i,
    restrictions: [{ count: 3, type: "nth-time-each-turn" }],
  },
  // Compound trigger: "When I attack or defend, ..."
  { event: "attack-or-defend", on: "self", pattern: /^When I attack or defend,\s*/i },
  // "When a friendly unit attacks or defends alone, ..."
  {
    event: "attack-or-defend-alone",
    on: "friendly-units",
    pattern: /^When a friendly unit attacks or defends alone,\s*/i,
  },
  // "When you play another unit, ..."
  { event: "play-unit", on: "another-friendly-units", pattern: /^When you play another unit,\s*/i },
  // "When you play a unit, ..."
  { event: "play-unit", on: "friendly-units", pattern: /^When you play a unit,\s*/i },
  // "When you play a token unit, ..."
  { event: "play-token-unit", on: "controller", pattern: /^When you play a token unit,\s*/i },
  // "When you ready a friendly unit, ..."
  { event: "ready", on: "friendly-units", pattern: /^When you ready a friendly unit,\s*/i },
  // "When you stun an/one or more enemy unit(s), ..."
  {
    event: "stun",
    on: "enemy-units",
    pattern: /^When you stun (?:an|one or more) enemy units?,\s*/i,
  },
  // "When you buff me, ..."
  { event: "buff", on: "self", pattern: /^When you buff me,\s*/i },
  // "When a buffed friendly unit dies, ..."
  { event: "die", on: "friendly-units", pattern: /^When a buffed friendly unit dies,\s*/i },
  // "When a unit moves from here, ..."
  { event: "move-from-here", on: "any", pattern: /^When a unit moves from here,\s*/i },
  // "When you play a card from [Hidden], ..."
  {
    event: "play-from-hidden",
    on: "controller",
    pattern: /^When you play a card from \[Hidden\],\s*/i,
  },
  // "When you play a spell that costs N or more, ..."
  {
    event: "play-spell",
    on: "controller",
    pattern: /^When you play a spell that costs (?::rb_energy_\d+:|\d+) or more,\s*/i,
  },
  // "When I move from a battlefield, ..."
  { event: "move-from-battlefield", on: "self", pattern: /^When I move from a battlefield,\s*/i },
  // "When you use an activated ability of a gear, ..."
  {
    event: "use-activated-ability",
    on: "controller",
    pattern: /^When you use an activated ability of a gear,\s*/i,
  },
  // "When you draw your second card each turn, ..."
  {
    event: "draw",
    on: "controller",
    pattern: /^When you draw your second card each turn,\s*/i,
    restrictions: [{ count: 2, type: "nth-time-each-turn" }],
  },
  // "When you discard one or more cards, ..."
  { event: "discard", on: "controller", pattern: /^When you discard one or more cards,\s*/i },
  // "When I'm played and when I conquer, ..."
  {
    event: "play-self-or-conquer",
    on: "self",
    pattern: /^When I'm played and when I conquer,\s*/i,
  },
  // "When you play your second card in a turn, ..."
  {
    event: "play-card",
    on: "controller",
    pattern: /^When you play your second card in a turn,\s*/i,
    restrictions: [{ count: 2, type: "nth-time-each-turn" }],
  },
  // "When an enemy unit attacks a battlefield you control, ..."
  {
    event: "attack",
    on: "enemy-units",
    pattern: /^When an enemy unit attacks a battlefield you control,\s*/i,
  },
  // "When a player plays a spell, ..."
  { event: "play-spell", on: "any-player", pattern: /^When a player plays a spell,\s*/i },
  // "When a player plays a unit here, ..."
  { event: "play-unit", on: "any-player", pattern: /^When a player plays a unit here,\s*/i },
  // "When you conquer or hold, ..."
  { event: "conquer-or-hold", on: "controller", pattern: /^When you conquer or hold,\s*/i },
  // "When I win a combat, ..." (already have "When I win a combat," - make sure it exists)
  // "When you play me or when I hold, ..."
  {
    event: "play-self-or-hold",
    on: "self",
    pattern: /^When you play me or when I hold,\s*/i,
  },
  // "The first time a friendly unit dies each turn, ..." (Wraith of Echoes)
  {
    event: "die",
    on: "friendly-units",
    pattern: /^The first time a friendly unit dies each turn,\s*/i,
    restrictions: [{ type: "first-time-each-turn" }],
  },
  // "When this is played, discarded, or killed, ..." (Scrapheap)
  // Multi-event union encoded as a synthetic event name.
  {
    event: "play-discard-or-die-self",
    on: "self",
    pattern: /^When this is played, discarded, or killed,\s*/i,
  },
  // "When an opponent scores, ..." (Sumpworks Map)
  { event: "score", on: "opponent", pattern: /^When an opponent scores,\s*/i },
  // "When you play a unit during a showdown, ..." (Fresh Beans)
  {
    event: "play-unit",
    on: "controller",
    pattern: /^When you play a unit during a showdown,\s*/i,
    restrictions: [{ type: "during-showdown" }],
  },
  // "When you play a card with Power cost X or more, ..." (Yordle Explorer)
  {
    event: "play-card",
    on: "controller",
    pattern:
      /^When you play a card with Power cost (?::rb_rune_(?:fury|calm|mind|body|chaos|order|rainbow):)+ or more,\s*/i,
  },
  // "At the start of each player's Beginning Phase, ..." (Frozen Fortress)
  {
    event: "beginning-phase",
    on: "any-player",
    pattern: /^At the start of each player's Beginning Phase,\s*/i,
  },
  // "When a unit here is returned to a player's hand, ..." (Ripper's Bay)
  {
    event: "return-to-hand",
    on: "any",
    pattern: /^When a unit here is returned to a player's hand,\s*/i,
  },
  // "When a player chooses a friendly unit here with a spell for the first time each turn, ..." (The Dreaming Tree)
  {
    event: "choose-unit-with-spell",
    on: "controller-here",
    pattern:
      /^When a player chooses a friendly unit here with a spell for the first time each turn,\s*/i,
    restrictions: [{ type: "first-time-each-turn" }],
  },
  // "When a player plays a unit here, ..." (Valley of Idols) — already partially supported.
  // "When a showdown begins here, ..." (Diana, Lunari)
  {
    event: "showdown-begin",
    on: "controller-here",
    pattern: /^When a showdown begins here,\s*/i,
  },
  // "When an opponent plays a unit while I'm at a battlefield, ..." (Vex Apathetic)
  {
    event: "play-unit",
    on: "opponent",
    pattern: /^When an opponent plays a unit while I'm at a battlefield,\s*/i,
    restrictions: [{ type: "self-at-battlefield" }],
  },
  // "When you or an ally hold, ..." (Chem-Baroness)
  {
    event: "hold",
    on: "controller-or-allies",
    pattern: /^When you or an ally hold,\s*/i,
  },
  // "The first time a player plays a non-token unit here each turn, ..." (Star Spring)
  {
    event: "play-unit",
    on: "any-player",
    pattern: /^The first time a player plays a non-token unit here each turn,\s*/i,
    restrictions: [{ type: "first-time-each-turn" }, { type: "non-token" }],
  },
];

function parseTriggeredAbility(text: string): TriggeredAbility | undefined {
  // Allow a leading "While you control this battlefield, ..." gating prefix on
  // Triggered abilities (used by battlefield cards). Parse the inner trigger
  // And re-attach the gating condition.
  const whileControlBfPrefix = text.match(/^While you control this battlefield,\s*/i);
  if (whileControlBfPrefix) {
    const inner = text.slice(whileControlBfPrefix[0].length);
    const innerAbility = parseTriggeredAbilityInner(inner);
    if (innerAbility) {
      const existingCondition = (innerAbility as { condition?: { type: string } }).condition;
      const wrapped = existingCondition
        ? {
            conditions: [
              { type: "while-control-battlefield" } as unknown as { type: string },
              existingCondition,
            ],
            type: "and" as const,
          }
        : ({ type: "while-control-battlefield" } as unknown);
      return {
        ...innerAbility,
        condition: wrapped,
      } as TriggeredAbility;
    }
  }
  return parseTriggeredAbilityInner(text);
}

function parseTriggeredAbilityInner(text: string): TriggeredAbility | undefined {
  for (const tp of TRIGGER_PATTERNS) {
    const match = tp.pattern.exec(text);
    if (!match) {
      continue;
    }

    let effectText = text.slice(match[0].length).trim();

    // Strip "Choose a/an <target>." targeting preamble — mirrors the spell
    // Parser's handling for effects like Solari Chief's "When you play me,
    // Choose an enemy unit. If it is stunned, kill it. Otherwise, stun it."
    effectText = effectText.replace(
      /^Choose (?:a|an) (?:friendly |enemy )?(?:unit|gear|spell)(?:\s+(?:at a battlefield|here|there))?\.\s*/i,
      "",
    );

    // Check for optional "you may" / "they may" / "that player may" (variants
    // Where the trigger applies to "any player" or "opponent" rather than the
    // Controller).
    let optional = false;
    let condition: { type: string } | undefined;
    const mayMatch = effectText.match(/^(?:you|they|that player)\s+may\s+/i);
    if (mayMatch) {
      optional = true;
      effectText = effectText.slice(mayMatch[0].length);
    }

    // Check for "pay :rb_energy_N: to" pattern (optional cost condition)
    const payMatch = effectText.match(
      /^pay\s+((?::rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)):)+)\s+to\s+/i,
    );
    if (payMatch) {
      optional = true;
      effectText = effectText.slice(payMatch[0].length);
    }

    // Check for "pay :rb_X:. If you do, Y" pattern: treat as optional cost
    // That gates the rest of the effect on having been paid.
    const payIfYouDoMatch = effectText.match(
      /^pay\s+((?::rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)):)+)\.\s+if you do,\s*/i,
    );
    if (payIfYouDoMatch) {
      optional = true;
      condition = { type: "paid-additional-cost" };
      effectText = effectText.slice(payIfYouDoMatch[0].length);
    }

    // Check for conditional "if you paid the additional cost," or "if you do,"
    // (both indicate the remainder only resolves if the prior "you may" cost
    // Was actually paid).
    const ifPaidMatch = effectText.match(/^(?:if you paid the additional cost|if you do),\s*/i);
    if (ifPaidMatch) {
      condition = { type: "paid-additional-cost" };
      effectText = effectText.slice(ifPaidMatch[0].length);
    }

    // Check for inline conditions via the condition parser's leading-if helper.
    // This recognizes: "if I'm alone,", "if I'm at a battlefield,", "if I'm [Mighty],",
    // "if you control a Poro,", "if you control two or more gear,",
    // "if an opponent's score is within 3 points of the Victory Score,",
    // "if you have 4+ units at battlefields,", etc.
    //
    // Skip when the effect text is an explicit "If X, A. Otherwise, B." form —
    // That belongs in the effect body as a ConditionalEffect, not hoisted to
    // The trigger's outer condition.
    if (!condition && !/\.\s+Otherwise,\s+/i.test(effectText)) {
      const leading = parseLeadingIfCondition(effectText);
      if (leading) {
        condition = leading.condition as { type: string };
        ({ effectText } = leading);
      }
    }

    // Strip reminders
    effectText = stripReminders(effectText).trim();

    // Strip well-known trailing restriction sentences that don't have an
    // Engine effect (they're enforced as part of the same triggered effect).
    effectText = effectText
      .replace(/\s*They can't move it this turn\.?\s*$/i, "")
      .replace(/\s*That player can't move it this turn\.?\s*$/i, "")
      .trim();

    // Handle "discard N, then draw N" pattern
    const discardThenDrawMatch = effectText.match(/^discard (\d+),\s*then draw (\d+)\.?$/i);
    if (discardThenDrawMatch) {
      const discardAmount = Number.parseInt(discardThenDrawMatch[1], 10);
      const drawAmount = Number.parseInt(discardThenDrawMatch[2], 10);
      const effect: Effect = {
        amount: discardAmount,
        then: { amount: drawAmount, type: "draw" } as DrawEffect,
        type: "discard",
      } as Effect;

      const trigger: { event: string; on?: string; location?: string; timing?: string } = {
        event: tp.event,
      };
      if (tp.on === "controller-here") {
        trigger.on = "controller";
        trigger.location = "here";
      } else if (tp.on) {
        trigger.on = tp.on;
      }

      const ability: TriggeredAbility = {
        effect,
        trigger: trigger as TriggeredAbility["trigger"],
        type: "triggered",
      };
      if (optional) {
        (ability as { optional: boolean }).optional = optional;
      }
      return ability;
    }

    // Parse the effect
    let effect = parseEffects(effectText);

    // Trailing "<effect> if <clause>" fallback: if the effect didn't parse,
    // Or parsed only as raw, try to split off a trailing condition and retry.
    const effectIsRaw = effect && (effect as { type?: string }).type === "raw";
    if ((!effect || effectIsRaw) && !condition) {
      const trailing = parseTrailingIfCondition(effectText);
      if (trailing) {
        const prefixEffect = parseEffects(trailing.effectText);
        const prefixIsStructured =
          prefixEffect && (prefixEffect as { type?: string }).type !== "raw";
        if (prefixIsStructured) {
          effect = prefixEffect;
          condition = trailing.condition as { type: string };
        }
      }
    }

    if (!effect && effectText) {
      // Use raw effect for unparsed text so we still return the trigger structure
      effect = { text: effectText, type: "raw" } as unknown as Effect;
    }
    if (!effect) {
      continue;
    }

    const trigger: {
      event: string;
      on?: string | { controller: string; type: string; excludeSelf?: boolean };
      timing?: string;
      location?: string;
      restrictions?: readonly { type: string; count?: number }[];
    } = { event: tp.event };
    if (tp.on === "self") {
      trigger.on = "self";
    } else if (tp.on === "friendly-units") {
      trigger.on = { controller: "friendly", type: "unit" };
    } else if (tp.on === "another-friendly-units") {
      trigger.on = { controller: "friendly", excludeSelf: true, type: "unit" };
    } else if (tp.on === "enemy-units") {
      trigger.on = { controller: "enemy", type: "unit" };
    } else if (tp.on === "controller") {
      trigger.on = "controller";
    } else if (tp.on === "controller-here") {
      trigger.on = "controller";
      trigger.location = "here";
    } else if (tp.on === "opponent") {
      trigger.on = "opponent";
    } else if (tp.on === "any-player") {
      trigger.on = "any-player";
    } else if (tp.on === "any") {
      trigger.on = "any";
    } else if (tp.on === "controller-or-allies") {
      trigger.on = "controller-or-allies";
    }

    // Add timing for "At" triggers
    if (
      tp.event === "start-of-turn" ||
      tp.event === "end-of-turn" ||
      tp.event === "beginning-phase"
    ) {
      trigger.timing = "at";
    }

    // Add restrictions if defined on the pattern
    if (tp.restrictions) {
      trigger.restrictions = tp.restrictions;
    }

    const ability: TriggeredAbility = {
      effect,
      trigger: trigger as TriggeredAbility["trigger"],
      type: "triggered",
    };
    if (optional) {
      (ability as { optional: boolean }).optional = optional;
    }
    if (condition) {
      (ability as { condition: { type: string } }).condition = condition;
    }
    return ability;
  }

  return undefined;
}

// ============================================================================
// Main Parser Entry Point
// ============================================================================

/**
 * Parse ability text into a structured ability object.
 *
 * @param text - The ability text to parse
 * @returns ParseResult with the parsed ability or error
 */
export function parseAbilityText(text: string): ParseResult {
  if (!text || text.trim().length === 0) {
    return { error: "Empty ability text", success: false };
  }

  const trimmed = text.trim();
  const ability =
    parseActivatedAbility(trimmed) ?? parseSpellAbility(trimmed) ?? parseTriggeredAbility(trimmed);

  if (ability) {
    return { ability, success: true };
  }

  // Try as standalone effect (spell without timing)
  const effect = parseEffects(trimmed);
  if (effect) {
    return {
      ability: { effect, timing: "action", type: "spell" } as SpellAbility,
      success: true,
    };
  }

  return { error: "Could not parse ability text", success: false };
}

/**
 * Generate an ability ID from card ID and index
 * @param cardId - Card ID prefix (e.g., "card-1")
 * @param index - 1-based ability index
 * @returns Ability ID (e.g., "card-1-1")
 */
function generateAbilityId(cardId: string, index: number): string {
  return `${cardId}-${index}`;
}

/**
 * Build an AbilityWithText object based on parser options
 * @param ability - The parsed ability
 * @param text - The original ability text
 * @param options - Parser options
 * @param index - 1-based ability index (for multi-ability parsing)
 * @returns AbilityWithText with fields conditionally included based on options
 */
export function buildAbilityWithText(
  ability: Ability,
  text: string,
  options?: ParserOptions,
  index = 1,
): AbilityWithText {
  const result: { ability: Ability; text?: string; id?: string } = { ability };

  // Include text unless omitText is true
  if (!options?.omitText) {
    result.text = text;
  }

  // Include id if generateAbilityUids is true and cardId is provided, unless omitId is true
  if (options?.generateAbilityUids && options?.cardId && !options?.omitId) {
    result.id = generateAbilityId(options.cardId, index);
  }

  return result as AbilityWithText;
}

// ============================================================================
// Keyword Constants
// ============================================================================

const ALL_SIMPLE_KEYWORDS: readonly string[] = [
  "Tank",
  "Backline",
  "Ganking",
  "Hidden",
  "Temporary",
  "Quick-Draw",
  "Weaponmaster",
  "Unique",
  "Ambush",
];

const ALL_VALUE_KEYWORDS: readonly string[] = [
  "Assault",
  "Shield",
  "Deflect",
  "Hunt",
  // NOTE: "Predict" is intentionally omitted here. Although it is declared as
  // A ValueKeyword in riftbound-types for schema completeness, it is
  // *Always* used as an inline effect (e.g., "[Deathknell] [Predict 2]")
  // Rather than as a standalone keyword ability on a unit. Treating it as a
  // Keyword in the splitter would wrongly peel it off as its own ability.
];

const ALL_COST_KEYWORDS: readonly string[] = ["Accelerate", "Equip", "Repeat"];

const ALL_EFFECT_KEYWORDS: readonly string[] = ["Deathknell", "Legion", "Vision"];

/** All keywords that can appear as `[Keyword]` in card text */
const ALL_KEYWORDS = [
  ...ALL_SIMPLE_KEYWORDS,
  ...ALL_VALUE_KEYWORDS,
  ...ALL_COST_KEYWORDS,
  ...ALL_EFFECT_KEYWORDS,
];

// ============================================================================
// Multi-Ability Text Splitting
// ============================================================================

/**
 * Represents a segment of card text identified during splitting.
 */
interface TextSegment {
  readonly text: string;
  readonly type: "keyword" | "other";
}

/**
 * Skip past balanced parentheses and any italic markers surrounding them.
 * Returns index immediately after the closing paren (and trailing italic/space).
 */
function skipReminderText(text: string, startIndex: number): number {
  let i = startIndex;

  // Skip italic markers and spaces before the paren
  while (i < text.length && (text[i] === "_" || text[i] === " " || text[i] === "*")) {
    i++;
  }

  if (i >= text.length || text[i] !== "(") {
    return startIndex;
  }

  // Find the matching closing paren
  let depth = 0;
  while (i < text.length) {
    if (text[i] === "(") {
      depth++;
    } else if (text[i] === ")") {
      depth--;
      if (depth === 0) {
        i++;
        // Skip trailing italic markers and spaces
        while (i < text.length && (text[i] === "_" || text[i] === " " || text[i] === "*")) {
          i++;
        }
        return i;
      }
    }
    i++;
  }
  return startIndex;
}

/**
 * Pattern to match a keyword bracket at a given position.
 * Captures: keyword name, optional value
 */
const KEYWORD_AT_POS_RE =
  /^\[(Tank|Backline|Ganking|Hidden|Temporary|Quick-Draw|Weaponmaster|Unique|Ambush|Assault|Shield|Deflect|Hunt|Accelerate|Equip|Repeat|Deathknell|Legion|Vision)(?:\s+(\d+))?\]/;

/**
 * Split card text into segments, each representing a single ability.
 *
 * Identifies keyword boundaries based on `[Keyword]` patterns and separates
 * the remaining text (triggers, statics, activated, spells) into its own segments.
 */
function splitAbilityText(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    // Try to match a keyword at current position
    const remaining = text.slice(i);
    const kwMatch = KEYWORD_AT_POS_RE.exec(remaining);

    if (kwMatch) {
      // Skip keyword brackets that appear in inline reference context
      // (e.g., "with [Temporary]", "from [Hidden]", "has [Deflect]")
      const precedingText = text.slice(Math.max(0, i - 6), i);
      if (precedingText.match(/(?:with|from)\s*$/i)) {
        // Not a real keyword boundary - consume as regular text
        const restText = text.slice(i);
        const nextKwIdx = findNextKeywordIndex(restText.slice(kwMatch[0].length));
        let endIdx: number;
        if (nextKwIdx > 0) {
          endIdx = i + kwMatch[0].length + nextKwIdx;
        } else {
          endIdx = len;
        }
        // Append to previous "other" segment if exists, otherwise create new one
        const chunk = text.slice(i, endIdx).trim();
        if (chunk) {
          if (segments.length > 0 && segments[segments.length - 1].type === "other") {
            segments[segments.length - 1] = {
              text: segments[segments.length - 1].text + " " + chunk,
              type: "other",
            };
          } else {
            segments.push({ text: chunk, type: "other" });
          }
        }
        i = endIdx;
        continue;
      }

      const keyword = kwMatch[1];
      let endOfKeyword = i + kwMatch[0].length;

      // Depending on keyword type, consume associated text
      if (ALL_SIMPLE_KEYWORDS.includes(keyword)) {
        // Simple keywords: consume optional reminder text
        endOfKeyword = skipReminderText(text, endOfKeyword);
        segments.push({ text: text.slice(i, endOfKeyword).trim(), type: "keyword" });
        i = endOfKeyword;
      } else if (ALL_VALUE_KEYWORDS.includes(keyword)) {
        // Value keywords: "[Assault 2]" - consume optional reminder text
        endOfKeyword = skipReminderText(text, endOfKeyword);
        segments.push({ text: text.slice(i, endOfKeyword).trim(), type: "keyword" });
        i = endOfKeyword;
      } else if (ALL_COST_KEYWORDS.includes(keyword)) {
        // Cost keywords: "[Accelerate] (reminder)" or "[Equip] :cost: (reminder)"
        // Or "[Repeat] :cost: (reminder)"
        // Need to consume the cost tokens and reminder text
        let costEnd = endOfKeyword;

        // For Equip and Repeat: consume inline cost tokens and optional "— " prefix
        if (keyword === "Equip" || keyword === "Repeat") {
          // Skip optional " — " prefix (also always skip leading whitespace)
          const dashMatch = text.slice(costEnd).match(/^\s*(?:—\s*)?/);
          if (dashMatch) {
            costEnd += dashMatch[0].length;
          }
          // Consume cost tokens (energy/rune patterns)
          const costTokenMatch = text
            .slice(costEnd)
            .match(/^((?::rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)):)+)/);
          if (costTokenMatch) {
            costEnd += costTokenMatch[0].length;
          }
          // For Equip, also consume ", additional cost text"
          if (keyword === "Equip") {
            const additionalMatch = text.slice(costEnd).match(/^,\s*[^(]+/);
            if (additionalMatch) {
              costEnd += additionalMatch[0].length;
            }
          }
        }

        // Skip spaces
        while (costEnd < len && text[costEnd] === " ") {
          costEnd++;
        }

        // Consume reminder text
        costEnd = skipReminderText(text, costEnd);

        segments.push({ text: text.slice(i, costEnd).trim(), type: "keyword" });
        i = costEnd;
      } else if (ALL_EFFECT_KEYWORDS.includes(keyword)) {
        // Effect keywords: "[Deathknell] — effect text. (reminder)"
        // "[Vision] (reminder)" or "[Legion] — effect text (reminder)"
        // Also tolerates the dash-less form: "[Deathknell] [Predict 2]." /
        // "[Deathknell] Draw 1." (common in UNL card text).
        let effectEnd = endOfKeyword;
        let hadEffectPrefix = false;

        // Skip optional " — "
        const dashMatch = text.slice(effectEnd).match(/^\s*—\s*/);
        if (dashMatch) {
          effectEnd += dashMatch[0].length;
          hadEffectPrefix = true;
        } else {
          // Dash-less form: still treat the following text as the effect if
          // There is any non-reminder text before the next standalone keyword.
          // Skip any leading whitespace first.
          let probe = effectEnd;
          while (probe < len && text[probe] === " ") {
            probe++;
          }
          // If we land on another standalone keyword with no text in between,
          // Fall through to the old reminder-only path.
          const nextKwIdxImmediate = findNextStandaloneKeywordIndex(text.slice(probe));
          if (nextKwIdxImmediate !== 0) {
            effectEnd = probe;
            hadEffectPrefix = true;
          }
        }

        if (hadEffectPrefix) {
          // Consume effect text bounded by reminder text or next keyword.
          const restAfterPrefix = text.slice(effectEnd);
          const reminderIdx = restAfterPrefix.search(/_?\s*\(/);
          const nextKwIdx = findNextKeywordIndex(restAfterPrefix);
          if (reminderIdx >= 0 && (nextKwIdx < 0 || reminderIdx < nextKwIdx)) {
            effectEnd = skipReminderText(text, effectEnd + reminderIdx);
          } else if (nextKwIdx > 0) {
            effectEnd += nextKwIdx;
          } else if (nextKwIdx === 0) {
            // No effect text
          } else {
            effectEnd = len;
          }
        } else {
          // No dash and no following effect: only consume reminder text.
          effectEnd = skipReminderText(text, effectEnd);
        }

        // Build the segment text and remove trailing reminders
        let segText = text.slice(i, effectEnd).trim();
        segText = segText.replace(/\s*_?\s*\([^)]*\)\s*_?\s*$/, "").trim();

        segments.push({ text: segText, type: "keyword" });
        i = effectEnd;
      } else {
        // Unknown keyword, just consume the bracket
        segments.push({ text: kwMatch[0], type: "keyword" });
        i = endOfKeyword;
      }
    } else {
      // Not a keyword - consume until the next standalone keyword bracket.
      // Use findNextStandaloneKeywordIndex to avoid splitting on keyword
      // References inside sentences (e.g., "have [Vision]").
      const rest = text.slice(i);
      const nextKwIdx = findNextStandaloneKeywordIndex(rest);

      let endIdx: number;
      if (nextKwIdx > 0) {
        endIdx = i + nextKwIdx;
      } else {
        endIdx = len;
      }

      const segment = text.slice(i, endIdx).trim();
      if (segment) {
        segments.push({ text: segment, type: "other" });
      }
      i = endIdx;
    }
  }

  return segments;
}

/**
 * Find the index of the next keyword bracket in text.
 * Returns -1 if no keyword is found.
 */
function findNextKeywordIndex(text: string): number {
  // Build a regex that matches any keyword bracket
  const pattern = new RegExp(`\\[(${ALL_KEYWORDS.join("|")})(?:\\s+\\d+)?\\]`);
  const match = pattern.exec(text);
  return match ? match.index : -1;
}

/**
 * Find the index of the next STANDALONE keyword bracket in text.
 * Skips keyword references that are embedded inside sentences
 * (e.g., "have [Vision]", "gain [Assault]", "give [Tank]").
 * Returns -1 if no standalone keyword is found.
 */
function findNextStandaloneKeywordIndex(text: string): number {
  const pattern = new RegExp(`\\[(${ALL_KEYWORDS.join("|")})(?:\\s+\\d+)?\\]`, "g");
  // A standalone keyword bracket appears at sentence boundaries -- either at
  // The very start of the remaining text, or immediately after a sentence-ending
  // Character (period, closing paren, closing bracket, italic marker).
  // Keyword brackets mid-sentence are references (e.g., "have [Vision]",
  // "give it [Temporary]", "with [Assault]") and should NOT be split on.
  const standaloneStartPattern = /(?:^|[.)_\]\n]\s*)$/;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const before = text.slice(0, match.index);
    if (standaloneStartPattern.test(before)) {
      return match.index;
    }
    // This is a keyword reference inside a sentence, skip it
  }
  return -1;
}

// ============================================================================
// Single Segment Parsers
// ============================================================================

/**
 * Parse a keyword segment into an Ability.
 */
function parseKeywordSegment(text: string): KeywordAbility | undefined {
  // Match the keyword bracket
  const kwMatch = KEYWORD_AT_POS_RE.exec(text);
  if (!kwMatch) {
    return undefined;
  }

  const keyword = kwMatch[1];
  const valueStr = kwMatch[2];
  const afterBracket = text.slice(kwMatch[0].length);

  // Simple keywords
  if (ALL_SIMPLE_KEYWORDS.includes(keyword)) {
    return { keyword: keyword as SimpleKeyword, type: "keyword" } as SimpleKeywordAbility;
  }

  // Value keywords
  if (ALL_VALUE_KEYWORDS.includes(keyword)) {
    const value = valueStr ? Number.parseInt(valueStr, 10) : 1;
    return { keyword: keyword as ValueKeyword, type: "keyword", value } as ValueKeywordAbility;
  }

  // Cost keywords
  if (ALL_COST_KEYWORDS.includes(keyword)) {
    const result = parseCostKeyword(keyword as CostKeyword, afterBracket);
    if (result) {
      return result;
    }
    // If cost parsing failed but it's a valid cost keyword, return undefined
    return undefined;
  }

  // Effect keywords
  if (ALL_EFFECT_KEYWORDS.includes(keyword)) {
    const results = parseEffectKeywordsWithPositions(text);
    if (results.length > 0) {
      return results[0].ability;
    }
    return undefined;
  }

  return undefined;
}

/**
 * Parse a non-keyword segment into one or more Abilities.
 * Returns a single ability, or undefined. For multiple abilities from one segment,
 * use parseOtherSegmentMulti.
 */
/**
 * Try to parse an additional cost ability.
 * Handles:
 * - "As you play me/this, you may ... as an additional cost. ..."
 * - "You may pay COST as an additional cost to play me."
 */
function parseAdditionalCostAbility(text: string): Ability | undefined {
  // "As you play me/this, you may ... as an additional cost."
  const asYouPlayMatch = text.match(
    /^As you play (?:me|this),\s+you may\s+(.+?)\s+as an additional cost\b/i,
  );
  if (asYouPlayMatch) {
    return {
      effect: {
        additionalCost: asYouPlayMatch[1],
        optional: true,
        type: "additional-cost-option",
      } as unknown as Effect,
      type: "static",
    } as Ability;
  }

  // "You may pay COST as an additional cost to play me."
  // Captures the cost tokens so downstream consumers can read them.
  const youMayPayMatch = text.match(
    /^You may pay\s+((?::rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)):)+)\s+as an additional cost to play me\.?$/i,
  );
  if (youMayPayMatch) {
    return {
      effect: {
        additionalCost: youMayPayMatch[1],
        optional: true,
        type: "additional-cost-option",
      } as unknown as Effect,
      type: "static",
    } as Ability;
  }

  // "You may spend N XP as an additional cost to play me/this[. If you do, ...]"
  // UNL-set champion progression: emits an `xp` additional cost.
  // The optional trailing "If you do, I cost [N] less." payoff is captured
  // As the ability's `ifPaid` effect so downstream engine code can read it.
  const spendXpAdditionalMatch = text.match(
    /^You may spend\s+(\d+)\s+XP\s+as an additional cost to play (?:me|this)\.(?:\s+If you do,\s+(.+?))?\s*$/i,
  );
  if (spendXpAdditionalMatch) {
    const amount = Number.parseInt(spendXpAdditionalMatch[1], 10);
    const payoffRaw = spendXpAdditionalMatch[2]?.trim();
    let ifPaid: Effect | undefined;
    if (payoffRaw) {
      // Try the static cost-reduction parser first since "I cost N less" is
      // A static pattern, not a spell effect.
      const payoffAbility = parseStaticAbility(payoffRaw);
      if (payoffAbility) {
        ifPaid = (payoffAbility.ability as { effect: Effect }).effect;
      } else {
        ifPaid = parseEffects(payoffRaw) ?? parseEffect(payoffRaw);
      }
    }
    const effect: Record<string, unknown> = {
      additionalCost: { xp: amount },
      optional: true,
      type: "additional-cost-option",
    };
    if (ifPaid) {
      effect.ifPaid = ifPaid;
    }
    return {
      effect: effect as unknown as Effect,
      type: "static",
    } as Ability;
  }

  return undefined;
}

/**
 * Parse a replacement ability.
 *
 * Handles:
 * - "The next time TARGET would EVENT[, REPLACEMENT] instead."
 * - "Choose TARGET. The next time it would die this turn, ... instead."
 * - "EFFECT the next time it takes damage this turn." (Noxian Guillotine form)
 * - "If a combat where you are the attacker ends in a tie, RECALL instead."
 *   (combat-tie replacement)
 *
 * The replacement body is parsed recursively via `parseEffects` so that
 * compound effects ("heal it, exhaust it, and recall it") become proper
 * sequences rather than raw text.
 */
function parseReplacementAbility(text: string): Ability | undefined {
  const cleaned = text
    .replace(/^Choose (?:a|an) (?:friendly |enemy )?(?:unit|gear)\.\s*/i, "")
    .trim();

  // Form 1: "The next time TARGET [would] EVENT[, [this turn,]] REPLACEMENT instead."
  // Trailing "instead" is optional — many cards omit it when the replacement body
  // Makes the substitution implicit ("heal it, exhaust it, and recall it").
  const theNextTimeMatch = cleaned.match(
    /^The next time (a friendly unit|an? (?:enemy )?unit|me|it) (?:would )?(die|dies|takes? damage)(?:\s+this turn)?,\s*(.+?)(?:\s+instead)?\.?\s*$/i,
  );
  if (theNextTimeMatch) {
    const eventStr = theNextTimeMatch[2].toLowerCase().replace(/s$/, "");
    const replaces: "die" | "take-damage" =
      eventStr === "die" || eventStr === "dies" ? "die" : "take-damage";
    const body = theNextTimeMatch[3].trim();
    const parsed = parseEffects(body) ?? parseEffect(body);
    return {
      duration: "next",
      replacement: (parsed ?? { text: body, type: "raw" }) as Effect,
      replaces,
      type: "replacement",
    } as Ability;
  }

  // Form 2: "EFFECT the next time it [would] EVENT this turn."
  // Covers Noxian Guillotine: "Kill it the next time it takes damage this turn."
  const trailingNextTimeMatch = cleaned.match(
    /^(.+?)\s+the next time (?:an? (?:friendly |enemy )?unit|it|me)\s+(?:would\s+)?(die|dies|takes? damage)(?:\s+this turn)?\.?$/i,
  );
  if (trailingNextTimeMatch) {
    const body = trailingNextTimeMatch[1].trim();
    const eventStr = trailingNextTimeMatch[2].toLowerCase().replace(/s$/, "");
    const replaces: "die" | "take-damage" =
      eventStr === "die" || eventStr === "dies" ? "die" : "take-damage";
    const parsed = parseEffects(body) ?? parseEffect(body);
    if (parsed) {
      return {
        duration: "next",
        replacement: parsed,
        replaces,
        type: "replacement",
      } as Ability;
    }
  }

  // Form 3: "When any unit takes damage this turn, REPLACEMENT."
  // Imperial Decree: turn-scoped damage-reaction that kills the damaged unit.
  // Parsed as a "turn"-duration replacement on take-damage.
  const whenAnyDamageMatch = cleaned.match(
    /^When any unit takes damage(?:\s+this turn)?,\s*(.+?)\.?$/i,
  );
  if (whenAnyDamageMatch) {
    const body = whenAnyDamageMatch[1].trim();
    const parsed = parseEffects(body) ?? parseEffect(body);
    if (parsed) {
      return {
        duration: "turn",
        replacement: parsed,
        replaces: "take-damage",
        type: "replacement",
      } as Ability;
    }
  }

  // Form 4: "If a combat where you are the attacker ends in a tie, RECALL instead."
  // Symbol of the Solari: combat-tie replacement.
  const combatTieMatch = cleaned.match(
    /^If a combat where you are the attacker ends in a tie,\s*(.+?)(?:\s+instead)?\.?$/i,
  );
  if (combatTieMatch) {
    const body = combatTieMatch[1].trim();
    const parsed = parseEffects(body) ?? parseEffect(body);
    if (parsed) {
      return {
        duration: "permanent",
        replacement: parsed,
        replaces: "combat-tie",
        type: "replacement",
      } as Ability;
    }
  }

  // Form 5: "If you would reveal cards from a deck, look at the top card first..."
  // Void Hatchling: a reveal replacement that inserts a look-and-optional-recycle
  // Step before the reveal happens.
  if (
    /^If you would reveal cards from a deck, look at the top card first\.\s*You may recycle it\.\s*Then reveal those cards\.?$/i.test(
      cleaned,
    )
  ) {
    return {
      duration: "permanent",
      replacement: {
        effects: [
          { amount: 1, from: "deck", then: { recycle: "rest" }, type: "look" } as unknown as Effect,
          { amount: 1, from: "deck", type: "reveal" } as unknown as Effect,
        ],
        type: "sequence",
      } as SequenceEffect,
      replaces: "reveal",
      type: "replacement",
    } as Ability;
  }

  return undefined;
}

function parseOtherSegment(text: string): Ability | undefined {
  const cleaned = stripReminders(text).trim();
  if (!cleaned) {
    return undefined;
  }

  // Try activated ability
  const activated = parseActivatedAbility(cleaned);
  if (activated) {
    return activated;
  }

  // Try spell ability
  const spell = parseSpellAbility(cleaned);
  if (spell) {
    return spell;
  }

  // Try triggered ability
  const triggered = parseTriggeredAbility(cleaned);
  if (triggered) {
    return triggered;
  }

  // Try replacement ability: "The next time TARGET would EVENT, REPLACEMENT."
  // Also handles "Choose a friendly unit. The next time it dies this turn, recall it exhausted instead."
  const replacementAbility = parseReplacementAbility(cleaned);
  if (replacementAbility) {
    return replacementAbility;
  }

  // Try additional cost ability: "As you play me/this, ..."
  const additionalCostAbility = parseAdditionalCostAbility(cleaned);
  if (additionalCostAbility) {
    return additionalCostAbility;
  }

  // Try static ability
  const staticResult = parseStaticAbility(cleaned);
  if (staticResult) {
    return staticResult.ability;
  }

  // Try standalone effect (treat as spell with action timing)
  const effect = parseEffects(cleaned);
  if (effect) {
    return { effect, timing: "action", type: "spell" } as SpellAbility;
  }

  return undefined;
}

/**
 * Parse a non-keyword segment that may contain multiple abilities.
 * Splits on trigger boundaries (When..., At the start of..., etc.)
 * and parses each sub-segment.
 */
function parseOtherSegmentMulti(text: string): Ability[] {
  const cleaned = stripReminders(text).trim();
  if (!cleaned) {
    return [];
  }

  // Try splitting on trigger/ability boundaries first if there are multiple
  const subSegments = splitOnAbilityBoundaries(cleaned);
  if (subSegments.length > 1) {
    const abilities: Ability[] = [];
    for (const sub of subSegments) {
      const ability = parseOtherSegment(sub);
      if (ability) {
        abilities.push(ability);
      }
    }
    if (abilities.length > 0) {
      return abilities;
    }
  }

  // Fall back to single ability parse
  const single = parseOtherSegment(text);
  if (single) {
    return [single];
  }

  return [];
}

/**
 * Check if an ability has a raw effect (unparsed text).
 */
function hasRawEffectAbility(ability: Ability): boolean {
  if ("effect" in ability) {
    const eff = (ability as { effect: { type: string } }).effect;
    return eff?.type === "raw";
  }
  return false;
}

/**
 * Split text on ability boundaries: triggers, statics, activated abilities, etc.
 *
 * Recognizes starts of:
 * - Triggered: "When ...", "At the start/end ...", "The first/third time ...", "Whenever ..."
 * - Static: "While ...", "Other ...", "Your ...", "Friendly ...", "Each ..."
 * - Activated: ":rb_..." (cost tokens at start of line)
 *
 * Only splits when there are 2+ recognized boundaries.
 */
function splitOnAbilityBoundaries(text: string): string[] {
  // Pattern that matches the start of a new ability in card text.
  // Uses lookahead so we don't consume the matched text.
  const boundaryPattern =
    /(?=(?:When (?:you |I |a |an |another |the )|At the (?:start|end) of |The (?:first|second|third|next) time |Whenever |While (?:I'm|you)|Other friendly |Your [A-Z]|Friendly (?:units|buffed)|Enemy (?:units|gear)|Stunned (?:enemy|friendly) |Each |If (?:you've|an |I )|Play (?:a |an |one |two |three |four |five |six |\d+ )|Recycle \d|Spend ))|(?<=[.\n)]\s*)(?=I enter ready)|(?<=\.\s?)(?=:rb_)|(?<=\.)\n(?=[A-Z])/g;

  const indices: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = boundaryPattern.exec(text)) !== null) {
    indices.push(match.index);
    // Advance by 1 to avoid infinite loop on zero-width matches
    if (match[0].length === 0) {
      boundaryPattern.lastIndex = match.index + 1;
    }
  }

  // If the text doesn't start at a boundary, add 0 as the first index
  if (indices.length > 0 && indices[0] !== 0) {
    indices.unshift(0);
  }

  if (indices.length <= 1) {
    return [text];
  }

  const segments: string[] = [];
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i];
    const end = i + 1 < indices.length ? indices[i + 1] : text.length;
    const seg = text.slice(start, end).trim();
    if (seg) {
      segments.push(seg);
    }
  }

  return segments;
}

/**
 * Handle the special case where [Action]/[Reaction] is followed by [Repeat].
 * These merge into a single spell ability with a repeat cost.
 */
function mergeSpellWithRepeat(segments: TextSegment[]): TextSegment[] {
  const merged: TextSegment[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    // Check if this is a [Action] or [Reaction] segment
    if (seg.type === "keyword" && /^\[(Action|Reaction)\]/i.test(seg.text)) {
      // Check if next segment is [Repeat]
      if (
        i + 1 < segments.length &&
        segments[i + 1].type === "keyword" &&
        /^\[Repeat\]/i.test(segments[i + 1].text)
      ) {
        // And there's an effect segment after that
        if (i + 2 < segments.length && segments[i + 2].type === "other") {
          // Merge all three into one "other" segment
          merged.push({
            text: `${seg.text}${segments[i + 1].text}${segments[i + 2].text}`,
            type: "other",
          });
          i += 2;
          continue;
        }
        // Merge spell + repeat into one segment
        merged.push({
          text: `${seg.text}${segments[i + 1].text}`,
          type: "other",
        });
        i += 1;
        continue;
      }

      // Check if this [Action]/[Reaction] is followed by "other" (its effect)
      // This is the normal case for [Hidden][Action] Effect.
      // The [Action] needs its following effect text
      if (i + 1 < segments.length && segments[i + 1].type === "other") {
        merged.push({
          text: `${seg.text}${segments[i + 1].text}`,
          type: "other",
        });
        i += 1;
        continue;
      }
    }

    // Check if this is [Repeat] without a preceding [Action]/[Reaction]
    if (seg.type === "keyword" && /^\[Repeat\]/i.test(seg.text)) {
      // Check if followed by effect text
      if (i + 1 < segments.length && segments[i + 1].type === "other") {
        merged.push({
          text: `${seg.text}${segments[i + 1].text}`,
          type: "other",
        });
        i += 1;
        continue;
      }
    }

    merged.push(seg);
  }

  return merged;
}

/**
 * Handle comma-separated value keywords like "[Assault 2], [Shield 2]"
 */
function splitCommaSeparatedKeywords(text: string): Ability[] | undefined {
  // Match pattern: [Keyword N], [Keyword N] (reminder)
  const commaKwPattern = /^\[(\w+(?:-\w+)?)(?:\s+(\d+))?\]\s*,\s*\[(\w+(?:-\w+)?)(?:\s+(\d+))?\]/;
  const match = commaKwPattern.exec(text);
  if (!match) {
    return undefined;
  }

  const kw1 = match[1];
  const val1 = match[2] ? Number.parseInt(match[2], 10) : 1;
  const kw2 = match[3];
  const val2 = match[4] ? Number.parseInt(match[4], 10) : 1;

  const abilities: Ability[] = [];

  if (ALL_VALUE_KEYWORDS.includes(kw1)) {
    abilities.push({
      keyword: kw1 as ValueKeyword,
      type: "keyword",
      value: val1,
    } as ValueKeywordAbility);
  } else if (ALL_SIMPLE_KEYWORDS.includes(kw1)) {
    abilities.push({ keyword: kw1 as SimpleKeyword, type: "keyword" } as SimpleKeywordAbility);
  }

  if (ALL_VALUE_KEYWORDS.includes(kw2)) {
    abilities.push({
      keyword: kw2 as ValueKeyword,
      type: "keyword",
      value: val2,
    } as ValueKeywordAbility);
  } else if (ALL_SIMPLE_KEYWORDS.includes(kw2)) {
    abilities.push({ keyword: kw2 as SimpleKeyword, type: "keyword" } as SimpleKeywordAbility);
  }

  return abilities.length > 0 ? abilities : undefined;
}

// ============================================================================
// Spell + Repeat Parsing
// ============================================================================

/**
 * Parse spell abilities that include [Repeat] keywords.
 *
 * Handles patterns like:
 * - "[Action][Repeat] :cost: (reminder)Effect text."
 * - "[Reaction][Repeat] :cost: (reminder)Effect text."
 * - "[Repeat] :cost: (reminder)Effect text."
 */
function parseSpellWithRepeat(text: string): SpellAbility | undefined {
  // Match: optional [Action|Reaction], then [Repeat] with cost
  const pattern =
    /^(?:\[(Action|Reaction)\]\s*(?:_?\s*\([^)]*\)\s*_?\s*)?)?\[Repeat\]\s*((?::rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)):)+)\s*(?:_?\s*\([^)]*\)\s*_?\s*)?(.+)$/s;
  const match = pattern.exec(text);
  if (!match) {
    return undefined;
  }

  const timingStr = match[1]?.toLowerCase() as "action" | "reaction" | undefined;
  const costStr = match[2];
  const effectText = stripReminders(match[3]).trim();

  const repeatCost = parseCost(costStr);

  // Parse the effect
  const effect = parseEffects(effectText);
  if (!effect) {
    // Use raw effect for unparsed text
    const rawEffect = { text: effectText, type: "raw" } as unknown as Effect;
    const spell: SpellAbility = {
      effect: rawEffect,
      repeat: repeatCost,
      timing: timingStr ?? "action",
      type: "spell",
    };
    return spell;
  }

  return {
    effect,
    repeat: repeatCost,
    timing: timingStr ?? "action",
    type: "spell",
  } as SpellAbility;
}

// ============================================================================
// Hunt Keyword Expansion (UNL set)
// ============================================================================

/**
 * Expand a `[Hunt N]` keyword ability into the two triggered abilities it
 * implies: "When I conquer, gain N XP." and "When I hold, gain N XP."
 *
 * The original Hunt keyword ability is preserved in the output for display
 * and trigger-matching (the engine's `find-matching-triggers` walks the
 * ability list), so downstream code can still tell the unit has Hunt.
 */
function expandHuntKeywords(abilities: Ability[]): Ability[] {
  const result: Ability[] = [];
  for (const ab of abilities) {
    result.push(ab);
    if (ab.type === "keyword" && (ab as { keyword?: string }).keyword === "Hunt") {
      const amount = (ab as { value?: number }).value ?? 1;
      const gainXp = { amount, type: "gain-xp" } as unknown as Effect;
      result.push({
        effect: gainXp,
        trigger: { event: "conquer", on: "self" },
        type: "triggered",
      } as TriggeredAbility);
      result.push({
        effect: gainXp,
        trigger: { event: "hold", on: "self" },
        type: "triggered",
      } as TriggeredAbility);
    }
  }
  return result;
}

// ============================================================================
// Level-Gated Ability Parser (UNL set)
// ============================================================================

/**
 * Attach a `while-level` condition to an ability without losing its existing
 * conditional shape. If the ability already has a condition, the two are
 * AND-composed.
 */
function attachLevelCondition(ability: Ability, threshold: number): Ability {
  const levelCond = { threshold, type: "while-level" as const };

  // Abilities whose runtime shape carries a `condition` field: triggered,
  // Activated, static, and effect-keyword abilities.
  const withCond = ability as unknown as { condition?: unknown };
  const existing = withCond.condition as { type?: string } | undefined;

  let newCond: unknown = levelCond;
  if (existing && typeof existing === "object") {
    if (existing.type === "and") {
      const conds = (existing as { conditions?: unknown[] }).conditions ?? [];
      newCond = { conditions: [...conds, levelCond], type: "and" };
    } else {
      newCond = { conditions: [existing, levelCond], type: "and" };
    }
  }

  return { ...(ability as object), condition: newCond } as Ability;
}

/**
 * Parse text that contains one or more `[Level N][>] <effect>` blocks.
 *
 * Splits on `[Level N]` boundaries and:
 *   1. Parses text preceding the first `[Level N]` marker with the normal
 *      `parseAbilities` pipeline (these abilities have no XP gating).
 *   2. For each `[Level N] <chunk>` segment, parses the chunk and tags every
 *      resulting ability with `{condition: {type: "while-level", threshold: N}}`.
 *
 * Returns `undefined` if parsing fails to produce any abilities at all, so
 * the caller can fall back to the standard pipeline.
 */
function parseLevelGatedAbilities(text: string): ParseAbilitiesResult | undefined {
  const LEVEL_RE = /\[Level\s+(\d+)\]\s*/gi;
  const matches: { index: number; end: number; threshold: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = LEVEL_RE.exec(text)) !== null) {
    matches.push({
      end: m.index + m[0].length,
      index: m.index,
      threshold: Number.parseInt(m[1], 10),
    });
  }
  if (matches.length === 0) {
    return undefined;
  }

  const allAbilities: Ability[] = [];

  // Prefix text: anything before the first [Level N] marker. Parse via the
  // Inner function so that Hunt expansion runs once at the outer layer.
  const prefix = text.slice(0, matches[0].index).trim().replace(/[,.]\s*$/, "").trim();
  if (prefix.length > 0) {
    const prefixResult = parseAbilitiesInner(prefix);
    if (prefixResult.success && prefixResult.abilities) {
      allAbilities.push(...prefixResult.abilities);
    }
  }

  // Each level chunk: runs from the end of its marker to the start of the next
  // Marker (or to the end of the text for the last chunk).
  for (let i = 0; i < matches.length; i++) {
    const chunkStart = matches[i].end;
    const chunkEnd = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const chunkText = text.slice(chunkStart, chunkEnd).trim().replace(/^[>.\s]+/, "").trim();
    if (!chunkText) {
      continue;
    }
    const chunkResult = parseAbilitiesInner(chunkText);
    if (chunkResult.success && chunkResult.abilities) {
      for (const ab of chunkResult.abilities) {
        allAbilities.push(attachLevelCondition(ab, matches[i].threshold));
      }
    }
  }

  if (allAbilities.length === 0) {
    return undefined;
  }
  return { abilities: allAbilities, success: true };
}

// ============================================================================
// Main Multi-Ability Parser
// ============================================================================

/**
 * Parse ability text that may contain multiple abilities.
 *
 * Card text often contains multiple abilities separated by line breaks or
 * specific patterns. This function parses all abilities from the text.
 *
 * @param text - The ability text to parse (may contain multiple abilities)
 * @param _options - Optional parser options to control output fields
 * @returns ParseAbilitiesResult with all parsed abilities or error
 */
export function parseAbilities(text: string, options?: ParserOptions): ParseAbilitiesResult {
  const result = parseAbilitiesInner(text, options);
  // Post-process: expand [Hunt N] keywords into the triggered gain-xp
  // Abilities they imply on conquer and hold.
  if (result.success && result.abilities) {
    return { ...result, abilities: expandHuntKeywords(result.abilities) };
  }
  return result;
}

function parseAbilitiesInner(text: string, _options?: ParserOptions): ParseAbilitiesResult {
  if (!text || text.trim().length === 0) {
    return { error: "Empty ability text", success: false };
  }

  // Normalize bracket tokens to :rb_xxx: format before any parsing/splitting.
  // This converts [Exhaust] -> :rb_exhaust:, [N] -> :rb_energy_N:,
  // [fury]/[calm]/etc -> :rb_rune_X:, [Might] -> :rb_might:, [Buff] -> Buff,
  // And strips "[>]" indicator arrows.
  const trimmed = normalizeTokens(text.trim());

  // === Level-gated pre-pass (UNL set) ===
  // "[Level N] <effect>" means the effect is active only while the controller
  // Has at least N XP. Split the text on `[Level N]` boundaries, parse each
  // Chunk, and wrap the resulting abilities with a `while-level` condition.
  // Non-level content before any `[Level N]` marker is parsed normally.
  if (/\[Level\s+\d+\]/i.test(trimmed)) {
    const levelResult = parseLevelGatedAbilities(trimmed);
    if (levelResult) {
      return levelResult;
    }
  }

  // === Fast path: try single-ability parse first ===
  // This handles activated, spell, triggered, and standalone effects.
  // These parsers already handle keywords embedded in their text
  // (e.g., "give a unit [Ganking]").
  const singleResult = parseSingleAbility(trimmed);
  if (singleResult.success) {
    const hasRawEffect = singleResult.abilities?.some(
      (a) => "effect" in a && (a as { effect: { type: string } }).effect?.type === "raw",
    );
    const startsWithKeyword =
      /^\[(?:Tank|Backline|Ganking|Hidden|Temporary|Quick-Draw|Weaponmaster|Unique|Ambush|Assault|Shield|Deflect|Hunt|Accelerate|Equip|Repeat|Deathknell|Legion|Vision|Action|Reaction)(?:\s+\d+)?\]/.test(
        trimmed,
      );

    // When text starts with a keyword bracket, check if parseSingleAbility preserved it.
    // If the first result is not a keyword ability, the leading keyword was dropped
    // By triggered/static/spell parsing -- fall through to multi-split which preserves keywords.
    const firstIsKeyword = singleResult.abilities?.[0]?.type === "keyword";
    const droppedLeadingKeyword = startsWithKeyword && !firstIsKeyword;

    if (startsWithKeyword) {
      // For [Action]/[Reaction], accept if no raw effects AND no [Repeat] keyword
      // ([Repeat] needs special spell+repeat parsing that the single path misses)
      if (/^\[(Action|Reaction)\]/.test(trimmed) && !hasRawEffect && !/\[Repeat\]/.test(trimmed)) {
        return singleResult;
      }
      // For other keywords, always try multi-ability to preserve keywords
    } else {
      // Text doesn't start with a keyword bracket.
      // Still try multi-ability if there are clear indicators of multiple abilities:
      // - A closing paren immediately followed by text that starts a new ability
      //   (e.g., "...(reminder)I enter ready..." or "...(reminder):rb_energy_1:...")
      // - A period followed by :rb_ (activated ability after sentence)
      // - Newlines separating abilities (e.g., "When I move, discard 1.\nWhen I win a combat, draw 1.")
      // - Multiple "Spend N XP" or "Spend <buff>" activated-cost openers (e.g., Voidreaver)
      const hasPostReminderAbility = /\)[A-Z:I]/.test(trimmed) || /\.\s*:rb_/.test(trimmed);
      const hasNewlineSeparatedAbilities = trimmed.includes("\n");
      const hasMultipleSpendActivated =
        (trimmed.match(/\bSpend\s+\d+\s+XP\b/g) ?? []).length >= 2;
      if (
        !hasRawEffect &&
        !hasPostReminderAbility &&
        !hasNewlineSeparatedAbilities &&
        !hasMultipleSpendActivated
      ) {
        return singleResult;
      }
    }
    // Fall through to multi-ability splitting for better results
  }

  // === Single-ability parse failed. Try multi-ability splitting. ===

  // Check for comma-separated keywords like "[Assault 2], [Shield 2]"
  const commaResult = splitCommaSeparatedKeywords(trimmed);
  if (commaResult && commaResult.length > 0) {
    return { abilities: commaResult, success: true };
  }

  // Try spell+repeat pattern
  const spellRepeat = parseSpellWithRepeat(trimmed);
  if (spellRepeat) {
    return { abilities: [spellRepeat], success: true };
  }

  // Multi-ability splitting
  const rawSegments = splitAbilityText(trimmed);

  // Merge [Action]/[Reaction] with their following [Repeat] and/or effect
  const segments = mergeSpellWithRepeat(rawSegments);

  // If splitting produced only one segment, try parsing it as a multi-ability "other" segment
  // Before falling back to the single-ability result.
  if (segments.length <= 1) {
    if (segments.length === 1) {
      const seg = segments[0];
      if (seg.type === "keyword") {
        const kwAbility = parseKeywordSegment(seg.text);
        if (kwAbility) {
          return { abilities: [kwAbility], success: true };
        }
      }
      // Try multi-ability parse on the single "other" segment
      if (seg.type === "other") {
        const multiResult = parseOtherSegmentMulti(seg.text);
        if (multiResult.length > (singleResult.abilities?.length ?? 0)) {
          return { abilities: multiResult, success: true };
        }
      }
    }
    // Fall back to single-ability raw result if the multi-ability split couldn't do better
    if (singleResult.success) {
      return singleResult;
    }
    return { error: "Could not parse ability text", success: false };
  }

  const abilities: Ability[] = [];

  for (const seg of segments) {
    if (seg.type === "keyword") {
      // Check if this is [Action] or [Reaction] that should be parsed as spell
      if (/^\[(Action|Reaction)\]/i.test(seg.text)) {
        const spell = parseSpellAbility(seg.text);
        if (spell) {
          abilities.push(spell);
          continue;
        }
      }

      const kwAbility = parseKeywordSegment(seg.text);
      if (kwAbility) {
        abilities.push(kwAbility);
      }
    } else {
      // "other" segment - try all non-keyword parsers
      const cleaned = seg.text;

      // Check if this contains a [Repeat] pattern merged with spell
      const repeatSpell = parseSpellWithRepeat(cleaned);
      if (repeatSpell) {
        abilities.push(repeatSpell);
        continue;
      }

      const parsedAbilities = parseOtherSegmentMulti(cleaned);
      if (parsedAbilities.length > 0) {
        for (const ability of parsedAbilities) {
          abilities.push(ability);
        }
      } else {
        // Unparsed "other" segment in multi-ability context: preserve as raw static
        const strippedOther = stripReminders(cleaned).trim();
        if (strippedOther.length > 10) {
          abilities.push({
            effect: { text: strippedOther, type: "raw" } as unknown as Effect,
            type: "static",
          } as Ability);
        }
      }
    }
  }

  if (abilities.length > 0) {
    // Compare quality: prefer whichever result has more "real" (non-raw) ability structure.
    // An activated/triggered/keyword is worth more than a raw static.
    if (singleResult.success) {
      const isRealAbility = (a: Ability): boolean =>
        a.type === "keyword" ||
        a.type === "replacement" ||
        ((a.type === "activated" ||
          a.type === "triggered" ||
          a.type === "spell" ||
          a.type === "static") &&
          (!("effect" in a) || (a as { effect: { type: string } }).effect?.type !== "raw"));
      const singleReal = (singleResult.abilities ?? []).filter(isRealAbility).length;
      const multiReal = abilities.filter(isRealAbility).length;
      // If multi is strictly worse (fewer real abilities), prefer single
      if (multiReal < singleReal) {
        return singleResult;
      }
      // If tied on real count but single has more total, also prefer single
      // (multi may have padded with raw statics)
      if (multiReal === singleReal && (singleResult.abilities?.length ?? 0) >= abilities.length) {
        return singleResult;
      }
    }
    return { abilities, success: true };
  }

  // Multi-ability splitting failed. Fall back to single-ability raw result if available.
  if (singleResult.success) {
    return singleResult;
  }

  return { error: "Could not parse ability text", success: false };
}

/**
 * Check if text contains any keyword bracket pattern
 */
function hasAnyKeywordBracket(text: string): boolean {
  return /\[(Tank|Backline|Ganking|Hidden|Temporary|Quick-Draw|Weaponmaster|Unique|Ambush|Assault|Shield|Deflect|Hunt|Accelerate|Equip|Repeat|Deathknell|Legion|Vision|Action|Reaction)(?:\s+\d+)?\]/.test(
    text,
  );
}

/**
 * Parse text as a single ability (original behavior)
 */
function parseSingleAbility(text: string): ParseAbilitiesResult {
  // Try activated ability
  const activated = parseActivatedAbility(text);
  if (activated) {
    return { abilities: [activated], success: true };
  }

  // Try spell ability
  const spell = parseSpellAbility(text);
  if (spell) {
    return { abilities: [spell], success: true };
  }

  // Try triggered ability
  const triggered = parseTriggeredAbility(text);
  if (triggered) {
    return { abilities: [triggered], success: true };
  }

  // Try static ability
  const staticResult = parseStaticAbility(text);
  if (staticResult) {
    return { abilities: [staticResult.ability], success: true };
  }

  // Try standalone effect (treat as spell with action timing)
  const effect = parseEffects(text);
  if (effect) {
    return {
      abilities: [{ effect, timing: "action", type: "spell" } as SpellAbility],
      success: true,
    };
  }

  return { error: "Could not parse ability text", success: false };
}

/**
 * Validate ability text without fully parsing
 *
 * @param text - The ability text to validate
 * @returns true if the text appears to be valid ability text
 */
export function validateAbilityText(text: string): boolean {
  if (!text || text.trim().length === 0) {
    return false;
  }
  return true;
}
