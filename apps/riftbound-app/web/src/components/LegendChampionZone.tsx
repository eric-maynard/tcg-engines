/**
 * LegendChampionZone — renders a player's Legend slot + Champion slot side by
 * side. Iter-LegendChampion (admin priority 2026-05-15): the prior PlayPage
 * had no visible representation for either zone, so the player literally
 * could not see whose Champion Legend (or Chosen Champion) was in play.
 *
 * Visual: two fixed-size landscape slots (~120×170) with card art when
 * available, falling back to a name + (LEGEND / CHAMPION) tag. Renders an
 * empty dashed placeholder when the engine view has no card in the zone
 * (synthetic decks, pre-setup state, etc.) so the zone itself is always
 * visible — never collapses to zero height.
 *
 * Data shape: takes the per-zone card (or `null`) directly from
 * `view.players[].legend` / `view.players[].champion`. No registry lookups
 * in the component — `buildView` does the enrichment.
 */

import type { BattlefieldUnit } from "../lib/api";

interface LegendChampionZoneProps {
  readonly playerId: string;
  readonly legend: BattlefieldUnit | null;
  readonly champion: BattlefieldUnit | null;
  /** Owner-side label for the section header (e.g. "Opponent" / "You"). */
  readonly side: "self" | "opponent";
}

function ZoneSlot({
  playerId,
  card,
  slotKind,
}: {
  readonly playerId: string;
  readonly card: BattlefieldUnit | null;
  readonly slotKind: "legend" | "champion";
}) {
  const isEmpty = card === null;
  const label = card?.name ?? card?.definitionId ?? "(empty)";
  const tag = slotKind === "legend" ? "LEGEND" : "CHAMPION";
  return (
    <div
      className={`lc-slot lc-slot-${slotKind}${isEmpty ? " lc-slot-empty" : ""}`}
      data-testid={`lc-slot-${slotKind}-${playerId}`}
      data-zone-id={`${playerId}-${slotKind}`}
      data-empty={isEmpty ? "true" : "false"}
      {...(card?.id ? { "data-card-id": card.id } : {})}
    >
      <span className="lc-slot-tag" data-testid={`lc-slot-tag-${slotKind}-${playerId}`}>
        {tag}
      </span>
      {isEmpty ? (
        <span className="lc-slot-placeholder" data-testid={`lc-slot-placeholder-${slotKind}-${playerId}`}>
          (empty)
        </span>
      ) : (
        <>
          {card?.imageUrl ? (
            <img
              className="lc-slot-image"
              data-testid={`lc-slot-image-${slotKind}-${playerId}`}
              src={card.imageUrl}
              alt={label}
              loading="lazy"
            />
          ) : null}
          <span className="lc-slot-name" data-testid={`lc-slot-name-${slotKind}-${playerId}`}>
            {label}
          </span>
          {card?.might !== undefined ? (
            <span className="lc-slot-might" data-testid={`lc-slot-might-${slotKind}-${playerId}`}>
              {card.might}
            </span>
          ) : null}
        </>
      )}
    </div>
  );
}

export function LegendChampionZone({
  playerId,
  legend,
  champion,
  side,
}: LegendChampionZoneProps) {
  return (
    <section
      className={`lc-zone lc-zone-${side}`}
      data-testid={`lc-zone-${playerId}`}
      data-player-id={playerId}
    >
      <ZoneSlot playerId={playerId} card={legend} slotKind="legend" />
      <ZoneSlot playerId={playerId} card={champion} slotKind="champion" />
    </section>
  );
}
