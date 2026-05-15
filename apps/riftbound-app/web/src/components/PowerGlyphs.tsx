/**
 * PowerGlyphs (Phase B batch 27 iter-3, gap B; iter-20 visual upgrade).
 *
 * Renders a player's `power` resource map as color-keyed circular "gems"
 * with a count overlay, instead of debug-style colored squares. RiftAtlas
 * parity: each power color is a gem with the count rendered prominently
 * in the center, dimmed when zero, plus a small first-letter glyph for
 * color-blind accessibility. A summary chip below the row gives an
 * at-a-glance "TOTAL: N energy + M power" tally.
 *
 * Color mapping is data-driven — looked up from POWER_COLORS by lowercased
 * power key. Unknown power types fall back to a neutral gray. The
 * "energy" pseudo-power is rendered first (gold ★) and is always present.
 *
 * NO per-card or per-power ifs — uses a single lookup map.
 */

/**
 * Canonical Riftbound power-color hex codes. Pulled from the official
 * card-frame palette (matches BF tile colored band on RiftAtlas).
 * Lowercase keys for case-insensitive lookup.
 */
const POWER_COLORS: Record<string, string> = {
  energy: "#d4af3c", // Gold (generic energy)
  body: "#c25060", // Red
  mind: "#5a8fdf", // Blue
  chaos: "#a55fc0", // Purple
  calm: "#4eaf78", // Green (a.k.a. cyan in some refs)
  fury: "#e08a3a", // Orange
  order: "#cfd5e0", // Silver/white
};

const NEUTRAL = "#6a7c92";

/**
 * Per-power center glyph. Energy uses a star; everything else falls
 * back to the first uppercased letter of the kind. Keeping this as a
 * single map (no ifs per kind) so adding a new power type is a one-line
 * change.
 */
const POWER_GLYPHS: Record<string, string> = {
  energy: "★", // ★
};

interface PowerGlyphsProps {
  /**
   * Energy pool (rendered first, gold). Always present in the API even
   * when 0, so we render it unconditionally.
   */
  readonly energy: number;
  /**
   * Sparse map of power-type → count (e.g. `{ body: 1, mind: 2 }`).
   * Keys typically come straight from the engine's power identifiers.
   */
  readonly power: Record<string, number>;
  /**
   * Iter-20: when true, the gem row gets a subtle pulse animation so the
   * active player's resources catch the eye. Pure CSS-modifier; safe to
   * omit.
   */
  readonly active?: boolean;
  readonly testId?: string;
}

export function PowerGlyphs({
  energy,
  power,
  active = false,
  testId,
}: PowerGlyphsProps) {
  // Sort power keys alphabetically so layout is stable across renders.
  const powerKeys = Object.keys(power)
    .filter((k) => power[k] !== undefined && power[k] !== null)
    .toSorted();

  const totalPower = powerKeys.reduce((sum, k) => sum + (power[k] ?? 0), 0);

  return (
    <div
      className={`power-glyphs${active ? " power-glyphs-active" : ""}`}
      data-testid={testId}
      data-active={active ? "true" : "false"}
      aria-label="resources"
    >
      <div className="power-glyph-row" role="list">
        <Glyph
          kind="energy"
          count={energy}
          color={POWER_COLORS.energy!}
          testId={testId ? `${testId}-energy` : undefined}
        />
        {powerKeys.map((k) => (
          <Glyph
            key={k}
            kind={k}
            count={power[k] ?? 0}
            color={POWER_COLORS[k.toLowerCase()] ?? NEUTRAL}
            testId={testId ? `${testId}-${k}` : undefined}
          />
        ))}
      </div>
      <div
        className="power-glyph-summary"
        data-testid={testId ? `${testId}-summary` : undefined}
        aria-label="resource summary"
      >
        <span className="power-glyph-summary-label">TOTAL</span>
        <span className="power-glyph-summary-value">
          {energy} energy + {totalPower} power
        </span>
      </div>
    </div>
  );
}

interface GlyphProps {
  readonly kind: string;
  readonly count: number;
  readonly color: string;
  readonly testId?: string;
}

function Glyph({ kind, count, color, testId }: GlyphProps) {
  const dim = count <= 0;
  const glyphChar = POWER_GLYPHS[kind.toLowerCase()] ?? kind[0]!.toUpperCase();
  const label = `${kind}: ${count}`;
  return (
    <span
      className={`power-glyph${dim ? " power-glyph-dim" : ""}`}
      data-testid={testId}
      data-kind={kind}
      data-count={count}
      data-dim={dim ? "true" : "false"}
      style={{ ["--gem-color" as string]: color }}
      title={label}
      aria-label={label}
      role="listitem"
    >
      <span className="power-glyph-gem" aria-hidden="true" />
      <span className="power-glyph-mark" aria-hidden="true">
        {glyphChar}
      </span>
      <span className="power-glyph-count">{count}</span>
    </span>
  );
}
