/**
 * Keyword Game Effects
 *
 * Implements the game mechanics for each Riftbound keyword.
 * Keywords are defined in rules 712-729.
 *
 * Keywords are applied during specific game phases or in response
 * to game events. This module provides the logic for each keyword.
 */

// ============================================================================
// Keyword Definitions
// ============================================================================

/**
 * All Riftbound keywords and their game-relevant properties
 */
export interface KeywordDefinition {
  readonly id: string;
  readonly name: string;
  readonly ruleNumber: number;
  readonly category: "combat" | "movement" | "play" | "trigger" | "state";
  readonly description: string;
  readonly stackable: boolean;
}

export const KEYWORD_DEFINITIONS: Record<string, KeywordDefinition> = {
  Accelerate: {
    category: "play",
    description: "Pay additional cost to enter ready instead of exhausted",
    id: "accelerate",
    name: "Accelerate",
    ruleNumber: 717,
    stackable: false,
  },
  Action: {
    category: "play",
    description: "Play on your turn or in showdowns",
    id: "action",
    name: "Action",
    ruleNumber: 718,
    stackable: false,
  },
  Ambush: {
    category: "play",
    description: "Can be played as a Reaction to a battlefield where you have units",
    id: "ambush",
    name: "Ambush",
    ruleNumber: 0,
    stackable: false,
  },
  Assault: {
    category: "combat",
    description: "Bonus Might while attacking",
    id: "assault",
    name: "Assault",
    ruleNumber: 719,
    stackable: true,
  },
  Backline: {
    category: "combat",
    description: "Must be assigned combat damage last (opposite of Tank)",
    id: "backline",
    name: "Backline",
    ruleNumber: 0,
    stackable: false,
  },
  Barrier: {
    category: "combat",
    description:
      "The first time this unit would be dealt combat damage, that damage is reduced to 0 and Barrier is removed",
    id: "barrier",
    name: "Barrier",
    ruleNumber: 0,
    stackable: false,
  },
  Deathknell: {
    category: "trigger",
    description: "Trigger when a friendly unit dies",
    id: "deathknell",
    name: "Deathknell",
    ruleNumber: 720,
    stackable: true,
  },
  Deflect: {
    category: "state",
    description: "Opponents must pay rainbow power to choose with spell or ability",
    id: "deflect",
    name: "Deflect",
    ruleNumber: 721,
    stackable: true,
  },
  Ganking: {
    category: "movement",
    description: "Can move from battlefield to battlefield",
    id: "ganking",
    name: "Ganking",
    ruleNumber: 722,
    stackable: false,
  },
  Guard: {
    category: "combat",
    description:
      "The attacking player must assign lethal damage to this unit before assigning to non-Guard defenders",
    id: "guard",
    name: "Guard",
    ruleNumber: 0,
    stackable: false,
  },
  Haste: {
    category: "play",
    description: "This unit can act on the turn it is played (does not enter exhausted)",
    id: "haste",
    name: "Haste",
    ruleNumber: 0,
    stackable: false,
  },
  Hidden: {
    category: "play",
    description: "Can be played facedown at a battlefield",
    id: "hidden",
    name: "Hidden",
    ruleNumber: 723,
    stackable: false,
  },
  Hunt: {
    category: "trigger",
    description: "When conquering or holding, gain N XP",
    id: "hunt",
    name: "Hunt",
    ruleNumber: 0,
    stackable: true,
  },
  Legion: {
    category: "trigger",
    description: "Trigger when N+ friendly units at same location",
    id: "legion",
    name: "Legion",
    ruleNumber: 724,
    stackable: true,
  },
  Predict: {
    category: "trigger",
    description: "Look at top N cards, recycle any, reorder rest",
    id: "predict",
    name: "Predict",
    ruleNumber: 0,
    stackable: true,
  },
  Reaction: {
    category: "play",
    description: "Play any time, even before spells and abilities resolve",
    id: "reaction",
    name: "Reaction",
    ruleNumber: 725,
    stackable: false,
  },
  Shield: {
    category: "combat",
    description: "+X Might while defending (rule 726)",
    id: "shield",
    name: "Shield",
    ruleNumber: 726,
    stackable: true,
  },
  Swift: {
    category: "movement",
    description: "This unit can contest a battlefield without exhausting",
    id: "swift",
    name: "Swift",
    ruleNumber: 0,
    stackable: false,
  },
  Tank: {
    category: "combat",
    description: "Must be assigned combat damage first",
    id: "tank",
    name: "Tank",
    ruleNumber: 727,
    stackable: false,
  },
  Temporary: {
    category: "state",
    description: "Dies at start of controller's next Beginning Phase",
    id: "temporary",
    name: "Temporary",
    ruleNumber: 728,
    stackable: false,
  },
  Tough: {
    category: "combat",
    description: "This unit requires damage >= its Might × 2 to be killed",
    id: "tough",
    name: "Tough",
    ruleNumber: 0,
    stackable: false,
  },
  Vision: {
    category: "trigger",
    description: "When played, look at top card of deck, may recycle",
    id: "vision",
    name: "Vision",
    ruleNumber: 729,
    stackable: true,
  },
  Weaponmaster: {
    category: "play",
    description: "When played, may equip an equipment for reduced cost",
    id: "weaponmaster",
    name: "Weaponmaster",
    ruleNumber: 0,
    stackable: false,
  },
} as const;

