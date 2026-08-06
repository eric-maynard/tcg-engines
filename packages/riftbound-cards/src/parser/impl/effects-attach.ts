/**
 * Effect parsers: attach / detach equipment.
 */

import type { Effect } from "@tcg/riftbound-types/abilities/effect-types";
import type { AnyTarget, Location } from "@tcg/riftbound-types/targeting";

// ============================================================================
// Attach / Detach (Equipment) Effect Parsers
// ============================================================================

/**
 * Build an equipment-target from a captured string describing the equipment.
 * Handles "this"/"it"/"me" (self), and "a/an [detached|attached] Equipment [you control]".
 */
export function parseEquipmentTargetLocal(text: string): AnyTarget {
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
export function parseAttachUnitTargetLocal(text: string): AnyTarget {
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
export function parseAttachEffect(text: string): Effect | undefined {
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
export function parseDetachEffect(text: string): Effect | undefined {
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
