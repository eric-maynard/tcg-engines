import { useMemo, useState } from "react";
import type { BattlefieldUnit, GameViewBattlefield } from "../lib/api";

interface TargetPickerProps {
  readonly cardId: string;
  readonly cardLabel: string;
  readonly /** Rules-text/abilities preview to help the human pick a sensible target. */ hint?: string;
  readonly battlefields: readonly GameViewBattlefield[];
  /**
   * Caster's playerId. Used to label units as "friendly"/"enemy" so the human
   * can visually filter targets — the engine still validates target legality
   * at apply time.
   */
  readonly casterId: string;
  /**
   * Confirm the chosen targets. Passes an empty array if the user picks
   * "Skip targets" (some spells auto-resolve their target list — see batch 23
   * cards.ts playSpell reducer). The caller is responsible for POSTing the
   * move with `params.targets = ids`.
   */
  readonly onConfirm: (targetIds: readonly string[]) => void;
  readonly onCancel: () => void;
  /**
   * Optional cap on number of targets the user may pick (most spells take 1;
   * "Battle Royale"-style spells take many). Defaults to 1.
   */
  readonly maxTargets?: number;
  /**
   * Phase B batch 25 DDD: engine-validated set of legal target ids. When
   * provided (and non-empty), the picker FILTERS its options to only those
   * ids — illegal units are not rendered. Sourced from `playSpell`
   * enumeration (`HandCard.legalTargets` flattened). When omitted or empty,
   * the picker falls back to listing every battlefield unit (legacy
   * behaviour from batch 24 BBB).
   */
  readonly legalTargetIds?: readonly string[];
  /**
   * Phase B batch 26 HHH: engine-validated legal target TUPLES from the
   * `playSpell` enumerator (one tuple per legal subset). When provided and
   * any tuple has length > 1, the picker switches to a MULTI-PICK UI
   * (checkboxes + Confirm button) and validates the user's selection against
   * this list before invoking `onConfirm`. Omitting it (or providing only
   * single-target tuples) preserves the single-click batch-25 behaviour.
   */
  readonly legalTargets?: readonly (ReadonlyArray<string>)[];
  /**
   * Iter-N: player-target spell variant. When set, the picker renders
   * "You" / "Opponent" buttons instead of battlefield-unit options. The
   * `which` axis controls which of the two buttons is enabled:
   *   - "opponent" → only Opponent enabled
   *   - "self"     → only You enabled
   *   - "any"      → both enabled
   * On click, `onConfirm` fires with `[chosenPlayerId]` so the existing
   * `params.targets` plumbing carries through unchanged.
   */
  readonly playerTarget?: {
    readonly which: "self" | "opponent" | "any";
    readonly localPlayerId: string;
    readonly opponentPlayerId: string;
  };
  /**
   * Iter-N+1: gear-target spell variant. When set, the picker renders a list
   * of gears currently in play (sourced from `view.gearsInPlay`) instead of
   * battlefield-unit rows or You/Opponent buttons. Used by spells like
   * Turn to Dust (`unl-070-219` — "Give a gear [Temporary]") whose
   * `targetDescriptor.type === "gear"`.
   *
   * Empty `gears` array → empty-state ("No gears in play to target") so the
   * human gets visible feedback rather than a silent no-op.
   */
  readonly gearTarget?: {
    readonly gears: readonly {
      readonly id: string;
      readonly name?: string;
      readonly controller: string;
      readonly location: string;
    }[];
  };
  /**
   * Iter-P: permanent-target variant. "Permanent" in Riftbound = anything
   * currently in play (units + gears + equipment). Used by gear cards like
   * Pack of Wonders (`ogn-181-298` — "[Exhaust]: Return target permanent
   * you control to its owner's hand."). Renders a single combined list of
   * permanents with a `permanent-kind` (unit / gear) badge so the human can
   * tell what they're picking. Click submits the permanent's instance id
   * through the standard `params.targets` plumbing.
   *
   * Empty `permanents` list → empty-state ("No permanents in play to
   * target.") so the human gets visible feedback rather than a silent no-op.
   */
  readonly permanentTarget?: {
    readonly permanents: readonly {
      readonly id: string;
      readonly name?: string;
      readonly controller: string;
      readonly kind: "unit" | "gear";
      readonly location: string;
    }[];
  };
  /**
   * Iter-P: spell-target variant. Used by cards whose effect targets a
   * SPELL on the chain (the stack) — e.g. Ravenborn Tome
   * (`ogn-032-298` — "[Exhaust]: Target spell deals 1 bonus damage when it
   * resolves."). Renders a list of pending chain items so the human can
   * pick one. Click submits the spell's chain instance id via the standard
   * `params.targets` plumbing.
   *
   * Empty `spells` list → empty-state ("No spells on the chain to target.")
   * so the human sees why the click doesn't auto-resolve.
   */
  readonly spellTarget?: {
    readonly spells: readonly {
      readonly id: string;
      readonly name?: string;
      readonly controller: string;
    }[];
  };
  /**
   * Iter-Q: card-in-trash variant. Used by spells whose `targetDescriptor`
   * has `location === "trash"` (e.g. Guerilla Warfare — "Return up to two
   * cards with [Hidden] from your trash to your hand."). Renders a flat list
   * of cards currently in trash (across both players), sorted friendly-first
   * by owner. The `controllerFilter` axis hides cards the spell can't
   * legally target (e.g. `"enemy"` shows opponent's trash only).
   *
   * Empty `cards` array → empty-state ("No cards in trash to target.").
   */
  readonly cardInTrashTarget?: {
    readonly cards: readonly {
      readonly id: string;
      readonly name?: string;
      readonly owner: string;
      readonly cardType?: string;
    }[];
    /** Caster's player id — used to compute friendly/enemy and ordering. */
    readonly casterId: string;
    /** Optional controller axis: friendly / enemy / any. Default = any. */
    readonly controllerFilter?: "friendly" | "enemy" | "any";
  };
  /**
   * Iter-Q: card-in-hand variant. Used by spells whose `targetDescriptor`
   * has `location === "hand"` (rare — no current cards in the pool exercise
   * this in the cast-from-hand path, but the variant is scaffolded for
   * future hand-pick effects). Renders the caster's hand only — opponent
   * hand is private to opponent, so cross-hand targeting needs a separate
   * reveal flow (see `pendingChoice` for the Sabotage pattern).
   */
  readonly cardInHandTarget?: {
    readonly cards: readonly {
      readonly id: string;
      readonly name?: string;
      readonly owner: string;
      readonly cardType?: string;
    }[];
    readonly casterId: string;
  };
  /**
   * Iter-Q: card-in-deck variant (tutor / search). The engine doesn't expose
   * the caster's deck contents directly (deck zone is secret), so this
   * picker renders an empty-state with a "Skip targets" button that auto-
   * resolves via the engine's tutor logic. The card-in-deck flow is mostly
   * engine-side: the spell's reducer searches the deck and applies the
   * effect; the SPA just needs to confirm "yes, resolve now."
   *
   * When `cards` IS populated (future engine pass exposes a tutored-slice),
   * the picker renders them as rows. For now it's always empty/skip-only.
   */
  readonly cardInDeckTarget?: {
    readonly cards: readonly {
      readonly id: string;
      readonly name?: string;
      readonly cardType?: string;
    }[];
    readonly casterId: string;
    /** Human-readable filter hint, e.g. "any unit", "a Dragon". */
    readonly filterHint?: string;
  };
  /**
   * Iter-Q: rune-target variant. Renders runes from the runePool, friendly
   * first, sorted by name. Used by spells whose target is `{type: "rune"}`.
   * Empty list → empty-state.
   */
  readonly runeTarget?: {
    readonly runes: readonly {
      readonly id: string;
      readonly name?: string;
      readonly owner: string;
    }[];
    readonly casterId: string;
    readonly controllerFilter?: "friendly" | "enemy" | "any";
  };
}

