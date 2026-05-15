import type { CSSProperties } from "react";
import type { GameViewPlayer, HandCard } from "../lib/api";
import { type CardInfo, CardOverlay } from "./CardOverlay";
import { DeckPile } from "./DeckPile";
import { PowerGlyphs } from "./PowerGlyphs";
import { type TrashCard, TrashView } from "./TrashView";
import { VpBadge } from "./VpBadge";

/**
 * Iter-9 gap 3: decide whether a hand chip is affordable RIGHT NOW given
 * the player's current energy + power pool. Pure helper, data-driven
 * (no per-card ifs — same logic applies to every card via its declared
 * costs). Returns `true` when the player has enough energy AND has at
 * least one matching power glyph for every entry in `powerCost`.
 *
 * Power-cost semantics: each string in `powerCost` represents one
 * required power glyph (e.g. ["Body", "Mind"] = 1 Body + 1 Mind). We
 * tally the requirements and check against `player.power` (a
 * Record<string, number>). Missing keys in `player.power` count as 0.
 *
 * If a card has neither field set (legacy / synthetic decks), we assume
 * it's affordable so we don't over-suppress UI affordance.
 */
export function canAfford(
  card: { energyCost?: number; powerCost?: readonly string[] },
  player: { energy: number; power: Record<string, number> },
): boolean {
  const energyNeeded = card.energyCost ?? 0;
  if (energyNeeded > player.energy) {
    return false;
  }
  const need: Record<string, number> = {};
  for (const p of card.powerCost ?? []) {
    need[p] = (need[p] ?? 0) + 1;
  }
  for (const [key, count] of Object.entries(need)) {
    if ((player.power[key] ?? 0) < count) {
      return false;
    }
  }
  return true;
}

/**
 * Pluck whatever per-card fields the API actually provides into the
 * overlay's `CardInfo`. The cast-shaped widening lets us pick up
 * `name` / `rulesText` / etc IF a future server-side change starts
 * including them, without needing a round-trip through `lib/api.ts`
 * (which lives in OO's lane). Until batch 21 wires those fields
 * through, the overlay shows definitionId + a "rules text not yet
 * available" stub.
 */
function handCardToInfo(card: HandCard): CardInfo {
  const loose = card as HandCard & {
    name?: string;
    cardType?: string;
    might?: number;
    energyCost?: number;
    powerCost?: readonly string[];
    rulesText?: string;
    abilities?: readonly string[];
    imageUrl?: string;
  };
  return {
    abilities: loose.abilities,
    cardId: card.id,
    cardType: loose.cardType,
    definitionId: card.definitionId,
    energyCost: loose.energyCost,
    imageUrl: loose.imageUrl,
    might: loose.might,
    name: loose.name,
    powerCost: loose.powerCost,
    rulesText: loose.rulesText,
  };
}

