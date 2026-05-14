/**
 * DeckPile (iter-21 RiftAtlas parity refresh).
 *
 * Renders a face-down pile of cards as a stack of 2-3 offset card-back
 * tiles, with a chunky pill-style count badge in the top-right corner
 * and a small uppercase label below. Variant tints (deck blue, rune
 * purple, trash charcoal) come from per-variant CSS classes — no
 * per-card if-laddering.
 *
 * Stack approach:
 *   - 3 stacked rectangles share `.deck-pile-card` (the visual layer)
 *     plus a per-layer modifier (`-back`, `-mid`, `-top`) for the offset.
 *   - The bottom two layers are pure colored rectangles; the top tile
 *     also carries a centered variant glyph (☼ deck, ⛤ rune, 🗑 trash).
 *   - When `size === 0` the component renders an empty outlined frame
 *     with a strikethrough "0" instead of the stacked tiles, so an
 *     empty pile is visually distinguishable at a glance.
 *
 * Props:
 *   - size: current pile size (count badge value).
 *   - label: optional accessible label (e.g. "deck" / "rune deck").
 *   - testId: stable data-testid prefix for tests.
 *   - variant: "deck" (blue) | "rune" (purple) | "trash" (charcoal).
 *
 * No engine coupling — pure presentational. The parent (PlayerPanel)
 * supplies `player.deckSize`, `player.runeDeckSize`, `player.trashSize`.
 */

interface DeckPileProps {
  readonly size: number;
  readonly label?: string;
  readonly testId?: string;
  readonly variant?: "deck" | "rune" | "trash";
}

// Variant glyph table — pure data, no per-card ifs in the JSX.
const VARIANT_GLYPH: Record<NonNullable<DeckPileProps["variant"]>, string> = {
  deck: "☼", // ☼ sun (deck)
  rune: "⛤", // ⛤ pentagram (runes)
  trash: "🗑", // 🗑 wastebasket (trash)
};

// Three offset layers — back-most first so DOM order maps to z-order.
const STACK_LAYERS = ["back", "mid", "top"] as const;

export function DeckPile({
  size,
  label,
  testId,
  variant = "deck",
}: DeckPileProps) {
  const isEmpty = size === 0;
  const glyph = VARIANT_GLYPH[variant];
  return (
    <div
      className={`deck-pile deck-pile-${variant}${isEmpty ? " deck-pile-empty" : ""}`}
      data-testid={testId}
      data-size={size}
      data-variant={variant}
      data-empty={isEmpty ? "true" : "false"}
      role="img"
      aria-label={`${label ?? variant} (${size} cards)`}
      title={label ? `${label}: ${size}` : `${size} cards`}
    >
      {isEmpty ? (
        <span
          className="deck-pile-empty-frame"
          aria-hidden="true"
          data-testid={testId ? `${testId}-empty` : undefined}
        >
          <span className="deck-pile-empty-zero">0</span>
        </span>
      ) : (
        <span className="deck-pile-stack" aria-hidden="true">
          {STACK_LAYERS.map((layer) => (
            <span
              key={layer}
              className={`deck-pile-card deck-pile-card-${layer}`}
              aria-hidden="true"
              data-layer={layer}
            >
              {layer === "top" ? (
                <span className="deck-pile-glyph" aria-hidden="true">
                  {glyph}
                </span>
              ) : null}
            </span>
          ))}
        </span>
      )}
      <span
        className="deck-pile-count"
        data-testid={testId ? `${testId}-count` : undefined}
      >
        {size}
      </span>
      {label ? <span className="deck-pile-label">{label}</span> : null}
    </div>
  );
}
