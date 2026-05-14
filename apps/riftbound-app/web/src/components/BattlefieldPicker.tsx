import type { GameViewBattlefield } from "../lib/api";

interface BattlefieldPickerProps {
  readonly cardId: string;
  readonly cardLabel: string;
  readonly battlefields: readonly GameViewBattlefield[];
  readonly legalLocations: readonly string[];
  readonly onPick: (location: string) => void;
  readonly onCancel: () => void;
}

/**
 * Small in-page modal asking which location to play a hand card to.
 * Renders one button per known location (base + each battlefield). Buttons
 * not in `legalLocations` are disabled — kept visible so the player can see
 * *why* a play is illegal.
 */
export function BattlefieldPicker({
  cardId,
  cardLabel,
  battlefields,
  legalLocations,
  onPick,
  onCancel,
}: BattlefieldPickerProps) {
  const legalSet = new Set(legalLocations);

  const options: { id: string; label: string; meta?: string }[] = [
    { id: "base", label: "Play to Base" },
  ];
  for (const bf of battlefields) {
    const meta = bf.contested
      ? `controller: ${bf.controller ?? "—"} · contested`
      : `controller: ${bf.controller ?? "—"}`;
    options.push({ id: bf.id, label: `Play to ${bf.id}`, meta });
  }

  return (
    <div
      className="battlefield-picker"
      data-testid="battlefield-picker"
      role="dialog"
      aria-label={`Choose location for ${cardLabel}`}
    >
      <div className="battlefield-picker-backdrop" onClick={onCancel} />
      <div className="battlefield-picker-modal">
        <h4 data-testid="battlefield-picker-title">Where to play {cardLabel}?</h4>
        <p className="battlefield-picker-card-id">{cardId}</p>
        <div className="battlefield-picker-options">
          {options.map((opt) => {
            const legal = legalSet.has(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                data-testid={`picker-option-${opt.id}`}
                data-legal={legal ? "true" : "false"}
                disabled={!legal}
                onClick={() => onPick(opt.id)}
              >
                <span className="picker-option-label">{opt.label}</span>
                {opt.meta ? (
                  <span className="picker-option-meta">{opt.meta}</span>
                ) : null}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          data-testid="picker-cancel"
          className="picker-cancel"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