interface PlayerPanelProps {
  readonly player: GameViewPlayer;
  readonly isActive: boolean;
  readonly victoryScore: number;
  readonly hand: readonly HandCard[];
  /** Called with the full HandCard so the parent can inspect legalLocations. */
  readonly onPlayCard: (card: HandCard) => void;
  readonly canPlay: boolean;
  /**
   * When false, render each hand chip as a generic face-down card-back so
   * opponents cannot see the actual card art. Defaults to true (legacy
   * behavior). PlayPage sets this to `player.id === localPlayerId` so only
   * the local player sees their own hand.
   */
  readonly revealHand?: boolean;
  /**
   * Iter-11 gap 3: id of the hand card currently "selected" (i.e. a picker
   * is open for it). The chip stays gold-bordered + lifted until the
   * picker closes. Pure data-driven — PlayPage owns the selection state.
   */
  readonly selectedCardId?: string | null;
  /**
   * Iter-H: when true, render the player name as "You"; otherwise "Opponent".
   * Replaces raw player.id strings in the header row.
   */
  readonly isLocalPlayer?: boolean;
  /**
   * Iter-N: when the engine has a `pendingChoice` reveal-hand active and
   * this player is the `revealer`, hand chips become click-targets for the
   * prompter to resolve the choice. The PlayerPanel needs:
   *   - `pendingChoice` to know which cards (by id + filter) are pickable.
   *   - `onPickRevealedCard(cardId)` to forward the click to PlayPage,
   *     which dispatches `resolvePendingChoice`.
   * Cards that fail the filter (e.g. unit when `excludedCardTypes`
   * contains "unit") are visually dimmed and not clickable. Both props
   * are optional and default to inert behavior so unrelated panels are
   * unaffected.
   */
  readonly pendingChoice?:
    | {
        readonly type: "reveal-and-pick";
        readonly prompter: string;
        readonly revealer: string;
        readonly revealed: readonly string[];
        readonly onPicked: "recycle" | "banish" | "discard";
        readonly excludedCardTypes?: readonly string[];
      }
    | {
        // Look-and-pick is rendered by a dedicated modal in PlayPage, not
        // The hand-chip pickable affordance — the PlayerPanel accepts the
        // Union for type compatibility but treats this variant as inert.
        readonly type: "look-and-pick";
        readonly prompter: string;
        readonly revealer: string;
        readonly revealed: readonly string[];
        readonly onPicked: "to-hand" | "to-trash" | "to-play" | "banish" | "recycle";
        readonly onUnpicked: "recycle" | "to-top" | "trash";
        readonly revealedCards?: readonly {
          readonly id: string;
          readonly definitionId: string;
          readonly name?: string;
          readonly imageUrl?: string;
          readonly cardType?: string;
        }[];
      };
  readonly onPickRevealedCard?: (cardId: string) => void;
  /**
   * Admin feedback 2026-05-14 — RiftAtlas parity: trash zone must be
   * visible as a tangible pile that opens a modal when clicked. The
   * parent (PlayPage) is the source of truth for `view.cardsInTrash`
   * and pre-filters by owner before handing the slice in. Defaults to
   * `[]` so older callers / tests work unchanged (the modal then opens
   * with an "(no cards in trash)" empty state).
   */
  readonly cardsInTrash?: readonly TrashCard[];
}

