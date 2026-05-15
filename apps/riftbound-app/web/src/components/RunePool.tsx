import type { GameView } from "../lib/api";

/**
 * Iter-RunePoolUI — Rune Pool component.
 *
 * Renders each rune in a player's runePool as an individual clickable chip.
 * Players need to SEE each rune (not just a count pill) and CLICK to tap
 * (exhaust) it to pay costs — same TCG visual convention as units.
 *
 * Chip layout:
 *   - 26×34px, domain-colored background, 1-letter domain glyph.
 *   - Exhausted runes rotate 90° (CSS `transform: rotate(90deg)`) + dim.
 *   - Clicking a friendly ready rune dispatches `exhaustRune` move.
 *   - Clicking an exhausted rune is a no-op.
 *   - Opponent chips are display-only (`cursor: default`).
 *
 * Pure presentational — PlayPage owns the click handler that POSTs the move.
 */

/** Rune entry shape — mirrors GameView["runesInPool"][number]. */
export type RunePoolItem = NonNullable<GameView["runesInPool"]>[number];

interface RunePoolProps {
  readonly runes: readonly RunePoolItem[];
  readonly playerId: string;
  /**
   * Whether this rune pool belongs to the local seat. When false, chips are
   * read-only (opponent's runes). Drives `cursor: default` + no click handler.
   */
  readonly isLocalPlayer: boolean;
  /**
   * Click handler — called only for friendly, ready chips. Wired by PlayPage
   * to `runMove("exhaustRune", { playerId, runeId }, playerId)`.
   */
  readonly onExhaust?: (runeId: string) => void;
  /** Optional label override (defaults to "Runes" / "Opponent Runes"). */
  readonly label?: string;
}

/**
 * One-letter glyph per domain. Lowercase comparison — the engine view layer
 * normalises to lowercase before passing through. Falls back to "?" for
 * unknown domains so something always renders.
 */
const DOMAIN_GLYPH: Readonly<Record<string, string>> = {
  body: "B",
  mind: "M",
  chaos: "C",
  calm: "S", // S for Serene/Stillness — distinguishes from Chaos
  fury: "F",
  order: "O",
};

export function RunePool({
  runes,
  playerId,
  isLocalPlayer,
  onExhaust,
  label,
}: RunePoolProps) {
  // Filter to this player's runes (the view-level list is flat, owner-tagged).
  const mine = runes.filter((r) => r.owner === playerId);
  const readyCount = mine.filter((r) => !r.exhausted).length;
  const totalCount = mine.length;
  const labelText = label ?? (isLocalPlayer ? "Runes" : "Opponent Runes");
  return (
    <div
      className={`rune-pool${isLocalPlayer ? " rune-pool-self" : " rune-pool-opponent"}`}
      data-testid={`rune-pool-${playerId}`}
      data-player-id={playerId}
      data-rune-count={totalCount}
      data-ready-count={readyCount}
    >
      <span className="rune-pool-label" aria-hidden="true">
        {labelText} {readyCount}/{totalCount}
      </span>
      {mine.map((rune) => {
        const domain = (rune.domain ?? "").toLowerCase();
        const glyph = DOMAIN_GLYPH[domain] ?? "?";
        const isExhausted = Boolean(rune.exhausted);
        const isClickable = isLocalPlayer && !isExhausted && Boolean(onExhaust);
        const classes = [
          "rune-chip",
          domain ? `rune-chip-${domain}` : "rune-chip-unknown",
          isExhausted ? "rune-chip-exhausted" : "",
          isLocalPlayer ? "" : "rune-chip-opponent",
        ]
          .filter(Boolean)
          .join(" ");
        const title = isClickable
          ? `Tap ${rune.name ?? domain} rune to pay a cost`
          : (isExhausted
            ? `${rune.name ?? domain} rune (exhausted)`
            : `${rune.name ?? domain} rune`);
        return (
          <button
            key={rune.id}
            type="button"
            className={classes}
            data-testid={`rune-chip-${rune.id}`}
            data-card-id={rune.id}
            data-rune-id={rune.id}
            data-domain={domain || "unknown"}
            data-exhausted={isExhausted ? "true" : "false"}
            data-owner={rune.owner}
            disabled={!isClickable}
            aria-label={title}
            title={title}
            onClick={isClickable ? () => onExhaust?.(rune.id) : undefined}
          >
            <span className="rune-chip-glyph" aria-hidden="true">
              {glyph}
            </span>
          </button>
        );
      })}
      {mine.length === 0 ? (
        <span className="rune-pool-empty" data-testid={`rune-pool-empty-${playerId}`}>
          (no runes)
        </span>
      ) : null}
    </div>
  );
}
