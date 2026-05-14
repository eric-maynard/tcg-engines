/**
 * ShowdownBreadcrumb — horizontal phase timeline for the active showdown.
 *
 * iter-12 Goal 1: when `view.combat` is set, the right-rail (just below
 * TurnBanner) shows a breadcrumb of the four canonical showdown phases:
 *
 *   Declare Attackers → Declare Defenders → Strikes → Resolution
 *
 * The phase that matches `combat.phase` is bold + accent-colored; earlier
 * phases render a checkmark (✓) and look muted-but-completed; later phases
 * are muted. Pure data-driven — no per-engine-phase ifs. If the engine
 * sends a phase id we don't know about, we still render the breadcrumb
 * with NO step marked active (defensive — the rest of the UI still works).
 *
 * iter-14 Gap 1: the engine's `combat.phase` stays at "main" through the
 * entire showdown sequence — it doesn't transition to "declare-defenders"
 * / "strikes" / "resolution" as distinct states. So the breadcrumb derives
 * the *effective* sub-phase from observable combat state (attacker /
 * defender counts) and uses that for the active marker. The original
 * `currentPhase` is still surfaced via `data-current-phase` for debugging.
 *
 * Derivation rules (only applied when phase resolves to "Declare Attackers"
 * — the engine's catch-all combat state):
 *   - 0 attackers, 0 defenders → "Declare Attackers" (initial — keep phase)
 *   - >=1 attacker, 0 defenders → "Declare Defenders"
 *   - >=1 attacker, >=1 defender → "Strikes" (matchup formed)
 *   - resolved=true → "Resolution"
 * For any phase that already resolves to a non-declare-attackers step
 * (e.g. the engine explicitly reports "strikes"), we use that as-is.
 */

import { SHOWDOWN_STEPS, showdownStepIndex } from "../lib/phase-names";

interface ShowdownBreadcrumbProps {
  readonly currentPhase: string;
  /**
   * Iter-14 Gap 1: combat.attackers.length — used to derive the effective
   * sub-phase when the engine reports the catch-all "main" / "declare-
   * attackers" state. Optional so existing callers / tests that only pass
   * `currentPhase` keep working with the static behavior.
   */
  readonly attackerCount?: number;
  /** Iter-14 Gap 1: combat.defenders.length — see attackerCount. */
  readonly defenderCount?: number;
  /**
   * Iter-14 Gap 1: when true, jump straight to the Resolution step. The
   * engine surfaces this via combat-resolution events; PlayPage threads it
   * here. Optional — undefined === "not yet resolved".
   */
  readonly resolved?: boolean;
}

/**
 * Derive the effective showdown step index from raw phase + observable
 * combat counts. Exported for unit tests so the derivation rules stay
 * verifiable without rendering.
 */
export function deriveShowdownStepIndex(
  rawPhase: string,
  attackerCount: number,
  defenderCount: number,
  resolved: boolean,
): number {
  if (resolved) {return 3;} // Resolution
  const baseIdx = showdownStepIndex(rawPhase);
  // If the engine surfaces a specific later step explicitly, respect it.
  if (baseIdx > 0) {return baseIdx;}
  // BaseIdx === 0 (declare-attackers, the catch-all) OR -1 (unknown).
  // Fall back to count-based derivation.
  if (attackerCount === 0) {return 0;} // Declare Attackers
  if (defenderCount === 0) {return 1;} // Declare Defenders
  return 2; // Strikes
}

export function ShowdownBreadcrumb({
  currentPhase,
  attackerCount,
  defenderCount,
  resolved,
}: ShowdownBreadcrumbProps) {
  // When count-based derivation is disabled (legacy callers pass only
  // CurrentPhase), fall back to the raw `showdownStepIndex` so unknown
  // Phases still render as all-future.
  const derivationEnabled =
    attackerCount !== undefined || defenderCount !== undefined || resolved !== undefined;
  const activeIdx = derivationEnabled
    ? deriveShowdownStepIndex(
        currentPhase,
        attackerCount ?? 0,
        defenderCount ?? 0,
        resolved ?? false,
      )
    : showdownStepIndex(currentPhase);
  return (
    <nav
      className="showdown-breadcrumb"
      data-testid="showdown-breadcrumb"
      aria-label="Showdown phase timeline"
      data-current-phase={currentPhase}
    >
      {SHOWDOWN_STEPS.map((step, idx) => {
        const state: "done" | "active" | "future" =
          activeIdx === -1
            ? "future"
            : idx < activeIdx
              ? "done"
              : idx === activeIdx
                ? "active"
                : "future";
        return (
          <span
            key={step.id}
            className={`sb-step sb-step-${state}`}
            data-testid={`sb-step-${step.id}`}
            data-state={state}
            aria-current={state === "active" ? "step" : undefined}
          >
            <span className="sb-step-marker" aria-hidden="true">
              {state === "done" ? "✓" : idx + 1}
            </span>
            <span className="sb-step-label">{step.label}</span>
            {idx < SHOWDOWN_STEPS.length - 1 ? (
              <span className="sb-step-arrow" aria-hidden="true">
                ›
              </span>
            ) : null}
          </span>
        );
      })}
    </nav>
  );
}