// ============================================================================
// Combat Keyword Effects
// ============================================================================

/**
 * Calculate effective Might for a unit in combat, accounting for Assault.
 *
 * Rule 719: Assault gives +N Might while the unit is an attacker.
 *
 * @param baseMight - Unit's base Might value
 * @param assaultValue - Total Assault value (stacks)
 * @param isAttacker - Whether the unit is assigned as attacker
 * @returns Effective Might for combat
 */
export function calculateCombatMight(
  baseMight: number,
  assaultValue: number,
  isAttacker: boolean,
): number {
  if (isAttacker && assaultValue > 0) {
    return baseMight + assaultValue;
  }
  return baseMight;
}

/**
 * Calculate damage after Shield reduction.
 *
 * Rule 726: Shield prevents N damage each time dealt damage.
 * Shield 1: "Prevent 1 damage to me each time I'm dealt damage."
 * Multiple instances stack.
 *
 * @param incomingDamage - Raw damage being dealt
 * @param shieldValue - Total Shield value (stacks)
 * @returns Actual damage after shield reduction (minimum 0)
 */
export function applyShield(incomingDamage: number, shieldValue: number): number {
  return Math.max(0, incomingDamage - shieldValue);
}

/**
 * Determine combat damage assignment order with Tank.
 *
 * Rule 727: Units with Tank must be assigned combat damage first.
 * "I must be assigned combat damage first."
 *
 * @param units - Array of units with their Tank status
 * @returns Units sorted by damage assignment priority (Tank first)
 */
export function sortByTankPriority<T extends { hasTank: boolean }>(units: T[]): T[] {
  return [...units].toSorted((a, b) => {
    if (a.hasTank && !b.hasTank) {
      return -1;
    }
    if (!a.hasTank && b.hasTank) {
      return 1;
    }
    return 0;
  });
}

/**
 * Determine combat damage assignment order with Backline.
 *
 * Backline units must be assigned combat damage last (opposite of Tank).
 *
 * @param units - Array of units with their Backline status
 * @returns Units sorted by damage assignment priority (Backline last)
 */
export function sortByBacklinePriority<T extends { hasBackline: boolean }>(units: T[]): T[] {
  return [...units].toSorted((a, b) => {
    if (a.hasBackline && !b.hasBackline) {
      return 1;
    }
    if (!a.hasBackline && b.hasBackline) {
      return -1;
    }
    return 0;
  });
}

// ============================================================================
// Movement Keyword Effects
// ============================================================================

