/**
 * BaseZone — renders a player's "base" zone (units played to base, not yet
 * deployed to a battlefield). Phase B batch 23 XX (WW#1 fix).
 *
 * Visual: a thin strip under the player's battlefield row showing units as
 * compact chips with their card name + might. Mirrors the RiftAtlas-style
 * dedicated base region below each player's side of the table — without
 * this, units played to base literally disappear from view.
 *
 * Data shape: the engine's GameView does NOT currently expose base-zone
 * units (only `battlefields[].units`). Until YY threads base-zone contents
 * through `/api/v2/state`, this component falls back to a "(empty)" state
 * even when units are present in the engine — see report blocker.
 *
 * The component is defensive: if a caller IS able to wire base units
 * through (e.g. via an extended `GameViewPlayer` shape), it will render
 * them with card-name + might so the player can see their base contents.
 */

import type { BattlefieldUnit } from "../lib/api";

interface BaseZoneProps {
  readonly playerId: string;
  /** Units currently in this player's base zone. Empty array = nothing in base. */
  readonly units: readonly BattlefieldUnit[];
  /** Owner-side label, used for header text + test ids. */
  readonly label?: string;
}

export function BaseZone({ playerId, units, label }: BaseZoneProps) {
  const headerLabel = label ?? `${playerId} base`;
  return (
    <section
      className="base-zone"
      data-testid={`base-zone-${playerId}`}
      data-base-empty={units.length === 0 ? "true" : "false"}
      data-zone-id={`${playerId}-base`}
    >
      <header className="base-zone-header">
        <span className="base-zone-label">{headerLabel}</span>
        <span className="base-zone-count">{units.length}</span>
      </header>
      {units.length === 0 ? (
        <p
          className="base-zone-empty"
          data-testid={`base-zone-${playerId}-empty`}
        >
          (empty)
        </p>
      ) : (
        <ul className="base-zone-units">
          {units.map((u) => {
            const label = u.name ?? u.definitionId ?? u.id;
            return (
              <li
                key={u.id}
                className={`base-zone-unit${u.imageUrl ? " base-zone-unit-art" : ""}${u.exhausted ? " base-zone-unit-exhausted" : ""}`}
                data-testid={`base-zone-unit-${u.id}`}
                data-card-id={u.id}
                data-has-image={u.imageUrl ? "true" : "false"}
                data-exhausted={u.exhausted ? "true" : "false"}
              >
                {u.imageUrl ? (
                  <img
                    className="base-zone-unit-image"
                    data-testid={`base-zone-unit-image-${u.id}`}
                    src={u.imageUrl}
                    alt={u.name ?? u.definitionId}
                    loading="lazy"
                  />
                ) : null}
                <span className="base-zone-unit-name">{label}</span>
                {u.might !== undefined ? (
                  <span className="base-zone-unit-might">{u.might}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
