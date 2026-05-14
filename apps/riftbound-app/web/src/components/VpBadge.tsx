/**
 * VpBadge (Phase B batch 27 iter-3, gap C).
 *
 * Prominent VP counter — RiftAtlas-parity. Replaces the tiny "VP: 0 / 8"
 * stat-row line with a large circular badge showing "current/target". The
 * badge fills (gold ring) as the player approaches victory, providing a
 * visual progress indicator.
 *
 * Props:
 *   - current: player's current VP.
 *   - target: VPs needed to win (view.victoryScore).
 *   - testId: stable data-testid.
 */

interface VpBadgeProps {
  readonly current: number;
  readonly target: number;
  readonly testId?: string;
}

export function VpBadge({ current, target, testId }: VpBadgeProps) {
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const isWinner = current >= target;
  // Conic-gradient ring fills clockwise based on VP progress.
  const ring = `conic-gradient(#d4af3c 0% ${pct}%, rgba(120, 130, 160, 0.25) ${pct}% 100%)`;
  return (
    <div
      className={`vp-badge${isWinner ? " vp-badge-won" : ""}`}
      data-testid={testId}
      data-current={current}
      data-target={target}
      title={`${current} / ${target} VP`}
      role="img"
      aria-label={`${current} of ${target} victory points`}
      style={{ background: ring }}
    >
      <span className="vp-badge-inner">
        <span className="vp-badge-current">{current}</span>
        <span className="vp-badge-sep">/</span>
        <span className="vp-badge-target">{target}</span>
        <span className="vp-badge-label">VP</span>
      </span>
    </div>
  );
}
