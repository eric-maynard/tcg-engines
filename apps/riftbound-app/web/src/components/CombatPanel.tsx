/**
 * CombatPanel — renders the engine's active showdown (combat).
 *
 * Phase B batch 25 EEE: surfaces combat phase, attackers vs defenders,
 * focus, and which battlefield is in contest.
 *
 * Phase B batch 26 GGG: adds action buttons so the SPA can finally drive
 * combat through the engine. Buttons surfaced:
 *   - "Attacker: <name>" per local-seat unit on the showdown battlefield
 *     (fires `assignAttacker` with that unit id).
 *   - "Defender: <name>" per local-seat unit (fires `assignDefender`).
 *   - "Pass Focus" — fires `passShowdownFocus` (only when local seat has focus).
 *   - "Resolve Combat" — fires `resolveCombat` for the showdown battlefield
 *     (gated on `actionsLegal.resolveCombat`).
 *
 * Data shape: `view.combat` (api.ts `CombatView`). When undefined, this
 * component renders nothing — the caller is expected to gate on
 * `view.combat != null` before mounting. We still defensively handle the
 * undefined case so a stale `view.combat = undefined` after combat resolves
 * doesn't crash the page.
 */

import type { CSSProperties } from "react";
import type { ActionsLegal, BattlefieldUnit, CombatUnit, CombatView } from "../lib/api";
import { phaseLabel } from "../lib/phase-names";

/**
 * Slice 5 (UX affordances) — smart showdown assist.
 *
 * Compute predicted combat outcomes from the current attacker/defender
 * Lists. Pure function over `CombatUnit.might` — no engine round-trip
 * Needed. Returns:
 *   - `attackerTotal` / `defenderTotal`: sum of might on each side
 *   - `lethal`: which side wipes if the showdown resolves now
 *     ("attackers" / "defenders" / "trade" / "stalemate")
 *   - `playerDamage`: incidental damage that leaks through to the
 *     defending player when the attacker side has uncontested
 *     attackers (no defenders left)
 *
 * Rule note: Riftbound combat is approximate here — the engine resolves
 * Per-pair strike order with `strikesFirst` / equipment / static effects
 * That this preview can't replicate. The assist is therefore a HINT, not
 * A binding prediction; the real `resolveCombat` move still runs through
 * The engine. Labelled "Predicted outcome" in the UI to make this clear.
 */
function summarizeShowdown(
  attackers: readonly CombatUnit[],
  defenders: readonly CombatUnit[],
): {
  attackerTotal: number;
  defenderTotal: number;
  lethal: "attackers" | "defenders" | "trade" | "stalemate" | "none";
  playerDamageFromAttackers: number;
} {
  const attackerTotal = attackers.reduce(
    (sum, u) => sum + (u.might ?? 0),
    0,
  );
  const defenderTotal = defenders.reduce(
    (sum, u) => sum + (u.might ?? 0),
    0,
  );
  // Lethal heuristic: a side "wipes" if its total might absorbed equals
  // Or exceeds the OTHER side's total. When both wipe, it's a trade;
  // When neither does, stalemate; when neither side has units, "none".
  let lethal: "attackers" | "defenders" | "trade" | "stalemate" | "none";
  if (attackers.length === 0 && defenders.length === 0) {
    lethal = "none";
  } else if (attackers.length === 0) {
    lethal = "defenders";
  } else if (defenders.length === 0) {
    // Uncontested attackers → player damage instead of a unit wipe.
    lethal = "none";
  } else {
    const attackersDie = defenderTotal >= attackerTotal && attackerTotal > 0;
    const defendersDie = attackerTotal >= defenderTotal && defenderTotal > 0;
    if (attackersDie && defendersDie) {
      lethal = "trade";
    } else if (attackersDie) {
      lethal = "attackers";
    } else if (defendersDie) {
      lethal = "defenders";
    } else {
      lethal = "stalemate";
    }
  }
  const playerDamageFromAttackers =
    defenders.length === 0 ? attackerTotal : 0;
  return {
    attackerTotal,
    defenderTotal,
    lethal,
    playerDamageFromAttackers,
  };
}

const LETHAL_LABEL: Record<
  ReturnType<typeof summarizeShowdown>["lethal"],
  string
> = {
  attackers: "Attackers wipe",
  defenders: "Defenders wipe",
  none: "—",
  stalemate: "No deaths",
  trade: "Mutual destruction",
};