/**
 * Check if a unit can perform a battlefield-to-battlefield move.
 *
 * Rule 722: Ganking allows moving from battlefield to battlefield.
 * Without Ganking, standard move is only Base ↔ Battlefield.
 *
 * @param hasGanking - Whether the unit has the Ganking keyword
 * @param fromLocation - Current location type
 * @param toLocation - Target location type
 * @returns Whether the move is valid
 */
export function canMoveToLocation(
  hasGanking: boolean,
  fromLocation: "base" | "battlefield",
  toLocation: "base" | "battlefield",
): boolean {
  // Base → Battlefield: always allowed
  if (fromLocation === "base" && toLocation === "battlefield") {
    return true;
  }
  // Battlefield → Base: always allowed
  if (fromLocation === "battlefield" && toLocation === "base") {
    return true;
  }
  // Battlefield → Battlefield: requires Ganking
  if (fromLocation === "battlefield" && toLocation === "battlefield") {
    return hasGanking;
  }
  return false;
}

/**
 * Check if a unit can be played via Ambush timing.
 *
 * Ambush: Can be played as a Reaction to a battlefield where you have units.
 *
 * @param hasAmbush - Whether the unit has the Ambush keyword
 * @param hasFriendlyUnitsAtBattlefield - Whether the player has units at the target battlefield
 * @param isReactionTiming - Whether it's currently a valid Reaction timing
 * @returns Whether the unit can be played via Ambush
 */
export function canPlayViaAmbush(
  hasAmbush: boolean,
  hasFriendlyUnitsAtBattlefield: boolean,
  isReactionTiming: boolean,
): boolean {
  return hasAmbush && hasFriendlyUnitsAtBattlefield && isReactionTiming;
}

// ============================================================================
// Play Keyword Effects
// ============================================================================

/**
 * Determine if a unit should enter ready (Accelerate paid).
 *
 * Rule 717: Units normally enter exhausted. Accelerate allows
 * paying an additional cost to enter ready instead.
 *
 * @param paidAccelerate - Whether the Accelerate cost was paid
 * @returns true if unit should enter ready
 */
export function shouldEnterReady(paidAccelerate: boolean): boolean {
  return paidAccelerate;
}

/**
 * Check if a spell can be played at the current timing.
 *
 * Rule 718 (Action): Play on your turn or in showdowns.
 * Rule 725 (Reaction): Play any time, even during chain resolution.
 *
 * @param timing - The spell's timing keyword
 * @param state - Current turn state
 * @returns Whether the spell can be played
 */
export function canPlaySpellAtTiming(
  timing: "action" | "reaction",
  state: { isShowdown: boolean; hasChain: boolean; isOwnerTurn: boolean },
): boolean {
  if (timing === "reaction") {
    // Reactions can be played any time
    return true;
  }

  // Action spells: on your turn, or during showdowns
  if (state.isOwnerTurn) {
    return true;
  }
  if (state.isShowdown) {
    return true;
  }

  return false;
}

/**
 * Calculate Deflect cost for targeting.
 *
 * Rule 721: "Opponents must pay [rainbow] to choose me with a spell or ability."
 * Multiple instances stack.
 *
 * @param deflectValue - Total Deflect value (stacks)
 * @returns Additional rainbow power cost to target this unit
 */
export function getDeflectCost(deflectValue: number): number {
  return deflectValue;
}

// ============================================================================
// New Defensive Keyword Effects
// ============================================================================

/**
 * Barrier — the first combat damage hit against a Barrier unit is reduced to 0.
 *
 * When a unit with Barrier would be dealt combat damage, that damage is reduced
 * to 0 (the hit is absorbed) and the Barrier keyword is removed from the unit.
 * On all subsequent hits, no protection applies.
 *
 * @param hasBarrier - Whether the unit currently has the Barrier keyword
 * @param incomingDamage - Raw combat damage about to be dealt
 * @returns { dealtDamage, barrierConsumed } — `dealtDamage` is the actual
 *   damage after Barrier, `barrierConsumed` is true when the Barrier was spent
 */
