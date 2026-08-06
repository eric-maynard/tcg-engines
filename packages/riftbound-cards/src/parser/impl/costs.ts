/**
 * Activation-cost and resource-payload parsing.
 */

import type { Cost, Domain } from "@tcg/riftbound-types/abilities/cost-types";
import type { AddResourceEffect } from "@tcg/riftbound-types/abilities/effect-types";
import { parseCost } from "../parsers/cost-parser";
import { ENERGY_RE, POWER_RE } from "./tokens";

// ============================================================================
// Cost Parsing Helpers
// ============================================================================

/**
 * Parse an activation cost string before the `::` separator.
 * Handles `:rb_energy_N:`, `:rb_rune_DOMAIN:`, `:rb_exhaust:` and combinations.
 */
export function parseActivationCost(costStr: string): Cost {
  return parseCost(costStr);
}

// ============================================================================
// Resource Parsing Helpers
// ============================================================================

/**
 * Parse energy and power from an `[Add]` resource payload.
 * e.g. `:rb_energy_1:`, `:rb_rune_fury:`, `:rb_energy_1::rb_rune_fury:`
 */
export function parseResourcePayload(payload: string): AddResourceEffect {
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
