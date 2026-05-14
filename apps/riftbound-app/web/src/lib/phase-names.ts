/**
 * Phase-name normalization for the SPA.
 *
 * iter-13 Gap 4: the engine emits compact phase ids ("main-hook",
 * "declare-attackers", "mainfocus", etc). Multiple UI surfaces want to
 * render those as human-readable strings (Combat header, breadcrumb,
 * turn banner). Previously each surface did its own toLowerCase-and-map
 * dance. This module centralises that so any new caller stays in sync.
 *
 * Pure data — no per-card ifs, no per-engine-id ifs. Adding a new alias
 * means appending to the `aliases` array on the matching entry.
 */

export interface PhaseLabelEntry {
  /** Stable id used for DOM keys + testids (e.g. "declare-attackers"). */
  readonly id: string;
  /** Canonical display label, e.g. "Declare Attackers". */
  readonly label: string;
  /** Lower-cased engine phase ids that should resolve to this label. */
  readonly aliases: readonly string[];
}

/**
 * Ordered list of known phase labels. Order matters only for the showdown
 * breadcrumb's step sequence (which consumes the SHOWDOWN_PHASES slice).
 */
export const PHASE_LABELS: readonly PhaseLabelEntry[] = [
  // Showdown / combat sub-phases.
  {
    aliases: [
      "declare-attackers",
      "declareattackers",
      "attackers",
      // The engine reports "mainfocus" / "main-hook" while the active
      // showdown stack is being built — surface it as the first combat
      // step rather than the cryptic internal alias.
      "main-hook",
      "mainhook",
      "main-focus",
      "mainfocus",
      // The engine reports plain "main" during the showdown stack
      // build-up. Treat it as "Declare Attackers" rather than leaking
      // the raw turn phase into the combat rail.
      "main",
    ],
    id: "declare-attackers",
    label: "Declare Attackers",
  },
  {
    aliases: ["declare-defenders", "declaredefenders", "defenders"],
    id: "declare-defenders",
    label: "Declare Defenders",
  },
  {
    aliases: ["strikes", "strike", "combat-damage", "damage"],
    id: "strikes",
    label: "Strikes",
  },
  {
    aliases: ["resolution", "resolve", "resolve-combat", "cleanup"],
    id: "resolution",
    label: "Resolution",
  },
];

/**
 * The four steps that make up a showdown timeline (in order).
 * Consumed by ShowdownBreadcrumb.
 */
export const SHOWDOWN_STEPS: readonly PhaseLabelEntry[] = PHASE_LABELS.slice(
  0,
  4,
);

/**
 * Resolve a raw engine phase id to a human-readable label. If the id is
 * unknown, returns the input unchanged (so debug strings still surface).
 */
export function phaseLabel(rawPhase: string | null | undefined): string {
  if (!rawPhase) {return "";}
  const norm = rawPhase.toLowerCase();
  for (const entry of PHASE_LABELS) {
    if (entry.aliases.includes(norm)) {return entry.label;}
  }
  return rawPhase;
}

/**
 * Index of a phase within SHOWDOWN_STEPS (or -1 when unknown). Used by
 * ShowdownBreadcrumb to compute done/active/future state.
 */
export function showdownStepIndex(rawPhase: string | null | undefined): number {
  if (!rawPhase) {return -1;}
  const norm = rawPhase.toLowerCase();
  return SHOWDOWN_STEPS.findIndex((entry) => entry.aliases.includes(norm));
}
