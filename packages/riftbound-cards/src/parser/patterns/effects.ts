/**
 * Effect Pattern Definitions
 *
 * Regex patterns for parsing Riftbound effect text.
 */

// ============================================================================
// Movement Effect Patterns
// ============================================================================

/**
 * Pattern to match recall effects: "Recall me/a unit [exhausted]."
 *
 * Captures:
 * - Group 1: Target ("me", "a unit", "that unit", etc.)
 * - Group 2: "exhausted" modifier (optional)
 *
 * @example "Recall me." -> ["me", undefined]
 * @example "Recall me exhausted." -> ["me", "exhausted"]
 * @example "Recall a unit." -> ["a unit", undefined]
 * @example "Recall that unit exhausted." -> ["that unit", "exhausted"]
 */
export const RECALL_PATTERN =
  /^Recall (me|a unit|that unit|an? (?:friendly |enemy )?unit)(?:\s+(exhausted))?\.?$/i;

/**
 * Pattern to match basic move effects: "Move a/an [controller] unit(s) [to location]."
 *
 * Captures:
 * - Group 1: Quantity ("a", "an", "up to N")
 * - Group 2: Controller ("friendly ", "enemy ", or empty)
 * - Group 3: Target type ("unit", "units")
 * - Group 4: Destination ("to base", "to here", etc.) - optional
 *
 * @example "Move a friendly unit." -> ["a", "friendly ", "unit", undefined]
 * @example "Move an enemy unit to here." -> ["an", "enemy ", "unit", "to here"]
 * @example "Move up to 2 friendly units to base." -> ["up to 2", "friendly ", "units", "to base"]
 */
export const MOVE_BASIC_PATTERN =
  /^Move (a|an|up to \d+) (friendly |enemy )?(units?)(?:\s+(to (?:base|here|its base|a battlefield|battlefield)))?(?: and ready it)?\.?$/i;

/**
 * Pattern to match move effects with from/to locations:
 * "Move a unit from [location] to [location]."
 *
 * Captures:
 * - Group 1: Quantity ("a", "an")
 * - Group 2: Target type ("unit", "units")
 * - Group 3: From location
 * - Group 4: To location
 *
 * @example "Move a unit from a battlefield to its base." -> ["a", "unit", "a battlefield", "its base"]
 */
export const MOVE_FROM_TO_PATTERN =
  /^Move (a|an) (?:friendly |enemy )?(units?) from (a battlefield|battlefield|(?:your |its )?base|here) to (its base|(?:your )?base|here|a battlefield|battlefield)\.?$/i;

// ============================================================================
// Stat Modification Effect Patterns
// ============================================================================

/**
 * Pattern to match modify-might effects: "Give TARGET +/-N :rb_might: this turn."
 *
 * Captures:
 * - Group 1: Target ("a unit", "friendly units", etc.)
 * - Group 2: Sign and amount ("+5", "-4")
 * - Group 3: Duration ("this turn") - optional
 * - Group 4: Minimum clause ("to a minimum of 1 :rb_might:") - optional
 *
 * @example "Give a unit +5 :rb_might: this turn." -> ["a unit", "+5", "this turn", undefined]
 * @example "Give a unit -4 :rb_might: this turn, to a minimum of 1 :rb_might:." -> ["a unit", "-4", "this turn", "to a minimum of 1 :rb_might:"]
 */
export const MODIFY_MIGHT_PATTERN =
  /^Give (me|it|(?:a|an|two|three|four|five|\d+)?\s*(?:friendly |enemy |attacking enemy )?(?:unit|units)(?:\s+(?:at a battlefield|here|there))?)\s+([+-]\d+)\s*:rb_might:\s*(this turn)?(?:,?\s*(to a minimum of (\d+)\s*:rb_might:))?\.?$/i;

// ============================================================================
// Damage Effect Patterns
// ============================================================================

/**
 * Pattern to match fixed damage effects: "Deal N to TARGET."
 *
 * Captures:
 * - Group 1: Amount (numeric)
 * - Group 2: Target ("a unit", "an enemy unit here", "all units at battlefields", etc.)
 *
 * @example "Deal 2 to a unit." -> ["2", "a unit"]
 * @example "Deal 4 to an enemy unit." -> ["4", "an enemy unit"]
 * @example "Deal 3 to all enemy units at a battlefield." -> ["3", "all enemy units at a battlefield"]
 */
export const DAMAGE_PATTERN = /^Deal (\d+) to (.+?)\.?$/i;