export function PlayerPanel({
  player,
  isActive,
  victoryScore,
  hand,
  onPlayCard,
  canPlay,
  revealHand = true,
  selectedCardId = null,
  isLocalPlayer = false,
  pendingChoice,
  onPickRevealedCard,
  cardsInTrash = [],
}: PlayerPanelProps) {
  const displayName = isLocalPlayer ? "You" : "Opponent";
  // Iter-N: when this panel's player is the `revealer` of a pendingChoice,
  // We render the hand chips face-up AND turn each one into a pick target
  // (or a dimmed non-pick if its card type is in `excludedCardTypes`).
  // The picker pipeline reuses the existing `hand-revealed` parent class
  // So styling can attach via `.hand-revealed .hand-chip[data-pickable=...]`.
  // `look-and-pick` choices are surfaced by a dedicated modal (LookPicker)
  // In PlayPage, not by the in-panel hand-reveal affordance. We only
  // Activate the reveal/pick rendering for the `reveal-and-pick` variant.
  const revealAndPickChoice =
    pendingChoice && pendingChoice.type === "reveal-and-pick" ? pendingChoice : undefined;
  const isRevealerPanel =
    Boolean(revealAndPickChoice) && revealAndPickChoice?.revealer === player.id;
  const excludedSet = new Set(revealAndPickChoice?.excludedCardTypes ?? []);
  const canPickFromHand = isRevealerPanel && Boolean(onPickRevealedCard);
  const isPickable = (c: HandCard): boolean => {
    if (!canPickFromHand) {return false;}
    if (revealAndPickChoice?.revealed && !revealAndPickChoice.revealed.includes(c.id)) {
      return false;
    }
    const t = (c.cardType ?? "").toLowerCase();
    if (t && excludedSet.has(t)) {return false;}
    return true;
  };
  return (
    <div
      className={`player ${isActive ? "player-active" : ""}`}
      data-testid={`player-${player.id}`}
    >
      <div className="player-header">
        <h3>
          <span
            className={`player-avatar${isActive ? " player-avatar-active" : ""}`}
            data-testid={`player-avatar-${player.id}`}
            data-active={isActive ? "true" : "false"}
            aria-hidden="true"
          >
            {(player.id.match(/\d+/)?.[0] ?? player.id.slice(-1) ?? "?")
              .toString()
              .slice(-1)}
          </span>
          <span className="player-id-label">{displayName}</span>
          {isActive ? (
            <span
              className="player-active-marker"
              data-testid={`turn-marker-${player.id}`}
              aria-label="active turn"
              title="active turn"
            >
              <small>(active)</small>
            </span>
          ) : null}
        </h3>
        <VpBadge
          current={player.victoryPoints}
          target={victoryScore}
          testId={`vp-badge-${player.id}`}
        />
      </div>
      <div className="player-resources">
        <PowerGlyphs
          energy={player.energy}
          power={player.power}
          active={isActive}
          testId={`power-glyphs-${player.id}`}
        />
        <div className="player-piles">
          <DeckPile
            size={player.deckSize}
            label="deck"
            variant="deck"
            testId={`deck-pile-${player.id}`}
            zoneId={`${player.id}-deck`}
          />
          <DeckPile
            size={player.runeDeckSize}
            label="runes"
            variant="rune"
            testId={`rune-pile-${player.id}`}
            zoneId={`${player.id}-runes`}
          />
          <TrashView
            playerId={player.id}
            size={player.trashSize}
            cards={cardsInTrash}
            isLocalPlayer={isLocalPlayer}
          />
        </div>
      </div>
      <ul className="player-stats player-stats-compact">
        <li>
          <strong>Hand:</strong> {player.handSize}
        </li>
        <li>
          <strong>XP:</strong>{" "}
          <span className="player-xp-badge">{player.xp}</span>
        </li>
      </ul>
      <div
        className={`hand${isRevealerPanel ? " hand-revealed" : ""}`}
        data-testid={`hand-${player.id}`}
        data-reveal={revealHand ? "true" : "false"}
        data-revealer={isRevealerPanel ? "true" : "false"}
      >
        {hand.length === 0 ? (
          <p className="hand-empty">(hand empty)</p>
        ) : (revealHand ? (
          hand.map((c) => {
            const locs = c.legalLocations ?? [];
            const hasChoice = locs.length > 1
              || (locs.length === 1 && locs[0] !== "base");
            // Iter-8 gap 3: a card is "playable right now" when the seat
            // Can play (canPlay) AND the engine reports at least one legal
            // Location. We surface this as a data attribute + class so CSS
            // Can pulse the chip — pure visual hint, no logic change.
            const isPlayable = canPlay && locs.length > 0;
            // Iter-9 gap 3: an "unaffordable" chip is one where the player
            // Doesn't currently have enough energy/power to pay the cost.
            // We compute this even when canPlay=false so the dimming reads
            // As a stable "you can't afford this" signal vs the transient
            // "not your turn" disable. Pure data-driven (canAfford helper).
            const affordable = canAfford(c, {
              energy: player.energy,
              power: player.power,
            });
            const showUnaffordable = !affordable;
            const isSelected = selectedCardId === c.id;
            // Iter-N: in revealer-pick mode, the chip's affordance is
            // "click to pick" not "click to play". Pickability is driven
            // By `pendingChoice.filter` (e.g. exclude units for Sabotage).
            const pickable = isPickable(c);
            const isRevealerChip = isRevealerPanel;
            const chipDisabled = isRevealerChip
              ? !pickable
              : !canPlay || isSelected;
            const chipOnClick = isRevealerChip
              ? (pickable
                ? () => onPickRevealedCard?.(c.id)
                : undefined)
              : () => onPlayCard(c);
            return (
              <CardOverlay
                key={c.id}
                cardInfo={handCardToInfo(c)}
                testIdPrefix={`hand-${player.id}`}
                expandOnLongHover
              >
                <button
                  className={`hand-chip${c.imageUrl ? " hand-chip-art" : ""}${isPlayable ? " hand-chip-playable" : ""}${showUnaffordable ? " hand-chip-unaffordable" : ""}${isSelected ? " hand-chip-selected" : ""}${isRevealerChip && pickable ? " hand-chip-pickable" : ""}${isRevealerChip && !pickable ? " hand-chip-unpickable" : ""}`}
                  data-testid={`hand-chip-${c.id}`}
                  data-card-id={c.id}
                  data-has-choice={hasChoice ? "true" : "false"}
                  data-has-image={c.imageUrl ? "true" : "false"}
                  data-playable={isPlayable ? "true" : "false"}
                  data-affordable={affordable ? "true" : "false"}
                  data-selected={isSelected ? "true" : "false"}
                  data-pickable={
                    isRevealerChip ? (pickable ? "true" : "false") : undefined
                  }
                  /* Iter-M: --card-img drives the CSS-only hover-zoom
                   * preview (::after on .hand-chip:hover). When the card
                   * has no image, leave it unset so the preview hides. */
                  style={
                    c.imageUrl
                      ? ({ "--card-img": `url(${c.imageUrl})` } as CSSProperties)
                      : undefined
                  }
                  disabled={chipDisabled}
                  onClick={chipOnClick}
                  title={
                    isRevealerChip
                      ? (pickable
                        ? `Pick ${c.name ?? c.definitionId} — ${revealAndPickChoice?.onPicked ?? "resolve"}`
                        : `${c.name ?? c.definitionId} — not a legal pick (${c.cardType ?? "card"})`)
                      : (locs.length > 0
                        ? `${c.name ?? c.definitionId} — legal: ${locs.join(", ")}${showUnaffordable ? " (unaffordable)" : ""}`
                        : `${c.name ?? c.definitionId}${showUnaffordable ? " (unaffordable)" : ""}`)
                  }
                >
                  {c.imageUrl ? (
                    <img
                      className="hand-chip-image"
                      data-testid={`hand-chip-image-${c.id}`}
                      src={c.imageUrl}
                      alt={c.name ?? c.definitionId}
                      loading="lazy"
                    />
                  ) : (
                    // Image-less fallback: keep the name visible so the
                    // Player can still tell the cards apart. The card art
                    // Itself already shows cost + might, so the badges
                    // Are redundant when imageUrl is present.
                    <span className="hand-chip-name hand-chip-name-fallback">
                      {c.name ?? c.definitionId}
                    </span>
                  )}
                  {/* Iter-10 gap 4: subtle hover name banner at the bottom
                      of art chips. Hidden when not hovering (keeps the
                      clean art-only look); slides up + fades in on hover
                      so the player can skim names quickly. */}
                  {c.imageUrl ? (
                    <span
                      className="hand-chip-name-banner"
                      data-testid={`hand-chip-name-banner-${c.id}`}
                      aria-hidden="true"
                    >
                      {c.name ?? c.definitionId}
                    </span>
                  ) : null}
                  {showUnaffordable ? (
                    <span
                      className="hand-chip-unaffordable-badge"
                      data-testid={`hand-chip-unaffordable-${c.id}`}
                      aria-label="cannot afford"
                      title="You can't afford this card right now"
                    >
                      ✗
                    </span>
                  ) : null}
                </button>
              </CardOverlay>
            );
          })
        ) : (
          // Face-down hand: opponent hand chips are rendered as generic
          // Card-backs (CSS-only — no per-card art / name / cost leaks).
          // The button stays disabled because the local player can never
          // Play out of the opponent's hand.
          //
          // Iter-19 Gap 1: opponent face-down chips share the same fan
          // Overlap as the local hand (centered + overlap via parent .hand
          // CSS) but render in compact 60×84 form via the
          // `.hand-chip-back-compact` modifier — keeping geometry symmetric
          // With the local hand while preserving the face-down disguise.
          // Pure CSS modifier — no per-card branching here.
          //
          // Iter-K: drive chip count from player.handSize (server-reported)
          // When the hand array is empty. In production, the server never
          // Sends actual opponent hand cards, so hand[opponent.id] === [].
          // Player.handSize carries the real count. We fall back to index-
          // Keyed placeholder buttons for those extra chips. When the hand
          // Array HAS entries (unit tests pass real cards for identity
          // Assertions), we use the array directly for backward compat.
          //
          // ChipCount = max(hand.length, player.handSize) so whichever is
          // Larger wins. In tests hand.length === chipCount === player.handSize;
          // In production hand.length === 0 so player.handSize drives it.
          <>
            {(() => {
              const chipCount = Math.max(hand.length, player.handSize);
              return (
                <>
                  {chipCount > 0 ? (
                    <span
                      className="hand-back-count-label"
                      data-testid={`hand-back-count-${player.id}`}
                      aria-label={`opponent hand: ${chipCount} cards`}
                    >
                      {chipCount} cards
                    </span>
                  ) : null}
                  {Array.from({ length: chipCount }).map((_, i) => {
                    const card = hand[i];
                    return (
                      <button
                        key={card ? card.id : i}
                        type="button"
                        className="hand-chip hand-chip-back hand-chip-back-compact"
                        data-testid={card ? `hand-chip-${card.id}` : `hand-chip-back-${player.id}-${i}`}
                        data-has-image="false"
                        data-face-down="true"
                        data-compact="true"
                        disabled
                        aria-label="opponent card"
                        title="opponent card (face-down)"
                      >
                        <span className="hand-chip-back-art" aria-hidden="true" />
                      </button>
                    );
                  })}
                </>
              );
            })()}
          </>
        ))}
      </div>
    </div>
  );
}
