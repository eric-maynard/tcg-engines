/**
 * LookPicker — modal for the `look-and-pick` pendingChoice variant.
 *
 * Triggered by spells like Stacked Deck ("Look at the top 3 cards of your
 * Main Deck. Put 1 into your hand and recycle the rest."). Renders the
 * revealed cards face-up; clicking one dispatches `resolvePendingChoice`
 * with that card's id (the picked card is moved to its destination by
 * the engine; the rest are recycled to the bottom of the deck).
 *
 * Style-wise this reuses the `target-picker` shell selectors so the modal
 * inherits backdrop + centering from the existing target-picker CSS, and
 * adds a small `look-picker-cards` row of face-up chips. When the engine
 * provides per-card enrichment (name/imageUrl/cardType) we render full
 * art; otherwise we fall back to a textual chip with the card id.
 */
import type { CSSProperties } from "react";

interface RevealedCard {
  readonly id: string;
  readonly definitionId?: string;
  readonly name?: string;
  readonly imageUrl?: string;
  readonly cardType?: string;
}

interface LookPickerProps {
  /** Source card that triggered this look (e.g. "Stacked Deck"). */
  readonly cardLabel?: string;
  /** Source card id (for the testid suffix / context). */
  readonly cardId?: string;
  /** Cards the prompter peeked at (top N of their deck). */
  readonly revealedCards: readonly RevealedCard[];
  /** "to-hand" / "recycle" / etc. — drives the modal subtitle. */
  readonly onPickedDest: "to-hand" | "to-trash" | "to-play" | "banish" | "recycle";
  /** Dispatch the engine's `resolvePendingChoice` with the picked card id. */
  readonly onPick: (cardId: string) => void;
}

function destLabel(dest: LookPickerProps["onPickedDest"]): string {
  switch (dest) {
    case "to-hand": {
      return "into your hand";
    }
    case "to-trash": {
      return "to the trash";
    }
    case "to-play": {
      return "into play";
    }
    case "banish": {
      return "to banishment";
    }
    case "recycle": {
      return "to the bottom of your deck";
    }
  }
}

export function LookPicker({
  cardLabel,
  cardId,
  revealedCards,
  onPickedDest,
  onPick,
}: LookPickerProps) {
  return (
    <div
      className="target-picker target-picker-reveal"
      data-testid="target-picker"
      data-variant="look-and-pick"
      role="dialog"
      aria-label={`Look — pick 1${cardLabel ? ` for ${cardLabel}` : ""}`}
    >
      <div className="target-picker-backdrop" />
      <div className="target-picker-modal look-picker-modal">
        <h4 data-testid="target-picker-title">
          Look — pick 1 {destLabel(onPickedDest)}
        </h4>
        {cardLabel ? (
          <p className="target-picker-card-id">
            {cardLabel}
            {cardId ? <span style={{ opacity: 0.6 }}> ({cardId})</span> : null}
          </p>
        ) : null}
        <p
          className="target-picker-hint"
          data-testid="target-picker-hint"
        >
          The other cards are recycled to the bottom of your deck.
        </p>
        <div
          className="target-picker-options look-picker-cards"
          data-testid="look-picker-cards"
          style={{
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 12,
            justifyContent: "center",
            padding: "12px 0",
          }}
        >
          {revealedCards.length === 0 ? (
            <p
              className="target-picker-empty"
              data-testid="look-picker-empty"
              style={{ opacity: 0.7 }}
            >
              (deck is empty — nothing to look at)
            </p>
          ) : (
            revealedCards.map((c, idx) => (
              <button
                key={c.id}
                type="button"
                data-testid={`look-option-${c.id}`}
                data-card-id={c.id}
                data-card-index={idx}
                onClick={() => onPick(c.id)}
                className={`look-option hand-chip${c.imageUrl ? " hand-chip-art" : ""}`}
                style={
                  c.imageUrl
                    ? ({
                        "--card-img": `url(${c.imageUrl})`,
                        backgroundImage: `url(${c.imageUrl})`,
                        backgroundPosition: "center",
                        backgroundRepeat: "no-repeat",
                        backgroundSize: "cover",
                        border: "2px solid rgba(220,180,80,0.6)",
                        borderRadius: 10,
                        cursor: "pointer",
                        height: 252,
                        padding: 0,
                        width: 180,
                      } as CSSProperties)
                    : {
                        alignItems: "center",
                        background:
                          "linear-gradient(180deg, #1a1f2a 0%, #0d111a 100%)",
                        border: "2px solid rgba(220,180,80,0.6)",
                        borderRadius: 10,
                        color: "#e8e8e8",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        fontSize: 13,
                        height: 252,
                        justifyContent: "center",
                        padding: 8,
                        textAlign: "center",
                        width: 180,
                      }
                }
                title={`Pick ${c.name ?? c.id}`}
              >
                {c.imageUrl ? (
                  // Render an alt-friendly hidden label so screen readers
                  // Know what the card is even though the visual is a
                  // Background image.
                  <span
                    style={{
                      clip: "rect(0 0 0 0)",
                      height: 1,
                      overflow: "hidden",
                      position: "absolute",
                      width: 1,
                    }}
                  >
                    {c.name ?? c.id}
                  </span>
                ) : (
                  <>
                    <strong>{c.name ?? c.id}</strong>
                    {c.cardType ? (
                      <span style={{ marginTop: 6, opacity: 0.7 }}>
                        {c.cardType}
                      </span>
                    ) : null}
                  </>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