/**
 * Pick target unit(s) for a `playSpell` move.
 *
 * Engine support status (batch 24 BBB investigation):
 *   - `playSpell` move accepts `params.targets?: CardId[]` (see
 *     `packages/riftbound-engine/src/types/moves.ts`).
 *   - The legal-moves enumerator (`/api/v2/state` → `legalMoves`) does NOT
 *     enumerate target tuples per spell — it only returns `{cardId, playerId}`
 *     and trusts `playSpell.condition` to reject spells whose targets
 *     resolve to an empty set. So the SPA can't lock the picker to
 *     engine-validated tuples yet; we show ALL battlefield units and let
 *     the engine error surface on illegal picks.
 *
 *   GAP-FOR-BATCH-25: extend `legalMoves` (or add a `/api/v2/targets/:cardId`
 *   probe endpoint) to expose the valid target IDs per spell so the picker
 *   can grey out illegal targets up-front instead of round-tripping a reject.
 */
export function TargetPicker({
  cardId,
  cardLabel,
  hint,
  battlefields,
  casterId,
  onConfirm,
  onCancel,
  maxTargets = 1,
  legalTargetIds,
  legalTargets,
  playerTarget,
  gearTarget,
  permanentTarget,
  spellTarget,
  cardInTrashTarget,
  cardInHandTarget,
  cardInDeckTarget,
  runeTarget,
}: TargetPickerProps) {
  // Phase B batch 26 HHH: derive whether this spell is multi-target by
  // Inspecting the engine-validated tuples. If ANY tuple has length > 1
  // The picker renders a checkbox-based multi-pick UI; otherwise it falls
  // Back to the batch-25 single-click flow.
  const isMulti = useMemo(
    () => Array.isArray(legalTargets) && legalTargets.some((t) => (t?.length ?? 0) > 1),
    [legalTargets],
  );
  // Pre-compute the set of legal selection signatures (sorted-joined tuple
  // Ids) so we can validate the user's chosen set in O(1) on confirm.
  const legalSignatures = useMemo(() => {
    if (!isMulti || !legalTargets) {return null;}
    const sigs = new Set<string>();
    for (const tup of legalTargets) {
      sigs.add([...(tup ?? [])].slice().toSorted().join("|"));
    }
    return sigs;
  }, [isMulti, legalTargets]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [validationError, setValidationError] = useState<string | null>(null);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) {next.delete(id);}
    else {next.add(id);}
    setSelected(next);
    setValidationError(null);
  };

  const confirmMulti = () => {
    const ids = [...selected];
    const sig = [...ids].toSorted().join("|");
    if (legalSignatures && !legalSignatures.has(sig)) {
      setValidationError(
        ids.length === 0
          ? "Pick at least one target (or check the legal subsets)."
          : "Selected combination isn't a legal subset for this spell.",
      );
      return;
    }
    onConfirm(ids);
  };
  // Flatten battlefield units (friendly first, then enemy) so the human
  // Sees their own board at the top of the picker.
  interface Row {
    unit: BattlefieldUnit;
    battlefieldId: string;
    isFriendly: boolean;
  }
  // Phase B batch 25 DDD: when `legalTargetIds` is provided we FILTER the
  // Picker to only those ids. Empty list ⇒ no legal targets (shouldn't reach
  // Here — caller wouldn't have opened the picker — but render the empty
  // State safely). Absent / undefined ⇒ legacy "show every battlefield unit"
  // Behaviour from batch 24 BBB.
  const legalSet =
    legalTargetIds && legalTargetIds.length > 0 ? new Set(legalTargetIds) : null;
  const rows: Row[] = [];
  for (const bf of battlefields) {
    for (const u of bf.units) {
      if (legalSet && !legalSet.has(u.id)) {
        continue;
      }
      rows.push({
        battlefieldId: bf.id,
        isFriendly: u.controller === casterId,
        unit: u,
      });
    }
  }
  // Stable ordering: friendly first, then alphabetical by unit name.
  rows.sort((a, b) => {
    if (a.isFriendly !== b.isFriendly) {return a.isFriendly ? -1 : 1;}
    const an = a.unit.name ?? a.unit.definitionId;
    const bn = b.unit.name ?? b.unit.definitionId;
    return an.localeCompare(bn);
  });

  // Iter-N: player-target spells get a fundamentally different UI — two
  // Buttons (You / Opponent) instead of a list of battlefield units. We
  // Short-circuit BEFORE the unit-row computation so the empty-state
  // ("No units on the battlefield to target") never renders for a spell
  // Whose target is conceptually a player, not a unit.
  if (playerTarget) {
    const youEnabled =
      playerTarget.which === "self" || playerTarget.which === "any";
    const oppEnabled =
      playerTarget.which === "opponent" || playerTarget.which === "any";
    return (
      <div
        className="target-picker target-picker-player"
        data-testid="target-picker"
        data-variant="player"
        role="dialog"
        aria-label={`Choose target player for ${cardLabel}`}
      >
        <div className="target-picker-backdrop" onClick={onCancel} />
        <div className="target-picker-modal">
          <h4 data-testid="target-picker-title">
            Choose target: a player
          </h4>
          <p className="target-picker-card-id">
            {cardLabel} <span style={{ opacity: 0.6 }}>({cardId})</span>
          </p>
          {hint ? (
            <p className="target-picker-hint" data-testid="target-picker-hint">
              {hint}
            </p>
          ) : null}
          <div
            className="target-picker-options target-picker-options-player"
            data-mode="player"
          >
            <button
              type="button"
              data-testid="target-option-player-self"
              data-side="friendly"
              data-player-id={playerTarget.localPlayerId}
              disabled={!youEnabled}
              title={
                youEnabled ? "Target yourself" : "Not a legal target for this spell"
              }
              onClick={() => onConfirm([playerTarget.localPlayerId])}
            >
              <span className="target-option-label">You</span>
              <span className="target-option-meta">
                {youEnabled ? "legal target" : "not a legal target"}
              </span>
            </button>
            <button
              type="button"
              data-testid="target-option-player-opponent"
              data-side="enemy"
              data-player-id={playerTarget.opponentPlayerId}
              disabled={!oppEnabled}
              title={
                oppEnabled
                  ? "Target your opponent"
                  : "Not a legal target for this spell"
              }
              onClick={() => onConfirm([playerTarget.opponentPlayerId])}
            >
              <span className="target-option-label">Opponent</span>
              <span className="target-option-meta">
                {oppEnabled ? "legal target" : "not a legal target"}
              </span>
            </button>
          </div>
          <div className="target-picker-actions">
            <button
              type="button"
              data-testid="target-cancel"
              className="target-cancel"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Iter-N+1: gear-target variant. Render rows of gears currently in play,
  // Labelled friendly/enemy by controller and tagged with their location
  // ("base" or a battlefield id). Click submits the gear's instance id via
  // The existing `params.targets` plumbing.
  if (gearTarget) {
    const sortedGears = [...gearTarget.gears].toSorted((a, b) => {
      const af = a.controller === casterId;
      const bf = b.controller === casterId;
      if (af !== bf) {return af ? -1 : 1;}
      const an = a.name ?? a.id;
      const bn = b.name ?? b.id;
      return an.localeCompare(bn);
    });
    return (
      <div
        className="target-picker target-picker-gear"
        data-testid="target-picker"
        data-variant="gear"
        role="dialog"
        aria-label={`Choose target gear for ${cardLabel}`}
      >
        <div className="target-picker-backdrop" onClick={onCancel} />
        <div className="target-picker-modal">
          <h4 data-testid="target-picker-title">
            Choose target gear for {cardLabel}
          </h4>
          <p className="target-picker-card-id">
            {cardLabel} <span style={{ opacity: 0.6 }}>({cardId})</span>
          </p>
          {hint ? (
            <p className="target-picker-hint" data-testid="target-picker-hint">
              {hint}
            </p>
          ) : null}
          <div
            className="target-picker-options target-picker-options-gear"
            data-mode="gear"
          >
            {sortedGears.length === 0 ? (
              <p
                className="target-picker-empty"
                data-testid="target-picker-empty"
              >
                No gears in play to target.
              </p>
            ) : (
              sortedGears.map((g) => {
                const isFriendly = g.controller === casterId;
                const side = isFriendly ? "friendly" : "enemy";
                const label = g.name ?? g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    data-testid={`target-option-${g.id}`}
                    data-side={side}
                    data-location={g.location}
                    onClick={() => onConfirm([g.id])}
                  >
                    <span className="target-option-label">{label}</span>
                    <span className="target-option-meta">
                      gear · {side} · {g.location}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <div className="target-picker-actions">
            <button
              type="button"
              data-testid="target-cancel"
              className="target-cancel"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Iter-P: permanent-target variant. Sorted friendly-first, alphabetical
  // By label, with a unit/gear kind badge.
  if (permanentTarget) {
    const sortedPerms = [...permanentTarget.permanents].toSorted((a, b) => {
      const af = a.controller === casterId;
      const bf = b.controller === casterId;
      if (af !== bf) {return af ? -1 : 1;}
      const an = a.name ?? a.id;
      const bn = b.name ?? b.id;
      return an.localeCompare(bn);
    });
    return (
      <div
        className="target-picker target-picker-permanent"
        data-testid="target-picker"
        data-variant="permanent"
        role="dialog"
        aria-label={`Choose target permanent for ${cardLabel}`}
      >
        <div className="target-picker-backdrop" onClick={onCancel} />
        <div className="target-picker-modal">
          <h4 data-testid="target-picker-title">
            Choose target permanent for {cardLabel}
          </h4>
          <p className="target-picker-card-id">
            {cardLabel} <span style={{ opacity: 0.6 }}>({cardId})</span>
          </p>
          {hint ? (
            <p className="target-picker-hint" data-testid="target-picker-hint">
              {hint}
            </p>
          ) : null}
          <div
            className="target-picker-options target-picker-options-permanent"
            data-mode="permanent"
          >
            {sortedPerms.length === 0 ? (
              <p
                className="target-picker-empty"
                data-testid="target-picker-empty"
              >
                No permanents in play to target.
              </p>
            ) : (
              sortedPerms.map((p) => {
                const isFriendly = p.controller === casterId;
                const side = isFriendly ? "friendly" : "enemy";
                const label = p.name ?? p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    data-testid={`target-option-${p.id}`}
                    data-side={side}
                    data-permanent-kind={p.kind}
                    data-location={p.location}
                    onClick={() => onConfirm([p.id])}
                  >
                    <span className="target-option-label">{label}</span>
                    <span className="target-option-meta">
                      {p.kind} · {side} · {p.location}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <div className="target-picker-actions">
            <button
              type="button"
              data-testid="target-skip"
              className="target-skip"
              onClick={() => onConfirm([])}
            >
              Skip targets (let engine auto-resolve)
            </button>
            <button
              type="button"
              data-testid="target-cancel"
              className="target-cancel"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Iter-Q: card-in-trash variant. Render trash cards friendly-first, with
  // Owner-labelled side badges. When `controllerFilter` is provided we hide
  // Cards on the opposing side so the human can't pick illegal targets up-
  // Front (the engine still validates at apply time).
  if (cardInTrashTarget) {
    const filter = cardInTrashTarget.controllerFilter ?? "any";
    const visibleCards = cardInTrashTarget.cards.filter((c) => {
      if (filter === "any") {return true;}
      const isFriendly = c.owner === cardInTrashTarget.casterId;
      return filter === "friendly" ? isFriendly : !isFriendly;
    });
    const sortedCards = [...visibleCards].toSorted((a, b) => {
      const af = a.owner === cardInTrashTarget.casterId;
      const bf = b.owner === cardInTrashTarget.casterId;
      if (af !== bf) {return af ? -1 : 1;}
      const an = a.name ?? a.id;
      const bn = b.name ?? b.id;
      return an.localeCompare(bn);
    });
    return (
      <div
        className="target-picker target-picker-card-in-trash"
        data-testid="target-picker"
        data-variant="card-in-trash"
        role="dialog"
        aria-label={`Choose target card in trash for ${cardLabel}`}
      >
        <div className="target-picker-backdrop" onClick={onCancel} />
        <div className="target-picker-modal">
          <h4 data-testid="target-picker-title">
            Choose target card in trash for {cardLabel}
          </h4>
          <p className="target-picker-card-id">
            {cardLabel} <span style={{ opacity: 0.6 }}>({cardId})</span>
          </p>
          {hint ? (
            <p className="target-picker-hint" data-testid="target-picker-hint">
              {hint}
            </p>
          ) : null}
          <div
            className="target-picker-options target-picker-options-card-in-trash"
            data-mode="card-in-trash"
          >
            {sortedCards.length === 0 ? (
              <p
                className="target-picker-empty"
                data-testid="target-picker-empty"
              >
                No cards in trash to target.
              </p>
            ) : (
              sortedCards.map((c) => {
                const isFriendly = c.owner === cardInTrashTarget.casterId;
                const side = isFriendly ? "friendly" : "enemy";
                const label = c.name ?? c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    data-testid={`target-option-${c.id}`}
                    data-side={side}
                    data-card-type={c.cardType ?? ""}
                    onClick={() => onConfirm([c.id])}
                  >
                    <span className="target-option-label">{label}</span>
                    <span className="target-option-meta">
                      {c.cardType ?? "card"} · {side} · trash
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <div className="target-picker-actions">
            <button
              type="button"
              data-testid="target-skip"
              className="target-skip"
              onClick={() => onConfirm([])}
            >
              Skip targets (let engine auto-resolve)
            </button>
            <button
              type="button"
              data-testid="target-cancel"
              className="target-cancel"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Iter-Q: card-in-hand variant. Caster's hand only — opponent hand is
  // Private (see Sabotage's reveal-and-pick pendingChoice flow for the
  // Cross-hand pattern). Sorted alphabetically by name.
  if (cardInHandTarget) {
    const sortedCards = [...cardInHandTarget.cards]
      .filter((c) => c.owner === cardInHandTarget.casterId)
      .toSorted((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
    return (
      <div
        className="target-picker target-picker-card-in-hand"
        data-testid="target-picker"
        data-variant="card-in-hand"
        role="dialog"
        aria-label={`Choose target card in hand for ${cardLabel}`}
      >
        <div className="target-picker-backdrop" onClick={onCancel} />
        <div className="target-picker-modal">
          <h4 data-testid="target-picker-title">
            Choose target card in hand for {cardLabel}
          </h4>
          <p className="target-picker-card-id">
            {cardLabel} <span style={{ opacity: 0.6 }}>({cardId})</span>
          </p>
          {hint ? (
            <p className="target-picker-hint" data-testid="target-picker-hint">
              {hint}
            </p>
          ) : null}
          <div
            className="target-picker-options target-picker-options-card-in-hand"
            data-mode="card-in-hand"
          >
            {sortedCards.length === 0 ? (
              <p
                className="target-picker-empty"
                data-testid="target-picker-empty"
              >
                No cards in hand to target.
              </p>
            ) : (
              sortedCards.map((c) => {
                const label = c.name ?? c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    data-testid={`target-option-${c.id}`}
                    data-side="friendly"
                    data-card-type={c.cardType ?? ""}
                    onClick={() => onConfirm([c.id])}
                  >
                    <span className="target-option-label">{label}</span>
                    <span className="target-option-meta">
                      {c.cardType ?? "card"} · friendly · hand
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <div className="target-picker-actions">
            <button
              type="button"
              data-testid="target-skip"
              className="target-skip"
              onClick={() => onConfirm([])}
            >
              Skip targets (let engine auto-resolve)
            </button>
            <button
              type="button"
              data-testid="target-cancel"
              className="target-cancel"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Iter-Q: card-in-deck variant (tutor / search). The engine doesn't expose
  // The caster's deck contents directly — deck is a `secret` zone (see
  // Riftbound-engine `zone-configs.ts`). For now the picker renders an
  // Empty-state + "Skip" button; clicking Skip dispatches with an empty
  // Targets array so the engine's `playSpell` reducer can search its own
  // Copy of the deck. When the engine eventually exposes a tutored slice
  // (e.g. top-K filter), the same picker will render those rows.
  if (cardInDeckTarget) {
    const sortedCards = [...cardInDeckTarget.cards].toSorted((a, b) =>
      (a.name ?? a.id).localeCompare(b.name ?? b.id),
    );
    return (
      <div
        className="target-picker target-picker-card-in-deck"
        data-testid="target-picker"
        data-variant="card-in-deck"
        role="dialog"
        aria-label={`Search deck for ${cardLabel}`}
      >
        <div className="target-picker-backdrop" onClick={onCancel} />
        <div className="target-picker-modal">
          <h4 data-testid="target-picker-title">
            Search deck for {cardLabel}
          </h4>
          <p className="target-picker-card-id">
            {cardLabel} <span style={{ opacity: 0.6 }}>({cardId})</span>
          </p>
          {hint ? (
            <p className="target-picker-hint" data-testid="target-picker-hint">
              {hint}
            </p>
          ) : null}
          {cardInDeckTarget.filterHint ? (
            <p
              className="target-picker-deck-filter"
              data-testid="target-picker-deck-filter"
            >
              Searching for: {cardInDeckTarget.filterHint}
            </p>
          ) : null}
          <div
            className="target-picker-options target-picker-options-card-in-deck"
            data-mode="card-in-deck"
          >
            {sortedCards.length === 0 ? (
              <p
                className="target-picker-empty"
                data-testid="target-picker-empty"
              >
                Deck contents are private — click Skip to let the engine search
                and auto-resolve.
              </p>
            ) : (
              sortedCards.map((c) => {
                const label = c.name ?? c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    data-testid={`target-option-${c.id}`}
                    data-side="friendly"
                    data-card-type={c.cardType ?? ""}
                    onClick={() => onConfirm([c.id])}
                  >
                    <span className="target-option-label">{label}</span>
                    <span className="target-option-meta">
                      {c.cardType ?? "card"} · deck
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <div className="target-picker-actions">
            <button
              type="button"
              data-testid="target-skip"
              className="target-skip"
              onClick={() => onConfirm([])}
            >
              Skip targets (let engine auto-resolve)
            </button>
            <button
              type="button"
              data-testid="target-cancel"
              className="target-cancel"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Iter-Q: rune-target variant. Renders runes from the runePool with
  // Friendly-first ordering and an empty-state when the pool is empty.
  if (runeTarget) {
    const filter = runeTarget.controllerFilter ?? "any";
    const visibleRunes = runeTarget.runes.filter((r) => {
      if (filter === "any") {return true;}
      const isFriendly = r.owner === runeTarget.casterId;
      return filter === "friendly" ? isFriendly : !isFriendly;
    });
    const sortedRunes = [...visibleRunes].toSorted((a, b) => {
      const af = a.owner === runeTarget.casterId;
      const bf = b.owner === runeTarget.casterId;
      if (af !== bf) {return af ? -1 : 1;}
      const an = a.name ?? a.id;
      const bn = b.name ?? b.id;
      return an.localeCompare(bn);
    });
    return (
      <div
        className="target-picker target-picker-rune"
        data-testid="target-picker"
        data-variant="rune"
        role="dialog"
        aria-label={`Choose target rune for ${cardLabel}`}
      >
        <div className="target-picker-backdrop" onClick={onCancel} />
        <div className="target-picker-modal">
          <h4 data-testid="target-picker-title">
            Choose target rune for {cardLabel}
          </h4>
          <p className="target-picker-card-id">
            {cardLabel} <span style={{ opacity: 0.6 }}>({cardId})</span>
          </p>
          {hint ? (
            <p className="target-picker-hint" data-testid="target-picker-hint">
              {hint}
            </p>
          ) : null}
          <div
            className="target-picker-options target-picker-options-rune"
            data-mode="rune"
          >
            {sortedRunes.length === 0 ? (
              <p
                className="target-picker-empty"
                data-testid="target-picker-empty"
              >
                No runes in the rune pool to target.
              </p>
            ) : (
              sortedRunes.map((r) => {
                const isFriendly = r.owner === runeTarget.casterId;
                const side = isFriendly ? "friendly" : "enemy";
                const label = r.name ?? r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    data-testid={`target-option-${r.id}`}
                    data-side={side}
                    onClick={() => onConfirm([r.id])}
                  >
                    <span className="target-option-label">{label}</span>
                    <span className="target-option-meta">rune · {side}</span>
                  </button>
                );
              })
            )}
          </div>
          <div className="target-picker-actions">
            <button
              type="button"
              data-testid="target-skip"
              className="target-skip"
              onClick={() => onConfirm([])}
            >
              Skip targets (let engine auto-resolve)
            </button>
            <button
              type="button"
              data-testid="target-cancel"
              className="target-cancel"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Iter-P: spell-target variant — list pending chain items.
  if (spellTarget) {
    const sortedSpells = [...spellTarget.spells].toSorted((a, b) => {
      const af = a.controller === casterId;
      const bf = b.controller === casterId;
      if (af !== bf) {return af ? -1 : 1;}
      const an = a.name ?? a.id;
      const bn = b.name ?? b.id;
      return an.localeCompare(bn);
    });
    return (
      <div
        className="target-picker target-picker-spell"
        data-testid="target-picker"
        data-variant="spell"
        role="dialog"
        aria-label={`Choose target spell for ${cardLabel}`}
      >
        <div className="target-picker-backdrop" onClick={onCancel} />
        <div className="target-picker-modal">
          <h4 data-testid="target-picker-title">
            Choose target spell for {cardLabel}
          </h4>
          <p className="target-picker-card-id">
            {cardLabel} <span style={{ opacity: 0.6 }}>({cardId})</span>
          </p>
          {hint ? (
            <p className="target-picker-hint" data-testid="target-picker-hint">
              {hint}
            </p>
          ) : null}
          <div
            className="target-picker-options target-picker-options-spell"
            data-mode="spell"
          >
            {sortedSpells.length === 0 ? (
              <p
                className="target-picker-empty"
                data-testid="target-picker-empty"
              >
                No spells on the chain to target.
              </p>
            ) : (
              sortedSpells.map((s) => {
                const isFriendly = s.controller === casterId;
                const side = isFriendly ? "friendly" : "enemy";
                const label = s.name ?? s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    data-testid={`target-option-${s.id}`}
                    data-side={side}
                    onClick={() => onConfirm([s.id])}
                  >
                    <span className="target-option-label">{label}</span>
                    <span className="target-option-meta">spell · {side}</span>
                  </button>
                );
              })
            )}
          </div>
          <div className="target-picker-actions">
            <button
              type="button"
              data-testid="target-skip"
              className="target-skip"
              onClick={() => onConfirm([])}
            >
              Skip targets (let engine auto-resolve)
            </button>
            <button
              type="button"
              data-testid="target-cancel"
              className="target-cancel"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="target-picker"
      data-testid="target-picker"
      role="dialog"
      aria-label={`Choose target for ${cardLabel}`}
    >
      <div className="target-picker-backdrop" onClick={onCancel} />
      <div className="target-picker-modal">
        <h4 data-testid="target-picker-title">
          Choose target{maxTargets > 1 ? "s" : ""} for {cardLabel}
        </h4>
        <p className="target-picker-card-id">{cardId}</p>
        {hint ? (
          <p className="target-picker-hint" data-testid="target-picker-hint">
            {hint}
          </p>
        ) : null}
        <div
          className="target-picker-options"
          data-mode={isMulti ? "multi" : "single"}
        >
          {rows.length === 0 ? (
            <p className="target-picker-empty" data-testid="target-picker-empty">
              No units on the battlefield to target.
            </p>
          ) : (isMulti ? (
            rows.map((row) => {
              const label = row.unit.name ?? row.unit.definitionId;
              const side = row.isFriendly ? "friendly" : "enemy";
              const checked = selected.has(row.unit.id);
              return (
                <label
                  key={row.unit.id}
                  className="target-option-multi"
                  data-testid={`target-option-${row.unit.id}`}
                  data-side={side}
                  data-battlefield={row.battlefieldId}
                  data-checked={checked ? "true" : "false"}
                >
                  <input
                    type="checkbox"
                    data-testid={`target-checkbox-${row.unit.id}`}
                    checked={checked}
                    onChange={() => toggle(row.unit.id)}
                  />
                  <span className="target-option-label">{label}</span>
                  <span className="target-option-meta">
                    {side} · {row.battlefieldId}
                    {typeof row.unit.might === "number" ? ` · ${row.unit.might} might` : ""}
                  </span>
                </label>
              );
            })
          ) : (
            rows.map((row) => {
              const label = row.unit.name ?? row.unit.definitionId;
              const side = row.isFriendly ? "friendly" : "enemy";
              return (
                <button
                  key={row.unit.id}
                  type="button"
                  data-testid={`target-option-${row.unit.id}`}
                  data-side={side}
                  data-battlefield={row.battlefieldId}
                  onClick={() => onConfirm([row.unit.id])}
                >
                  <span className="target-option-label">{label}</span>
                  <span className="target-option-meta">
                    {side} · {row.battlefieldId}
                    {typeof row.unit.might === "number" ? ` · ${row.unit.might} might` : ""}
                  </span>
                </button>
              );
            })
          ))}
        </div>
        {validationError ? (
          <p
            className="target-picker-error"
            data-testid="target-picker-error"
            role="alert"
          >
            {validationError}
          </p>
        ) : null}
        <div className="target-picker-actions">
          {isMulti ? (
            <button
              type="button"
              data-testid="target-confirm"
              className="target-confirm"
              onClick={confirmMulti}
            >
              Confirm ({selected.size} selected)
            </button>
          ) : (
            <button
              type="button"
              data-testid="target-skip"
              className="target-skip"
              onClick={() => onConfirm([])}
            >
              Skip targets (let engine auto-resolve)
            </button>
          )}
          <button
            type="button"
            data-testid="target-cancel"
            className="target-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
