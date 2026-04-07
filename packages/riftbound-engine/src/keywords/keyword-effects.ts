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