/**
 * Pattern to match "deal damage equal to" effects: "Deal damage equal to STAT to TARGET."
 *
 * Captures:
 * - Group 1: Stat reference ("my Might", "its Might", "my [Assault]", etc.)
 * - Group 2: Target ("an enemy unit", "all enemy units at a battlefield", etc.)
 *
 * @example "Deal damage equal to my Might to an enemy unit." -> ["my Might", "an enemy unit"]
 * @example "Deal damage equal to its Might to all enemy units at a battlefield." -> ["its Might", "all enemy units at a battlefield"]
 */
export const DAMAGE_EQUAL_PATTERN =
  /^Deal damage equal to (?:my|its|his|her)\s+(?:Might|\[\w+(?:-\w+)?\])\s+to\s+(.+?)\.?$/i;

/**
 * Pattern to match split damage effects: "Deal N damage split among TARGET."
 *
 * Captures:
 * - Group 1: Amount (numeric)
 * - Group 2: Target ("any number of enemy units here", etc.)
 *
 * @example "Deal 5 damage split among any number of enemy units here." -> ["5", "any number of enemy units here"]
 */
export const DAMAGE_SPLIT_PATTERN = /^Deal (\d+) damage split among (.+?)\.?$/i;

/**
 * Check if text matches a damage pattern
 */
export function isDamageEffect(text: string): boolean {
  return (
    DAMAGE_PATTERN.test(text) || DAMAGE_EQUAL_PATTERN.test(text) || DAMAGE_SPLIT_PATTERN.test(text)
  );
}

// ============================================================================
// Kill Effect Patterns
// ============================================================================

/**
 * Pattern to match kill effects: "Kill TARGET."
 *
 * Captures:
 * - Group 1: Target ("me", "a unit", "all gear", "a unit at a battlefield",
 *            "up to one gear", etc.)
 *
 * @example "Kill a unit at a battlefield." -> ["a unit at a battlefield"]
 * @example "Kill all gear." -> ["all gear"]
 * @example "Kill up to one gear." -> ["up to one gear"]
 * @example "Kill me." -> ["me"]
 */
export const KILL_PATTERN =
  /^Kill (me|this|(?:a|an|all|any number of|up to (?:one|two|three|four|five|\d+))\s+(?:damaged\s+|stunned\s+|\[Mighty\]\s+)?(?:friendly\s+|enemy\s+)?(?:\[Mighty\]\s+)?(?:unit|units|gear)(?:\s+(?:at a battlefield|here|there))?)(?:\s+with\s+.+)?\.?$/i;

/**
 * Pattern to match "Each player kills" effects.
 *
 * Captures:
 * - Group 1: Card type ("units", "gear")
 *
 * @example "Each player kills one of their units." -> ["units"]
 * @example "Each player kills one of their gear." -> ["gear"]
 */
export const EACH_PLAYER_KILLS_PATTERN = /^Each player kills one of their (units?|gear)\.?$/i;

// ============================================================================
// Draw Effect Patterns
// ============================================================================

/**
 * Pattern to match draw effects: "Draw N."
 *
 * Captures:
 * - Group 1: Amount (numeric)
 *
 * @example "Draw 1." -> ["1"]
 * @example "Draw 3." -> ["3"]
 */
export const DRAW_PATTERN = /^Draw (\d+)\.?$/i;

/**
 * Pattern to match draw-for-each effects: "Draw N for each TARGET."
 *
 * Captures:
 * - Group 1: Amount per target
 * - Group 2: Target to count
 *
 * @example "Draw 1 for each of your [Mighty] units." -> ["1", "your [Mighty] units"]
 */
export const DRAW_FOR_EACH_PATTERN =
  /^Draw (\d+) for each (?:of )?((?:your |other |friendly )?(?:\[?\w+\]?\s*)?(?:units?|friendly units?|cards?|gear)(?:\s+(?:here|at a battlefield|there))?)\.?$/i;

// ============================================================================
// Discard Effect Patterns
// ============================================================================

/**
 * Pattern to match discard effects: "Discard N." / "discard a card."
 *
 * Captures:
 * - Group 1: Amount (numeric or "a card")
 *
 * @example "Discard 1." -> ["1"]
 * @example "discard a card." -> ["a card"]
 */
export const DISCARD_PATTERN = /^discard (\d+|a card)\.?$/i;

/**
 * Pattern to match "discard N, then draw N" compound effects.
 *
 * Captures:
 * - Group 1: Discard amount
 * - Group 2: Draw amount
 *
 * @example "discard 1, then draw 1." -> ["1", "1"]
 * @example "Discard 2, then draw 2." -> ["2", "2"]
 */
