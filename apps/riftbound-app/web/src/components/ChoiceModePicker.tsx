/**
 * ChoiceModePicker — modal for the `pick-mode` pendingChoice variant.
 *
 * Triggered by modal "Choose one — A. B." spells (Flurry of Feathers,
 * Disposal Order, Curtain Call, Party Favors, …). Renders one big
 * button per option label; clicking confirms the chosen index and
 * dispatches `resolvePendingChoice({ pickedOptionIndex })` so the
 * engine fires that branch's effect.
 *
 * Until the caster confirms, the engine pauses play — only
 * `resolvePendingChoice` is a legal move. Previously the engine
 * auto-picked the first option, silently bypassing the caster's
 * decision; this picker restores that decision to the SPA.
 *
 * The modal reuses the `target-picker` shell selectors so it inherits
 * backdrop + centering from the existing target-picker CSS, with its
 * own `choice-modal-*` class hooks for the per-option buttons.
 */

interface ChoiceOption {
  readonly index: number;
  readonly label: string;
}

interface ChoiceModePickerProps {
  /** The source card's name (e.g. "Flurry of Feathers"), for the header. */
  readonly cardLabel?: string;
  /** Option list (display only; the engine stores the effects server-side). */
  readonly options: readonly ChoiceOption[];
  /** Dispatch the engine's `resolvePendingChoice` with the picked index. */
  readonly onConfirm: (index: number) => void;
}

export function ChoiceModePicker({
  cardLabel,
  options,
  onConfirm,
}: ChoiceModePickerProps) {
  return (
    <div
      className="target-picker target-picker-choice choice-modal"
      data-testid="choice-modal"
      data-variant="pick-mode"
      role="dialog"
      aria-label={`Choose one${cardLabel ? ` — ${cardLabel}` : ""}`}
    >
      <div className="target-picker-backdrop choice-modal-backdrop" />
      <div className="target-picker-modal choice-modal-panel">
        <h4 data-testid="choice-modal-title">
          Choose one{cardLabel ? ` — ${cardLabel}` : ""}
        </h4>
        <div className="choice-modal-options">
          {options.map((opt) => (
            <button
              key={opt.index}
              type="button"
              data-testid={`choice-option-${opt.index}`}
              onClick={() => onConfirm(opt.index)}
              className="choice-modal-option"
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
