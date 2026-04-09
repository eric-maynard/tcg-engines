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
  // Handle "Draw N for each ..." conditional draw patterns
  const forEachMatch = text.match(
    /^Draw (\d+) for each (?:of )?((?:your |other |friendly )?(?:\[?\w+\]?\s*)?(?:units?|friendly units?|cards?|gear)(?:\s+(?:here|at a battlefield|there))?)\.?$/i,
  );
  if (forEachMatch) {
    const perUnit = Number.parseInt(forEachMatch[1], 10);
    const countTarget = forEachMatch[2].trim().toLowerCase();
    const countObj: { type: "count"; per: number; of: AnyTarget } = {
      of: parseTarget(countTarget) as AnyTarget,
      per: perUnit,
      type: "count",
    };
    return { amount: countObj, type: "draw" } as unknown as DrawEffect;
  }

  const match = text.match(/^Draw (\d+)\.?/i);
  if (!match) {
    return undefined;
  }
  return { amount: Number.parseInt(match[1], 10), type: "draw" };
}

/**
 * Try to parse a channel effect: "Channel N rune(s) [exhausted]."
 */
function parseChannelEffect(text: string): ChannelEffect | undefined {
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
 */
function parseBuffEffect(text: string): BuffEffect | undefined {
  const match = text.match(/^Buff (me|a friendly unit|a unit)\.?/i);
  if (!match) {
    return undefined;
  }
  const targetText = match[1].toLowerCase();
  const target: AnyTarget =
    targetText === "me"
      ? ("self" as const)
      : (targetText === "a friendly unit"
        ? ({ controller: "friendly" as const, type: "unit" as const } as Target)
        : ({ type: "unit" as const } as Target));
  return { target, type: "buff" };
}

/**
 * Try to parse a damage effect: "Deal N to TARGET."
 */
function parseDamageEffect(text: string): DamageEffect | undefined {
  // Handle "deal N damage split among" pattern
  const splitMatch = text.match(/^Deal (\d+) damage split among (.+?)\.?$/i);
  if (splitMatch) {
    const amount = Number.parseInt(splitMatch[1], 10);
    const targetText = splitMatch[2].toLowerCase();
    const target: {
      type: "unit";
      controller?: "friendly" | "enemy";
      location?: Location;
      quantity?: "all" | number;
    } = { type: "unit" };

    if (targetText.includes("enemy")) {
      target.controller = "enemy";
    } else if (targetText.includes("friendly")) {
      target.controller = "friendly";
    }
    if (targetText.includes("here")) {
      target.location = "here" as Location;
    } else if (targetText.includes("at a battlefield") || targetText.includes("at battlefields")) {
      target.location = "battlefield";
    }

    return { amount, split: true, target: target as AnyTarget, type: "damage" } as DamageEffect;
  }

  // Handle "deal damage equal to my Might to TARGET" pattern
  const mightDamageMatch = text.match(/^Deal damage equal to my Might to (.+?)\.?$/i);
  if (mightDamageMatch) {
    const targetText = mightDamageMatch[1].toLowerCase();
    const target: { type: "unit"; controller?: "friendly" | "enemy"; location?: Location } = {
      type: "unit",
    };

    if (targetText.includes("enemy")) {
      target.controller = "enemy";
    } else if (targetText.includes("friendly")) {
      target.controller = "friendly";
    }
    if (targetText.includes("in a base") || targetText.includes("at base")) {
      target.location = "base";
    } else if (targetText.includes("here")) {
      target.location = "here" as Location;
    } else if (targetText.includes("at a battlefield")) {
      target.location = "battlefield";
    }

    return {
      amount: { of: "self", type: "might" } as { of: string; type: string },
      target: target as AnyTarget,
      type: "damage",
    } as DamageEffect;
  }

  const match = text.match(/^Deal (\d+) to (.+?)\.?$/i);
  if (!match) {
    return undefined;
  }
  const amount = Number.parseInt(match[1], 10);
  const targetText = match[2].toLowerCase();
  const target: {
    type: "unit";
    controller?: "friendly" | "enemy";
    location?: Location;
    quantity?: "all" | number;
  } = { type: "unit" };

  if (targetText.includes("enemy")) {
    target.controller = "enemy";
  } else if (targetText.includes("friendly")) {
    target.controller = "friendly";
  }
  if (targetText.includes("all ")) {
    target.quantity = "all";
  }
  if (
    targetText.includes("at a battlefield") ||
    targetText.includes("at battlefields") ||
    targetText.includes("at my battlefield")
  ) {
    target.location = "battlefield";
  } else if (targetText.includes("in a base") || targetText.includes("at base")) {
    target.location = "base";
  }

  return { amount, target: target as AnyTarget, type: "damage" };
}

/**
 * Try to parse a modify-might effect: "Give TARGET +/-N :rb_might: this turn[, to a minimum of M :rb_might:]."
 */
function parseModifyMightEffect(text: string): ModifyMightEffect | SequenceEffect | undefined {
  // Handle compound: "Give TARGET1 +N :rb_might: this turn and another TARGET2 -M :rb_might: this turn."
  const compoundMatch = text.match(
    /^Give ((?:a|an|two|three|four|five|\d+)?\s*(?:friendly |enemy |attacking enemy )?(?:unit|units|me|it)(?:\s+(?:at a battlefield|here|there))?)\s+(?:each\s+)?([+-]\d+)\s*:rb_might:\s*(this turn)?(?:,?\s*(?:to a minimum of (\d+)\s*:rb_might:))?\s+and\s+(?:another\s+)?((?:a|an|two|three|four|five|\d+)?\s*(?:friendly |enemy |attacking enemy )?(?:unit|units|me|it)(?:\s+(?:at a battlefield|here|there))?)\s+([+-]\d+)\s*:rb_might:\s*(this turn)?(?:,?\s*(?:to a minimum of (\d+)\s*:rb_might:))?\.?$/i,
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
  const match = text.match(
    /^Give ((?:a|an|two|three|four|five|\d+)?\s*(?:friendly |enemy |attacking enemy )?(?:unit|units|me|it)(?:\s+(?:at a battlefield|here|there))?|your\s+\w+(?:\s+\w+)?)\s+(?:each\s+)?([+-]\d+)\s*:rb_might:\s*(this turn)?(?:,?\s*(?:to a minimum of (\d+)\s*:rb_might:))?\.?$/i,
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
    target = parseTarget(targetStr);
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
 */
function parseKillEffect(text: string): KillEffect | undefined {
  const match = text.match(
    /^Kill (me|(?:a|an|all|any number of)\s+(?:friendly |enemy )?(?:unit|units|gear)(?:\s+(?:at a battlefield|here|there))?)(?:\s+with\s+.+)?\.?/i,
  );
  if (!match) {
    return undefined;
  }
  return { target: parseTarget(match[1]), type: "kill" };
}

/**
 * Try to parse a stun effect: "Stun TARGET."
 */
function parseStunEffect(text: string): StunEffect | undefined {
  const match = text.match(
    /^Stun ((?:a|an)\s+(?:friendly |enemy |attacking |attacking enemy )?unit(?:\s+(?:at a battlefield|here|there))?)\.?/i,
  );
  if (!match) {
    return undefined;
  }
  const targetStr = match[1].toLowerCase();
  const target: {
    type: "unit";
    controller?: "friendly" | "enemy";
    location?: Location;
    filter?: { state: string };
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
  }
  if (targetStr.includes("attacking")) {
    target.filter = { state: "attacking" };
  }
  return { target: target as AnyTarget, type: "stun" };
}

/**
 * Try to parse a move effect: "Move TARGET [to LOCATION]."
 */
function parseMoveEffect(text: string): MoveEffect | undefined {
  // Try from/to pattern first
  const fromToMatch = text.match(
    /^Move (a|an) (?:friendly |enemy )?(units?) from (a battlefield|battlefield|(?:your |its )?base|here) to (its base|(?:your )?base|here|a battlefield|battlefield)\.?$/i,
  );
  if (fromToMatch) {
    const from = parseLocationString(fromToMatch[3]);
    const to = parseLocationString(fromToMatch[4]);
    return { from, target: { type: "unit" } as AnyTarget, to, type: "move" };
  }

  // Try "any number of" pattern: "Move any number of your/friendly TOKEN units to DEST"
  const anyNumberMatch = text.match(
    /^Move any number of (?:your |friendly |enemy )?((?:\w+\s+)?units?)\s+to\s+(base|here|its base|your base|a battlefield|battlefield|this battlefield)\.?$/i,
  );
  if (anyNumberMatch) {
    const target: { type: "unit"; controller?: "friendly" | "enemy"; quantity?: "all" } = {
      type: "unit",
    };
    if (text.toLowerCase().includes("your ") || text.toLowerCase().includes("friendly ")) {
      target.controller = "friendly";
    }
    if (text.toLowerCase().includes("enemy ")) {
      target.controller = "enemy";
    }
    const to = parseLocationString(anyNumberMatch[2]);
    return { target: target as AnyTarget, to, type: "move" };
  }

  // Try basic pattern
  const basicMatch = text.match(
    /^Move (a|an|up to \d+) (friendly |enemy )?(units?)(?:\s+(to (?:base|here|its base|a battlefield|battlefield)))?(?: and ready (?:it|them))?\.?$/i,
  );
  if (basicMatch) {
    const controllerStr = basicMatch[2]?.trim();
    const target: {
      type: "unit";
      controller?: "friendly" | "enemy";
      quantity?: { upTo: number } | number;
    } = { type: "unit" };
    if (controllerStr) {
      target.controller = controllerStr.toLowerCase() as "friendly" | "enemy";
    }

    const quantityStr = basicMatch[1];
    const upToMatch = quantityStr.match(/^up to (\d+)$/i);
    if (upToMatch) {
      target.quantity = { upTo: Number.parseInt(upToMatch[1], 10) };
    }

    const destStr = basicMatch[4];
    const to: Location = destStr ? parseLocationString(destStr.replace(/^to\s+/i, "")) : "base";

    return { target: target as AnyTarget, to, type: "move" };
  }

  // Try "Move TARGET to a location where..." flexible pattern (supports both units and gear)
  const flexMoveMatch = text.match(
    /^Move (a|an) (friendly |enemy )?(unit|units|gear)(?:\s+to\s+(base|here|its base|your base|a battlefield|battlefield))?(?:\s+.*)$/i,
  );
  if (flexMoveMatch) {
    const targetType = flexMoveMatch[3].toLowerCase().replace(/s$/, "") as "unit" | "gear";
    const target: { type: "unit" | "gear"; controller?: "friendly" | "enemy" } = {
      type: targetType,
    };
    const controllerStr = flexMoveMatch[2]?.trim();
    if (controllerStr) {
      target.controller = controllerStr.toLowerCase() as "friendly" | "enemy";
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
  const match = text.match(
    /^Return (me|(?:a|an)\s+(?:friendly |enemy )?(?:unit|gear)(?:\s+(?:at a battlefield|from your trash|here|there))?(?:\s+with \d+ :rb_might: or less)?)\s+to\s+(?:its owner's|your|my owner's)\s+hand\.?$/i,
  );
  if (!match) {
    return undefined;
  }
  return { target: parseTarget(match[1]), type: "return-to-hand" };
}

/**
 * Try to parse a recall effect: "Recall TARGET [exhausted]."
 */
function parseRecallEffect(text: string): RecallEffect | undefined {
  const match = text.match(
    /^Recall (me|a unit|that unit|an? (?:friendly |enemy )?unit)(?:\s+(exhausted))?\.?$/i,
  );
  if (!match) {
    return undefined;
  }
  const target = parseTarget(match[1]);
  const exhausted = match[2]?.toLowerCase() === "exhausted";
  return exhausted ? { exhausted: true, target, type: "recall" } : { target, type: "recall" };
}

/**
 * Try to parse a ready effect: "Ready TARGET."
 */
function parseReadyEffect(text: string): Effect | undefined {
  const match = text.match(
    /^Ready (me|a unit|your units|your runes|a friendly unit|it|something else(?:\s+that's exhausted)?)\.?/i,
  );
  if (!match) {
    return undefined;
  }
  const targetText = match[1].toLowerCase();
  let target: AnyTarget;
  if (targetText === "me") {
    target = "self";
  } else if (targetText === "your units") {
    target = {
      controller: "friendly" as const,
      quantity: "all" as const,
      type: "unit" as const,
    } as AnyTarget;
  } else if (targetText === "your runes") {
    target = {
      controller: "friendly" as const,
      quantity: "all" as const,
      type: "rune" as const,
    } as AnyTarget;
  } else if (targetText === "a friendly unit") {
    target = { controller: "friendly" as const, type: "unit" as const } as AnyTarget;
  } else {
    target = { type: "unit" as const } as AnyTarget;
  }
  return { target, type: "ready" };
}

/**
 * Try to parse a grant-keyword effect: "Give TARGET [KEYWORD] this turn."
 */
function parseGrantKeywordEffect(text: string): GrantKeywordEffect | undefined {
  // Handle "Give TARGET [KEYWORD N] this turn." with optional value
  const match = text.match(
    /^Give ((?:a|an)?\s*(?:friendly |enemy )?(?:unit|units|me|it|them)(?:\s+(?:at a battlefield|here|there))?(?:\s+or\s+(?:a|an)\s+(?:friendly |enemy )?(?:unit|gear))?)\s+\[(\w+(?:-\w+)?)(?:\s+(\d+))?\]\s*(this turn)?\.?$/i,
  );
  if (match) {
    const target = parseTarget(match[1]);
    const keyword = match[2];
    const valueStr = match[3];
    const duration = match[4] ? ("turn" as const) : undefined;
    const effect: {
      type: "grant-keyword";
      keyword: string;
      target: AnyTarget;
      value?: number;
      duration?: "turn";
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
  const unitMatch = text.match(
    /^Play (a|an|one|two|three|four|five|six|\d+)\s+(?:(ready)\s+)?(\d+)\s*:rb_might:\s+(\w+(?:\s+\w+)?)\s+(unit)\s+tokens?(?:\s+with\s+\[(\w+(?:-\w+)?)\])?\s*(?:(here|to your base|into your base|exhausted))?\.?$/i,
  );
  if (unitMatch) {
    const quantityStr = unitMatch[1];
    const readyStr = unitMatch[2];
    const mightStr = unitMatch[3];
    const tokenName = unitMatch[4];
    const tokenType = unitMatch[5] as "unit";
    const keywordStr = unitMatch[6];
    const suffixStr = unitMatch[7];

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
      } else if (lower === "to your base" || lower === "into your base") {
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
  const match = text.match(/^discard (\d+)\.?/i);
  if (!match) {
    return undefined;
  }
  return { amount: Number.parseInt(match[1], 10), type: "discard" } as Effect;
}

/**
 * Try to parse a recycle effect: "Recycle me/a unit."
 */
function parseRecycleEffect(text: string): Effect | undefined {
  const match = text.match(/^Recycle (me|a unit|a card|a gear)\.?$/i);
  if (!match) {
    return undefined;
  }
  const target = parseTarget(match[1]);
  return { target, type: "recycle" } as Effect;
}

/**
 * Try to parse a score effect: "you score N [additional] point(s)."
 */
function parseScoreEffect(text: string): Effect | undefined {
  const match = text.match(/^you score (\d+)(?: additional)? points?\.?$/i);
  if (!match) {
    return undefined;
  }
  return { amount: Number.parseInt(match[1], 10), type: "score" } as Effect;
}

/**
 * Try to parse a play-from-location effect: "play a spell/unit from your trash/hand/deck..."
 */
function parsePlayEffect(text: string): Effect | undefined {
  const match = text.match(/^play a (\w+) from your (trash|hand|deck)(?:\s+.*)$/i);
  if (!match) {
    return undefined;
  }
  const cardType = match[1].toLowerCase();
  const from = match[2].toLowerCase() as "trash" | "hand" | "deck";
  return { from, target: { type: cardType } as AnyTarget, type: "play" } as Effect;
}

/**
 * Try to parse any known effect from text
 */
function parseEffect(text: string): Effect | undefined {
  let cleaned = stripReminders(text).trim();
  if (!cleaned) {
    return undefined;
  }

  // Strip "You may" prefix for optional effects
  const youMayMatch = cleaned.match(/^You may\s+/i);
  if (youMayMatch) {
    cleaned = cleaned.slice(youMayMatch[0].length);
  }

  return (
    parseDrawEffect(cleaned) ??
    parseChannelEffect(cleaned) ??
    parseBuffEffect(cleaned) ??
    parseDamageEffect(cleaned) ??
    parseModifyMightEffect(cleaned) ??
    parseKillEffect(cleaned) ??
    parseStunEffect(cleaned) ??
    parseMoveEffect(cleaned) ??
    parseReturnToHandEffect(cleaned) ??
    parseRecallEffect(cleaned) ??
    parseReadyEffect(cleaned) ??
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
    parseScoreEffect(cleaned) ??
    parsePlayEffect(cleaned) ??
    undefined
  );
}

/**
 * Parse multiple sequential effects from text, returning a sequence if more than one.
 * Splits on sentence boundaries (". ") and tries to parse each.
 */
function parseEffects(text: string): Effect | undefined {
  const cleaned = stripReminders(text).trim();
  if (!cleaned) {
    return undefined;
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

  // Try as a single effect
  const single = parseEffect(cleaned);
  if (single) {
    return single;
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
  const match = ACTIVATED_PATTERN.exec(text);
  if (!match) {
    // Try text-based activation costs: "Recycle N from your trash: EFFECT"
    const textCostMatch = text.match(
      /^(Recycle \d+ (?:from your trash|cards? from your trash)):?\s*(.+)$/is,
    );
    if (textCostMatch) {
      const costText = textCostMatch[1].trim();
      const effectPart = textCostMatch[2].trim();
      const recycleMatch = costText.match(/^Recycle (\d+)/i);
      const cost: Cost = recycleMatch
        ? ({ recycle: Number.parseInt(recycleMatch[1], 10) } as Cost)
        : ({} as Cost);
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
  const reactionMatch = remaining.match(/^\[Reaction\](?:,?\s*)/i);
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
    return ability;
  }

  // Extract "Use only if..." restriction from the text
  let restrictions: { type: string }[] | undefined;
  const useOnlyMatch = remaining.match(
    /\s*Use only if you(?:'ve|'ve) played an Equipment this turn\.?\s*$/i,
  );
  if (useOnlyMatch) {
    restrictions = [{ type: "played-equipment-this-turn" }];
    remaining = remaining.slice(0, remaining.length - useOnlyMatch[0].length);
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
  { event: "conquer", on: "self", pattern: /^When I conquer,\s*/i },
  { event: "hold", on: "self", pattern: /^When I hold,\s*/i },
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
  { event: "die", on: "enemy-units", pattern: /^When an enemy unit dies,\s*/i },
  { event: "attack", on: "controller-here", pattern: /^When you attack here,\s*/i },
  { event: "conquer", on: "controller-here", pattern: /^When you conquer here,\s*/i },
  { event: "defend", on: "controller-here", pattern: /^When you defend here,\s*/i },
  { event: "play-spell", on: "controller", pattern: /^When you play a spell,\s*/i },
  { event: "play-spell", on: "opponent", pattern: /^When an opponent plays a spell,\s*/i },
  { event: "discard", on: "controller", pattern: /^When you discard a card,\s*/i },
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
    pattern: /^At the start of your Beginning Phase,\s*/i,
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
];

function parseTriggeredAbility(text: string): TriggeredAbility | undefined {
  for (const tp of TRIGGER_PATTERNS) {
    const match = tp.pattern.exec(text);
    if (!match) {
      continue;
    }

    let effectText = text.slice(match[0].length).trim();

    // Check for optional "you may"
    let optional = false;
    const youMayMatch = effectText.match(/^you may\s+/i);
    if (youMayMatch) {
      optional = true;
      effectText = effectText.slice(youMayMatch[0].length);
    }

    // Check for "pay :rb_energy_N: to" pattern (optional cost condition)
    const payMatch = effectText.match(
      /^pay\s+((?::rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)):)+)\s+to\s+/i,
    );
    if (payMatch) {
      optional = true;
      effectText = effectText.slice(payMatch[0].length);
    }

    // Check for conditional "if you paid the additional cost,"
    let condition: { type: string } | undefined;
    const ifPaidMatch = effectText.match(/^if you paid the additional cost,\s*/i);
    if (ifPaidMatch) {
      condition = { type: "paid-additional-cost" };
      effectText = effectText.slice(ifPaidMatch[0].length);
    }

    // Check for inline conditions: "if I'm alone,", "if I'm at a battlefield,", "if I'm [KEYWORD],"
    const ifAloneMatch = effectText.match(/^if I'm alone,\s*/i);
    if (ifAloneMatch) {
      condition = { type: "while-alone" };
      effectText = effectText.slice(ifAloneMatch[0].length);
    }
    const ifAtBattlefieldMatch = effectText.match(/^if I'm at a battlefield,\s*/i);
    if (ifAtBattlefieldMatch) {
      condition = { type: "while-at-battlefield" };
      effectText = effectText.slice(ifAtBattlefieldMatch[0].length);
    }

    // Strip reminders
    effectText = stripReminders(effectText).trim();

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

      const trigger: { event: string; on?: string; timing?: string } = { event: tp.event };
      if (tp.on) {
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
  "Ganking",
  "Hidden",
  "Temporary",
  "Quick-Draw",
  "Weaponmaster",
  "Unique",
];

const ALL_VALUE_KEYWORDS: readonly string[] = ["Assault", "Shield", "Deflect"];

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
  /^\[(Tank|Ganking|Hidden|Temporary|Quick-Draw|Weaponmaster|Unique|Assault|Shield|Deflect|Accelerate|Equip|Repeat|Deathknell|Legion|Vision)(?:\s+(\d+))?\]/;

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
        let effectEnd = endOfKeyword;

        // Skip optional " — "
        const dashMatch = text.slice(effectEnd).match(/^\s*—\s*/);
        if (dashMatch) {
          effectEnd += dashMatch[0].length;
          // Has dash: consume effect text bounded by reminder text or next keyword
          const restAfterDash = text.slice(effectEnd);
          const reminderIdx = restAfterDash.search(/_?\s*\(/);
          const nextKwIdx = findNextKeywordIndex(restAfterDash);
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
          // No dash: only consume reminder text (like simple keywords)
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
    /^As you play (?:me|this),\s+you may\s+.+?\s+as an additional cost\b/i,
  );
  if (asYouPlayMatch) {
    return {
      effect: { text, type: "raw" } as unknown as Effect,
      type: "static",
    } as Ability;
  }

  // "You may pay COST as an additional cost to play me."
  const youMayPayMatch = text.match(
    /^You may pay\s+(?::rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)):)+\s+as an additional cost to play me\.?$/i,
  );
  if (youMayPayMatch) {
    return {
      effect: { text, type: "raw" } as unknown as Effect,
      type: "static",
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
  const cleanedForReplacement = cleaned.replace(
    /^Choose (?:a|an) (?:friendly |enemy )?(?:unit|gear)\.\s*/i,
    "",
  );
  const replacementMatch = cleanedForReplacement.match(
    /^The next time (a friendly unit|an? (?:enemy )?unit|me|it) (?:would )?(die|dies|take damage)(?:\s+this turn)?,\s*(.+?)\.?\s*$/i,
  );
  if (replacementMatch) {
    const eventStr = replacementMatch[2].toLowerCase().replace(/s$/, "");
    return {
      replacement: { text: replacementMatch[3], type: "raw" } as unknown as Effect,
      replaces: eventStr as "die" | "take-damage",
      type: "replacement",
    } as Ability;
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
    /(?=(?:When (?:you |I |a |an |another |the )|At the (?:start|end) of |The (?:first|second|third|next) time |Whenever |While (?:I'm|you)|Other friendly |Your [A-Z]|Friendly (?:units|buffed)|Each |If (?:you've|an |I )|I enter ready|Play (?:a |an |one |two |three |four |five |six |\d+ )|Recycle \d))|(?<=\.)(?=:rb_)/g;

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
export function parseAbilities(text: string, _options?: ParserOptions): ParseAbilitiesResult {
  if (!text || text.trim().length === 0) {
    return { error: "Empty ability text", success: false };
  }

  const trimmed = text.trim();

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
      /^\[(?:Tank|Ganking|Hidden|Temporary|Quick-Draw|Weaponmaster|Unique|Assault|Shield|Deflect|Accelerate|Equip|Repeat|Deathknell|Legion|Vision|Action|Reaction)(?:\s+\d+)?\]/.test(
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
      const hasPostReminderAbility = /\)[A-Z:I]/.test(trimmed) || /\.\s*:rb_/.test(trimmed);
      if (!hasRawEffect && !hasPostReminderAbility) {
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
  return /\[(Tank|Ganking|Hidden|Temporary|Quick-Draw|Weaponmaster|Unique|Assault|Shield|Deflect|Accelerate|Equip|Repeat|Deathknell|Legion|Vision|Action|Reaction)(?:\s+\d+)?\]/.test(
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