export const DISCARD_THEN_DRAW_PATTERN = /^discard (\d+),?\s*then draw (\d+)\.?$/i;

// ============================================================================
// Counter Effect Patterns
// ============================================================================

/**
 * Pattern to match counter effects: "Counter a spell."
 *
 * Captures:
 * - Group 1: Target ("a spell", "an enemy spell", etc.)
 *
 * @example "Counter a spell." -> ["a spell"]
 */
export const COUNTER_PATTERN = /^Counter (a spell|an? .+spell.*)\.?$/i;

// ============================================================================
// Stun Effect Patterns
// ============================================================================

/**
 * Pattern to match stun effects: "Stun TARGET."
 *
 * Captures:
 * - Group 1: Target ("a unit", "an enemy unit", etc.)
 *
 * @example "Stun a unit." -> ["a unit"]
 * @example "Stun an enemy unit at a battlefield." -> ["an enemy unit at a battlefield"]
 */
export const STUN_PATTERN =
  /^Stun ((?:a|an)\s+(?:friendly |enemy )?unit(?:\s+(?:at a battlefield|here|there))?)\.?$/i;

// ============================================================================
// Return to Hand Effect Patterns
// ============================================================================

/**
 * Pattern to match return-to-hand effects: "Return TARGET to owner's hand."
 *
 * Captures:
 * - Group 1: Target ("a gear", "a unit at a battlefield", etc.)
 * - Group 2: Owner ("its owner's", "your")
 *
 * @example "Return a gear to its owner's hand." -> ["a gear", "its owner's"]
 * @example "Return a unit from your trash to your hand." -> ["a unit from your trash", "your"]
 */
export const RETURN_TO_HAND_PATTERN =
  /^Return (me|(?:a|an)\s+(?:friendly |enemy )?(?:unit|gear)(?:\s+(?:at a battlefield|from your trash|here|there|with \d+ :rb_might: or less))?)\s+to\s+(its owner's|my owner's|your)\s+hand\.?$/i;

// ============================================================================
// Token Creation Effect Patterns
// ============================================================================

/**
 * Pattern to match token creation effects: "Play N MIGHT TOKEN tokens."
 *
 * Captures:
 * - Group 1: Quantity ("four", "two", "1", etc.)
 * - Group 2: Might value
 * - Group 3: Token name ("Recruit", "Mech", etc.)
 * - Group 4: Token type ("unit", "gear")
 *
 * @example "Play four 1 :rb_might: Recruit unit tokens." -> ["four", "1", "Recruit", "unit"]
 */
export const CREATE_TOKEN_PATTERN =
  /^Play (one|two|three|four|five|six|\d+)\s+(\d+)\s*:rb_might:\s+(\w+)\s+(unit|gear)\s+tokens?\.?$/i;

// ============================================================================
// Look Effect Patterns
// ============================================================================

/**
 * Pattern to match look effects: "Look at the top N cards of your DECK."
 *
 * Captures:
 * - Group 1: Amount
 * - Group 2: Deck type ("Main Deck", "Rune Deck", etc.)
 *
 * @example "Look at the top 3 cards of your Main Deck." -> ["3", "Main Deck"]
 */
export const LOOK_PATTERN = /^Look at the top (\d+) cards? of your (Main Deck|Rune Deck|deck)\.?/i;

// ============================================================================
// Fight Effect Patterns
// ============================================================================

/**
 * Pattern to match fight effects: "They deal damage equal to their Mights to each other."
 *
 * @example "They deal damage equal to their Mights to each other."
 */
export const FIGHT_PATTERN = /deal damage equal to their Mights to each other\.?$/i;

// ============================================================================
// Prevent Damage Effect Patterns
// ============================================================================

/**
 * Pattern to match prevent damage effects: "Prevent all/the next damage."
 *
 * Captures:
 * - Group 1: Amount ("all", "the next")
 * - Group 2: Damage type ("spell and ability", "combat", etc.) - optional
 *
 * @example "Prevent all spell and ability damage this turn." -> ["all", "spell and ability"]
 */
export const PREVENT_DAMAGE_PATTERN =
  /^Prevent (all|the next)\s*(?:(\w+(?:\s+and\s+\w+)?)\s+)?damage/i;

// ============================================================================
// Gain Control of Spell Effect Patterns
// ============================================================================

/**
 * Pattern to match gain control of spell effects.
 *
 * Captures:
 * - Group 1: "You may make new choices for it" clause - optional
 *
 * @example "Gain control of a spell. You may make new choices for it."
 */
