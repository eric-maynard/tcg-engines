/**
 * TurnBanner — top-of-right-rail header surfacing turn/phase/active player.
 *
 * iter-9 gap 2: replaces the plain text "Turn N — Phase / Active: X" that
 * sat at the top of the page with a styled banner in the right rail. The
 * banner shows:
 *   - Big "Turn N" with the active player's gold avatar inline.
 *   - Active player's id label.
 *   - Phase label (e.g. "Main").
 *   - Status pill ("playing" / "finished" / etc).
 *   - Optional winner line when the game is over.
 *
 * Pure render component — no engine wiring, no state. Visual hint only.
 */

interface TurnBannerProps {
  readonly turnNumber: number;
  readonly phaseLabel: string;
  readonly activePlayerId: string;
  readonly status: string;
  readonly winner: string | null;
  /** When provided, maps player-1/player-2 to "You"/"Opponent". */
  readonly localPlayerId?: string;
}

/**
 * Maps a raw engine player id to a human-readable label.
 * Returns "You" if the id matches localPlayerId, "Opponent" otherwise.
 * Falls back to the raw id when localPlayerId is not provided.
 */
function playerLabel(playerId: string, localPlayerId: string | undefined): string {
  if (!localPlayerId) {return playerId;}
  return playerId === localPlayerId ? "You" : "Opponent";
}

/**
 * Pluck the last digit of a player id ("player-1" -> "1"). Mirrors the
 * avatar derivation in PlayerPanel so the banner avatar matches the seat.
 * Data-driven (no per-player ifs) — works for any "player-N" or even
 * arbitrary ids by falling back to the last character.
 */
function avatarGlyph(playerId: string): string {
  const m = playerId.match(/\d+/);
  if (m && m[0]) {
    return m[0].slice(-1);
  }
  return (playerId.slice(-1) || "?").toString();
}

export function TurnBanner({
  turnNumber,
  phaseLabel,
  activePlayerId,
  status,
  winner,
  localPlayerId,
}: TurnBannerProps) {
  const isFinished = Boolean(winner);
  return (
    <section className="turn-banner" data-testid="turn-banner">
      <div className="turn-banner-top">
        <span className="turn-banner-turn" data-testid="turn-banner-turn">
          Turn {turnNumber}
        </span>
        <span
          className={`turn-banner-status turn-banner-status-${isFinished ? "finished" : status.toLowerCase()}`}
          data-testid="turn-banner-status"
        >
          {isFinished ? "finished" : status}
        </span>
      </div>
      <div className="turn-banner-active">
        <span
          className="turn-banner-avatar"
          data-testid="turn-banner-avatar"
          aria-hidden="true"
        >
          {avatarGlyph(activePlayerId)}
        </span>
        <span
          className="turn-banner-active-name"
          data-testid="turn-banner-active-name"
        >
          {playerLabel(activePlayerId, localPlayerId)}
        </span>
        <span className="turn-banner-phase" data-testid="turn-banner-phase">
          {phaseLabel}
        </span>
      </div>
      {winner ? (
        <div className="turn-banner-winner" data-testid="turn-banner-winner">
          Winner: <strong>{winner}</strong>
        </div>
      ) : null}
    </section>
  );
}
