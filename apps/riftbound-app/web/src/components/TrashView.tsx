/**
 * TrashView — clickable trash pile + modal listing the contents.
 *
 * Admin feedback 2026-05-14: the trash zone was previously rendered as
 * a count-only pill inside the resource bar, which the admin called out
 * as a visibility regression vs RiftAtlas ("cosmetically also sucks, like
 * you can't see trash"). RiftAtlas surfaces every player's trash as a
 * tangible pile of card backs with a count badge — and lets you click
 * it to inspect the contents.
 *
 * This component wraps the existing `DeckPile` (variant="trash") in a
 * button that opens a modal with the actual card list. The pile keeps
 * the same `data-testid` shape (`trash-pile-{playerId}` / `-count`) so
 * existing tests keep passing. The modal lists each trash card as a
 * tile (image when available, name otherwise) and reuses the
 * `CardOverlay` long-hover preview for full-size inspection.
 *
 * Pure presentational — owner of the data filters by `owner === playerId`
 * before passing the slice in.
 *
 * Modal interactions:
 *   - Click backdrop → close
 *   - Click "Close" button → close
 *   - ESC → close
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { type CardInfo, CardOverlay } from "./CardOverlay";
import { DeckPile } from "./DeckPile";

export interface TrashCard {
  readonly id: string;
  readonly definitionId: string;
  readonly owner: string;
  readonly cardType?: string;
  readonly name?: string;
  readonly imageUrl?: string;
}

interface TrashViewProps {
  readonly playerId: string;
  readonly size: number;
  /** Pre-filtered list (owner === playerId). */
  readonly cards: readonly TrashCard[];
  readonly isLocalPlayer?: boolean;
}

export function TrashView({
  playerId,
  size,
  cards,
  isLocalPlayer = false,
}: TrashViewProps) {
  const [open, setOpen] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => setOpen(false), []);

  // ESC closes the modal. Bound only while the modal is mounted.
  useEffect(() => {
    if (!open) {return;}
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === "Escape") {
        ev.stopPropagation();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    // Focus the close button for accessibility on open.
    closeBtnRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const label = isLocalPlayer ? "Your trash" : "Opponent trash";
  const empty = size === 0;

  return (
    <>
      <button
        type="button"
        className={`trash-pile-button${empty ? " trash-pile-button-empty" : ""}`}
        data-testid={`trash-pile-button-${playerId}`}
        data-player-id={playerId}
        data-size={size}
        onClick={() => setOpen(true)}
        aria-label={`${label} (${size} cards) — click to view`}
        title={
          empty
            ? `${label} is empty`
            : `${label} (${size} cards) — click to view`
        }
      >
        <DeckPile
          size={size}
          label="trash"
          variant="trash"
          testId={`trash-pile-${playerId}`}
          zoneId={`${playerId}-trash`}
        />
      </button>
      {open ? (
        <div
          className="trash-modal"
          data-testid={`trash-modal-${playerId}`}
          role="dialog"
          aria-modal="true"
          aria-label={`${label} contents`}
          onClick={(ev) => {
            // Backdrop click closes; clicks inside the panel are stopped.
            if (ev.target === ev.currentTarget) {close();}
          }}
        >
          <div
            className="trash-modal-content"
            data-testid={`trash-modal-content-${playerId}`}
          >
            <div className="trash-modal-header">
              <h3 className="trash-modal-title">
                {label} — {cards.length} card{cards.length === 1 ? "" : "s"}
              </h3>
              <button
                ref={closeBtnRef}
                type="button"
                className="trash-modal-close"
                data-testid={`trash-modal-close-${playerId}`}
                onClick={close}
                aria-label="Close trash view"
                title="Close (Esc)"
              >
                ×
              </button>
            </div>
            {cards.length === 0 ? (
              <p
                className="trash-modal-empty"
                data-testid={`trash-modal-empty-${playerId}`}
              >
                (no cards in trash)
              </p>
            ) : (
              <ul
                className="trash-modal-list"
                data-testid={`trash-modal-list-${playerId}`}
              >
                {cards.map((c) => {
                  const info: CardInfo = {
                    cardId: c.id,
                    cardType: c.cardType,
                    definitionId: c.definitionId,
                    imageUrl: c.imageUrl,
                    name: c.name,
                  };
                  return (
                    <li
                      key={c.id}
                      className="trash-modal-item"
                      data-testid={`trash-modal-item-${c.id}`}
                      data-card-id={c.id}
                    >
                      <CardOverlay
                        cardInfo={info}
                        testIdPrefix={`trash-${playerId}`}
                        expandOnLongHover
                      >
                        <div
                          className={`trash-modal-card${c.imageUrl ? " trash-modal-card-art" : ""}`}
                        >
                          {c.imageUrl ? (
                            <img
                              src={c.imageUrl}
                              alt={c.name ?? c.definitionId}
                              loading="lazy"
                              className="trash-modal-card-image"
                            />
                          ) : (
                            <span className="trash-modal-card-name">
                              {c.name ?? c.definitionId}
                            </span>
                          )}
                        </div>
                      </CardOverlay>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