interface CombatPanelProps {
  readonly combat: CombatView | undefined;
  /**
   * Human-readable name of the battlefield in contest (e.g. "Altar to Unity").
   * When provided, the header reads "Combat @ <name>" instead of "Combat @ <id>".
   * Falls back to `combat.battlefieldId` when absent.
   */
  readonly battlefieldName?: string;
  /**
   * Local seat (the player the SPA is acting on behalf of). Used to gate
   * "assign attacker / defender" buttons — we only show them for units the
   * local seat controls (the engine will reject attempts on opposing units
   * anyway, but pre-filtering keeps the panel uncluttered).
   */
  readonly localPlayerId?: string;
  /**
   * Units the local seat could assign as attackers/defenders — typically the
   * units on the showdown battlefield they control. We accept this as a
   * prop rather than re-deriving from `view.battlefields` so the panel
   * stays a pure render component.
   */
  readonly assignableUnits?: readonly BattlefieldUnit[];
  readonly actionsLegal?: ActionsLegal;
  readonly disabled?: boolean;
  readonly onAssignAttacker?: (unitId: string) => void;
  readonly onAssignDefender?: (unitId: string) => void;
  readonly onPassFocus?: () => void;
  readonly onResolveCombat?: (battlefieldId: string) => void;
}

/**
 * Maps a raw engine player id to a human-readable label.
 * Returns "You" if the id matches localPlayerId, "Opponent" otherwise.
 * Falls back to the raw id when localPlayerId is not provided.
 */
function playerLabel(playerId: string, localPlayerId: string | undefined): string {
  if (!localPlayerId) {return playerId;}
  return playerId === localPlayerId ? "You" : "Opponent";
}

function renderUnit(u: CombatUnit, localPlayerId?: string) {
  const label = u.name ?? u.definitionId ?? u.id;
  // Iter-13 Gap 3: inline a tiny avatar (the card art thumb) next to the
  // Name so the rail panel reads like a combatant card, not raw IDs.
  // Falls back to a 2-letter initials chip when imageUrl is missing.
  const initials = label.slice(0, 2);
  return (
    <li
      key={u.id}
      className="combat-panel-unit"
      data-testid={`combat-unit-${u.id}`}
      data-card-id={u.id}
      data-has-image={u.imageUrl ? "true" : "false"}
      /* Iter-M: --card-img drives the CSS-only hover-zoom preview
       * (::after on .combat-panel-unit:hover). */
      style={
        u.imageUrl
          ? ({ "--card-img": `url(${u.imageUrl})` } as CSSProperties)
          : undefined
      }
    >
      <span
        className={`combat-panel-unit-avatar${u.imageUrl ? " combat-panel-unit-avatar-art" : ""}`}
        aria-hidden="true"
      >
        {u.imageUrl ? (
          <img
            className="combat-panel-unit-avatar-img"
            src={u.imageUrl}
            alt=""
            loading="lazy"
          />
        ) : (
          <span className="combat-panel-unit-avatar-fallback">{initials}</span>
        )}
      </span>
      <span className="combat-panel-unit-name">{label}</span>
      {u.might !== undefined ? (
        <span className="combat-panel-unit-might">{u.might}</span>
      ) : null}
      <span className="combat-panel-unit-controller">
        {playerLabel(u.controller, localPlayerId)}
      </span>
    </li>
  );
}

/**
 * Defect-3 fix: PriorityPrompt — a prominent banner inside CombatPanel that
 * surfaces "who has Focus right now" in the showdown's chain-priority loop
 * (Riftbound rules 545-553, "Focus passes when Chain resolves; player with
 * Focus may play Action/Reaction spell, activate ability, invite, or pass").
 *
 * Two visual states (pure data-driven from `focusOwner === localPlayerId`):
 *   - "ours": pulsing gold banner — "You have priority — play a reaction
 *     or pass". Shows a "Pass Priority" button gated on `canPassFocus`.
 *   - "theirs": calm blue banner — "Waiting for opponent to act or pass..."
 *     No action button (engine drives the opposing seat).
 *
 * Renders nothing when `localPlayerId` is not provided (lobby / spectator).
 */