export const GAIN_CONTROL_OF_SPELL_PATTERN =
  /^Gain control of a spell\.?\s*(You may make new choices for it\.?)?$/i;

// ============================================================================
// Attach / Detach (Equipment) Effect Patterns
// ============================================================================

/**
 * Pattern to match attach effects that attach SELF or a specific equipment to a unit.
 *
 * Captures:
 * - Group 1: Equipment target ("this", "it", "me", "a detached Equipment you control",
 *   "an Equipment you control", "an attached Equipment you control", etc.)
 * - Group 2: Unit target descriptor ("a unit you control", "a friendly unit",
 *   "me", "it", etc.)
 * - Group 3: Optional location suffix ("here") — used for "attach it to a unit you control (here)"
 *
 * @example "Attach this to a unit you control." -> ["this", "a unit you control", undefined]
 * @example "Attach it to a unit you control." -> ["it", "a unit you control", undefined]
 * @example "attach it to a unit you control." -> ["it", "a unit you control", undefined]
 * @example "Attach an Equipment you control to a unit you control." ->
 *   ["an Equipment you control", "a unit you control", undefined]
 * @example "Attach a detached Equipment you control to a unit you control." ->
 *   ["a detached Equipment you control", "a unit you control", undefined]
 * @example "Attach an attached Equipment you control to a unit you control." ->
 *   ["an attached Equipment you control", "a unit you control", undefined]
 */
export const ATTACH_PATTERN =
  /^attach\s+(this|it|me|(?:a|an)\s+(?:detached\s+|attached\s+)?(?:friendly\s+|enemy\s+)?[Ee]quipment(?:\s+you\s+control)?)\s+to\s+((?:a|an)\s+(?:friendly\s+|enemy\s+)?unit(?:\s+you\s+control)?(?:\s+(?:here|at\s+a\s+battlefield|there))?|me|it)(?:\s+\(here\))?\.?$/i;

/**
 * Pattern to match detach effects.
 *
 * Captures:
 * - Group 1: Equipment target descriptor ("an Equipment", "a friendly Equipment", etc.)
 * - Group 2: Optional "from X" clause target ("it", "a unit you control", etc.) — optional
 *
 * @example "Detach an Equipment." -> ["an Equipment", undefined]
 * @example "detach an Equipment from it." -> ["an Equipment", "it"]
 * @example "Detach a friendly Equipment from a unit you control." ->
 *   ["a friendly Equipment", "a unit you control"]
 * @example "If it's an Equipment, you may detach it." -> (handled separately via
 *   optional "you may detach it" pattern below)
 */
export const DETACH_PATTERN =
  /^detach\s+((?:a|an|that|the)\s+(?:friendly\s+|enemy\s+)?[Ee]quipment(?:\s+you\s+control)?|it|this)(?:\s+from\s+((?:a|an)\s+(?:friendly\s+|enemy\s+)?unit(?:\s+you\s+control)?|it|me))?\.?$/i;

/**
 * Check if text matches an attach pattern
 */
export function isAttachEffect(text: string): boolean {
  return ATTACH_PATTERN.test(text);
}

/**
 * Check if text matches a detach pattern
 */
export function isDetachEffect(text: string): boolean {
  return DETACH_PATTERN.test(text);
}

// ============================================================================
// Ready Effect Patterns
// ============================================================================

/**
 * Pattern to match ready effects: "Ready TARGET."
 *
 * Captures:
 * - Group 1: Target (various forms including pronouns, possessives, quantified, tag-based)
 *
 * Supported forms:
 * - "Ready me." / "Ready it." / "Ready them."
 * - "Ready a unit." / "Ready a friendly gear." / "Ready your legend."
 * - "Ready another unit." / "Ready another friendly Mech."
 * - "Ready up to 4 friendly runes." / "Ready up to two of them."
 * - "Ready all friendly units here."
 * - "Ready your units." / "Ready your runes."
 *
 * @example "Ready me." -> ["me"]
 * @example "Ready another friendly Mech." -> ["another friendly Mech"]
 * @example "Ready up to 4 friendly runes." -> ["up to 4 friendly runes"]
 */