export function applyBarrier(
  hasBarrier: boolean,
  incomingDamage: number,
): { dealtDamage: number; barrierConsumed: boolean } {
  if (hasBarrier && incomingDamage > 0) {
    return { barrierConsumed: true, dealtDamage: 0 };
  }
  return { barrierConsumed: false, dealtDamage: incomingDamage };
}

/**
 * Guard — Guard units must receive lethal damage before non-Guard defenders.
 *
 * A Guard unit has damage-assignment priority −2 (even before Tank at −1),
 * forcing the attacker to satisfy lethal damage requirements on all Guard units
 * before assigning any damage to non-Guard defenders.
 *
 * @param hasGuard - Whether the unit has the Guard keyword
 * @param hasTank - Whether the unit also has Tank (Guard takes precedence)
 * @returns The damage-assignment priority for this unit:
 *   −2 = Guard (highest priority — must be assigned first),
 *   −1 = Tank,
 *    0 = normal.
 */
export function guardDamageAssignmentPriority(hasGuard: boolean, hasTank: boolean): number {
  if (hasGuard) {
    return -2;
  }
  if (hasTank) {
    return -1;
  }
  return 0;
}

/**
 * Tough — requires damage >= Might × 2 to be killed.
 *
 * A Tough unit is not killed by normal lethal damage (damage >= Might).
 * Instead it takes double the normal damage to kill: damage must reach
 * Might × 2 before the unit is trashed.
 *
 * This affects both the lethal-assignment threshold in `distributeDamage`
 * (the attacker must assign 2× Might to call Tough lethal) and the kill
 * check in `resolveCombat` / `performCleanup`.
 *
 * @param baseMight - The unit's printed Might
 * @param currentDamage - Already-marked damage on the unit
 * @param hasTough - Whether the unit has the Tough keyword
 * @returns The damage required to kill this unit (1× or 2× Might depending
 *   on Tough; minimum 0, accounts for pre-existing marked damage).
 */
export function toughLethalThreshold(
  baseMight: number,
  currentDamage: number,
  hasTough: boolean,
): number {
  const threshold = hasTough ? baseMight * 2 : baseMight;
  return Math.max(0, threshold - currentDamage);
}

/**
 * Determine whether a Tough unit is killed by the given total damage.
 *
 * @param totalDamage - cumulative damage on the unit (pre-existing + new)
 * @param baseMight - the unit's printed Might
 * @param hasTough - whether the unit has Tough
 * @returns true if the unit is killed
 */
export function isToughUnitKilled(
  totalDamage: number,
  baseMight: number,
  hasTough: boolean,
): boolean {
  const threshold = hasTough ? baseMight * 2 : baseMight;
  return totalDamage >= threshold;
}

/**
 * Swift — the unit can contest a battlefield without exhausting.
 *
 * A Swift unit moves to a battlefield and begins contesting it in a ready
 * (non-exhausted) state, allowing it to act or move again if the contest
 * fails. Non-Swift units exhaust when they contest.
 *
 * @param hasSwift - Whether the unit has the Swift keyword
 * @returns Whether the unit should be exhausted when it contests a battlefield.
 *   `false` (stays ready) for Swift units, `true` (exhausted) for normal units.
 */
export function swiftExhaustsOnContest(hasSwift: boolean): boolean {
  return !hasSwift;
}

/**
 * Haste — the unit can act on the turn it is played.
 *
 * Normally a unit enters play exhausted and cannot contest or move until
 * the following turn. A Haste unit enters ready and is immediately eligible
 * to act.
 *
 * @param hasHaste - Whether the unit has the Haste keyword
 * @returns Whether the unit enters play exhausted.
 *   `false` (enters ready) for Haste units, `true` (enters exhausted)
 *   for normal units (absent Accelerate / other cost-paid effects).
 */
export function hasteEntersExhausted(hasHaste: boolean): boolean {
  return !hasHaste;
}