function PriorityPrompt({
  focusOwner,
  localPlayerId,
  canPassFocus,
  onPassFocus,
  disabled,
}: {
  readonly focusOwner: string;
  readonly localPlayerId: string | undefined;
  readonly canPassFocus: boolean;
  readonly onPassFocus?: () => void;
  readonly disabled?: boolean;
}) {
  if (!localPlayerId) {return null;}
  const oursFocus = focusOwner === localPlayerId;
  return (
    <div
      className="priority-prompt"
      data-testid="priority-prompt"
      data-focus={oursFocus ? "ours" : "theirs"}
      role="status"
      aria-live="polite"
    >
      <div className="priority-prompt-title" data-testid="priority-prompt-title">
        {oursFocus
          ? "You have priority — play a reaction or pass"
          : "Waiting for opponent to act or pass…"}
      </div>
      <div className="priority-prompt-hint">
        {oursFocus
          ? "Focus is yours: play an Action/Reaction spell, activate an ability, or pass."
          : "Opponent holds Focus on the chain."}
      </div>
      {oursFocus && onPassFocus ? (
        <div className="priority-prompt-actions">
          <button
            type="button"
            data-testid="priority-prompt-pass"
            disabled={disabled || !canPassFocus}
            title={
              !canPassFocus
                ? "Pass Priority not legal right now"
                : "Pass priority to opponent"
            }
            onClick={() => onPassFocus()}
          >
            Pass Priority
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function CombatPanel({
  combat,
  battlefieldName,
  localPlayerId,
  assignableUnits,
  actionsLegal,
  disabled,
  onAssignAttacker,
  onAssignDefender,
  onPassFocus,
  onResolveCombat,
}: CombatPanelProps) {
  if (!combat) {
    return null;
  }
  const localHasFocus = Boolean(localPlayerId) && combat.focusOwner === localPlayerId;
  const canAssignAttacker = Boolean(actionsLegal?.assignAttacker);
  const canAssignDefender = Boolean(actionsLegal?.assignDefender);
  const canPassFocus = Boolean(actionsLegal?.passShowdownFocus) && localHasFocus;
  const canResolveCombat = Boolean(actionsLegal?.resolveCombat);
  // Local seat's units on the showdown battlefield — eligible for
  // AssignAttacker/assignDefender. Engine still validates legality at apply
  // Time; the SPA just narrows the choice list.
  const localUnits = (assignableUnits ?? []).filter(
    (u) => !localPlayerId || u.controller === localPlayerId,
  );
  // Slice 5 (UX affordances): predicted combat outcome. Pure derivation
  // From the attacker/defender lists already in `combat`. Shown only when
  // At least one side has units so an empty showdown doesn't get an
  // Awkward "0 vs 0, stalemate" block.
  const showAssist =
    combat.attackers.length > 0 || combat.defenders.length > 0;
  const assist = showAssist
    ? summarizeShowdown(combat.attackers, combat.defenders)
    : null;
  const assistAttackerSide =
    combat.attackingPlayer === localPlayerId ? "you" : "opponent";
  const assistDefenderSide =
    combat.defendingPlayer === localPlayerId ? "you" : "opponent";
  // Slice 5: which side's wipe is "bad news" for the local player.
  const assistTone:
    | "good"
    | "bad"
    | "neutral"
    | undefined = assist
    ? assist.lethal === "trade" || assist.lethal === "stalemate"
      ? "neutral"
      : assist.lethal === "attackers"
        ? assistAttackerSide === "you"
          ? "bad"
          : "good"
        : assist.lethal === "defenders"
          ? assistDefenderSide === "you"
            ? "bad"
            : "good"
          : assist.playerDamageFromAttackers > 0
            ? assistAttackerSide === "you"
              ? "good"
              : "bad"
            : "neutral"
    : undefined;
  return (
    <section
      className="combat-panel"
      data-testid="combat-panel"
      data-battlefield-id={combat.battlefieldId}
    >
      <header className="combat-panel-header">
        <h3 className="combat-panel-title">
          {combat.isCombat ? "Combat" : "Showdown"} @ {battlefieldName ?? combat.battlefieldId}
        </h3>
        {/* Iter-13 Gap 3: meta is now a definition list with bold labels +
            one row per field for legibility. Phase value runs through the
            shared `phaseLabel` normalizer so "main-hook" surfaces as
            "Declare Attackers" instead of the engine's internal alias. */}
        <dl className="combat-panel-meta" data-testid="combat-panel-meta">
          <div className="combat-panel-meta-row">
            <dt>Phase</dt>
            <dd data-testid="combat-phase">{phaseLabel(combat.phase)}</dd>
          </div>
          <div className="combat-panel-meta-row">
            <dt>Focus</dt>
            <dd data-testid="combat-focus">{playerLabel(combat.focusOwner, localPlayerId)}</dd>
          </div>
          {combat.attackingPlayer ? (
            <div className="combat-panel-meta-row">
              <dt>Attacker</dt>
              <dd data-testid="combat-attacker-player">
                {playerLabel(combat.attackingPlayer, localPlayerId)}
              </dd>
            </div>
          ) : null}
          {combat.defendingPlayer ? (
            <div className="combat-panel-meta-row">
              <dt>Defender</dt>
              <dd data-testid="combat-defender-player">
                {playerLabel(combat.defendingPlayer, localPlayerId)}
              </dd>
            </div>
          ) : null}
        </dl>
      </header>
      {/* Defect-3 fix: priority/focus popup banner. During a showdown the
          Rules grant Focus to one player at a time (rules 545-553); the
          Focused player may play a Reaction or Pass. The SPA was hiding
          this — the only signal was a tiny "Focus: You/Opponent" row in
          the meta. Surface a prominent prompt so the human knows when
          it's their turn to act vs wait. Pure data-driven from
          `combat.focusOwner === localPlayerId`. */}
      <PriorityPrompt
        focusOwner={combat.focusOwner}
        localPlayerId={localPlayerId}
        canPassFocus={canPassFocus}
        onPassFocus={onPassFocus}
        disabled={disabled}
      />
      <div className="combat-panel-body">
        <div
          className="combat-panel-side combat-panel-attackers"
          data-testid="combat-attackers"
        >
          <h4>Attackers ({combat.attackers.length})</h4>
          {combat.attackers.length === 0 ? (
            <p
              className="combat-panel-empty"
              data-testid="combat-attackers-empty"
            >
              (none)
            </p>
          ) : (
            <ul className="combat-panel-unit-list">
              {combat.attackers.map((u) => renderUnit(u, localPlayerId))}
            </ul>
          )}
        </div>
        <div
          className="combat-panel-side combat-panel-defenders"
          data-testid="combat-defenders"
        >
          <h4>Defenders ({combat.defenders.length})</h4>
          {combat.defenders.length === 0 ? (
            <p
              className="combat-panel-empty"
              data-testid="combat-defenders-empty"
            >
              (none)
            </p>
          ) : (
            <ul className="combat-panel-unit-list">
              {combat.defenders.map((u) => renderUnit(u, localPlayerId))}
            </ul>
          )}
        </div>
      </div>
      {assist ? (
        <section
          className={`combat-panel-assist combat-panel-assist-${assistTone ?? "neutral"}`}
          data-testid="combat-panel-assist"
          data-tone={assistTone ?? "neutral"}
          data-lethal={assist.lethal}
        >
          <div className="combat-panel-assist-title">Predicted outcome</div>
          <dl>
            <div className="combat-panel-assist-row">
              <dt>Attackers ({assistAttackerSide})</dt>
              <dd data-testid="combat-assist-attacker-total">
                {assist.attackerTotal} might
              </dd>
            </div>
            <div className="combat-panel-assist-row">
              <dt>Defenders ({assistDefenderSide})</dt>
              <dd data-testid="combat-assist-defender-total">
                {assist.defenderTotal} might
              </dd>
            </div>
            <div className="combat-panel-assist-row">
              <dt>Result</dt>
              <dd
                className={
                  assist.lethal === "stalemate"
                    ? "combat-panel-assist-safe"
                    : (assist.lethal === "none"
                      ? undefined
                      : "combat-panel-assist-lethal")
                }
                data-testid="combat-assist-lethal"
              >
                {LETHAL_LABEL[assist.lethal]}
              </dd>
            </div>
            {assist.playerDamageFromAttackers > 0 ? (
              <div className="combat-panel-assist-row">
                <dt>Player damage</dt>
                <dd
                  className="combat-panel-assist-lethal"
                  data-testid="combat-assist-player-damage"
                >
                  +{assist.playerDamageFromAttackers} to {assistDefenderSide}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}
      <footer
        className="combat-panel-actions"
        data-testid="combat-panel-actions"
      >
        {localUnits.length > 0 && (canAssignAttacker || canAssignDefender) ? (
          <div
            className="combat-panel-action-row combat-panel-assigners"
            data-testid="combat-panel-assigners"
          >
            {localUnits.map((u) => {
              const label = u.name ?? u.definitionId ?? u.id;
              return (
                <div
                  key={u.id}
                  className="combat-panel-assign-row"
                  data-testid={`combat-assign-row-${u.id}`}
                >
                  <span className="combat-panel-assign-label">{label}</span>
                  {canAssignAttacker && onAssignAttacker ? (
                    <button
                      type="button"
                      data-testid={`assign-attacker-${u.id}`}
                      disabled={disabled}
                      onClick={() => onAssignAttacker(u.id)}
                    >
                      Attacker
                    </button>
                  ) : null}
                  {canAssignDefender && onAssignDefender ? (
                    <button
                      type="button"
                      data-testid={`assign-defender-${u.id}`}
                      disabled={disabled}
                      onClick={() => onAssignDefender(u.id)}
                    >
                      Defender
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
        <div className="combat-panel-action-row combat-panel-flow-actions">
          {onPassFocus ? (
            <button
              type="button"
              data-testid="combat-pass-focus"
              disabled={disabled || !canPassFocus}
              title={
                !canPassFocus
                  ? "Pass Focus not legal right now"
                  : undefined
              }
              onClick={() => onPassFocus()}
            >
              Pass Focus
            </button>
          ) : null}
          {onResolveCombat ? (
            <button
              type="button"
              data-testid="combat-resolve"
              disabled={disabled || !canResolveCombat}
              title={
                !canResolveCombat
                  ? "Resolve Combat not legal right now"
                  : undefined
              }
              onClick={() => onResolveCombat(combat.battlefieldId)}
            >
              Resolve Combat
            </button>
          ) : null}
        </div>
      </footer>
    </section>
  );
}