export const READY_PATTERN =
  /^Ready (me|it|them|(?:(?:all|up to (?:two|three|four|five|six|\d+)|another)\s+)?(?:a |an )?(?:friendly |enemy |your )?(?:\w+\s+)*?(?:unit|units|gear|gears|legend|legends|rune|runes|equipment|card|permanent|[A-Z]\w*)(?:s)?(?:\s+(?:here|at a battlefield|there))?|your units|your runes|your legend|something else(?:\s+that's exhausted)?|up to (?:two|three|four|five|six|\d+) of them)\.?$/i;

// ============================================================================
// Exhaust Target Effect Patterns
// ============================================================================

/**
 * Pattern to match exhaust-target effects: "Exhaust TARGET."
 *
 * Captures:
 * - Group 1: Target (various forms including pronouns, quantified, "you control" suffix)
 *
 * Supported forms:
 * - "Exhaust me." / "Exhaust it."
 * - "Exhaust a unit." / "Exhaust an enemy unit." / "Exhaust a legend."
 * - "Exhaust all enemy units here." / "Exhaust all friendly units."
 * - "Exhaust another unit."
 * - "Exhaust a unit you control."
 *
 * @example "Exhaust a unit." -> ["a unit"]
 * @example "Exhaust all enemy units here." -> ["all enemy units here"]
 * @example "Exhaust a unit you control." -> ["a unit you control"]
 */
export const EXHAUST_TARGET_PATTERN =
  /^Exhaust (me|it|(?:(?:all|another)\s+)?(?:a |an )?(?:friendly |enemy )?(?:\w+\s+)*?(?:unit|units|gear|gears|legend|legends|rune|runes|equipment|card|permanent|[A-Z]\w*)(?:s)?(?:\s+(?:here|at a battlefield|there))?(?:\s+you control)?)\.?$/i;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if text matches a ready pattern
 */
export function isReadyEffect(text: string): boolean {
  return READY_PATTERN.test(text);
}

/**
 * Check if text matches an exhaust-target pattern
 */
export function isExhaustTargetEffect(text: string): boolean {
  return EXHAUST_TARGET_PATTERN.test(text);
}

/**
 * Check if text matches a draw pattern
 */
export function isDrawEffect(text: string): boolean {
  return DRAW_PATTERN.test(text) || DRAW_FOR_EACH_PATTERN.test(text);
}

/**
 * Check if text matches a discard pattern
 */
export function isDiscardEffect(text: string): boolean {
  return DISCARD_PATTERN.test(text) || DISCARD_THEN_DRAW_PATTERN.test(text);
}

/**
 * Check if text matches a recall pattern
 */
export function isRecallEffect(text: string): boolean {
  return RECALL_PATTERN.test(text);
}

/**
 * Check if text matches a move pattern
 */
export function isMoveEffect(text: string): boolean {
  return MOVE_BASIC_PATTERN.test(text) || MOVE_FROM_TO_PATTERN.test(text);
}

/**
 * Check if text matches a modify-might pattern
 */
export function isModifyMightEffect(text: string): boolean {
  return MODIFY_MIGHT_PATTERN.test(text);
}

/**
 * Check if text matches a kill pattern
 */
export function isKillEffect(text: string): boolean {
  return KILL_PATTERN.test(text) || EACH_PLAYER_KILLS_PATTERN.test(text);
}

/**
 * Check if text matches a counter pattern
 */
export function isCounterEffect(text: string): boolean {
  return COUNTER_PATTERN.test(text);
}

/**
 * Check if text matches a stun pattern
 */
export function isStunEffect(text: string): boolean {
  return STUN_PATTERN.test(text);
}

/**
 * Check if text matches a return-to-hand pattern
 */
export function isReturnToHandEffect(text: string): boolean {
  return RETURN_TO_HAND_PATTERN.test(text);
}

/**
 * Check if text matches a create-token pattern
 */
export function isCreateTokenEffect(text: string): boolean {
  return CREATE_TOKEN_PATTERN.test(text);
}

/**
 * Check if text matches a look pattern
 */
export function isLookEffect(text: string): boolean {
  return LOOK_PATTERN.test(text);
}

/**
 * Check if text matches a fight pattern
 */
export function isFightEffect(text: string): boolean {
  return FIGHT_PATTERN.test(text);
}

/**
 * Check if text matches a prevent-damage pattern
 */
export function isPreventDamageEffect(text: string): boolean {
  return PREVENT_DAMAGE_PATTERN.test(text);
}

/**
 * Check if text matches a gain-control-of-spell pattern
 */
export function isGainControlOfSpellEffect(text: string): boolean {
  return GAIN_CONTROL_OF_SPELL_PATTERN.test(text);
}

/**
 * Parse location string to Location type
 */
export function parseLocationString(locationStr: string): "base" | "battlefield" | "here" {
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
  if (normalized === "here" || normalized === "to here") {
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

  // Default to base for unrecognized locations
  return "base";
}
