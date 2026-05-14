import { useEffect, useRef, useState } from "react";
import type { GameViewBattlefield, HandCard, TrailStep } from "../lib/api";
import { phaseLabel } from "../lib/phase-names";

interface MoveLogProps {
  readonly trail: readonly TrailStep[];
  /**
   * Optional lookup table of cardId → human-readable name. The PlayPage
   * builds this by walking hand + battlefield units, so log entries can
   * say "swift scout" instead of "player-1-main-0-ogn-003-298". WW#5 fix.
   */
  readonly cardNames?: Record<string, string>;
}

/**
 * Map a moveId to a small visual category for the log dot. Keeps the
 * mapping data-driven (no per-card ifs — purely string-prefix lookup
 * over the move-id) so new moves get a default category automatically.
 *
 * iter-6 gap 4: the right-rail move log was a wall of text. A colored
 * dot per move-type gives the eye anchors to scan by move kind
 * (play / attack / end-turn / etc.) without parsing each line.
 */
function categorizeMove(moveId: string): {
  readonly category: string;
  readonly symbol: string;
} {
  const id = moveId.toLowerCase();
  if (id.startsWith("play")) {
    return { category: "play", symbol: "+" };
  }
  if (id.includes("attack")) {
    return { category: "attack", symbol: "!" };
  }
  if (id.includes("defend")) {
    return { category: "defend", symbol: "#" };
  }
  if (id.startsWith("resolve") || id.includes("combat")) {
    return { category: "combat", symbol: "x" };
  }
  if (id.startsWith("endturn") || id === "end-turn") {
    return { category: "end-turn", symbol: ">" };
  }
  if (id.startsWith("pass")) {
    return { category: "pass", symbol: "-" };
  }
  if (id.startsWith("contest")) {
    return { category: "contest", symbol: "*" };
  }
  if (id.startsWith("start")) {
    return { category: "start", symbol: "^" };
  }
  return { category: "other", symbol: "·" };
}

/**
 * Resolve a step's referenced card (if any) to a human-readable label.
 * Prefers the explicit `cardNames` map (current hand + battlefield), then
 * falls back to the raw cardId. Non-card moves return undefined so we
 * don't pollute the log with the empty-params braces.
 */
function describeStepCard(
  params: Record<string, unknown>,
  cardNames: Record<string, string> | undefined,
): string | undefined {
  const raw = params.cardId;
  if (typeof raw !== "string" || raw.length === 0) {return undefined;}
  return cardNames?.[raw] ?? raw;
}

/**
 * Iter-14 Polish: surface a normalized phase label for any phase-related
 * move. Looks at common param keys (`phase`, `nextPhase`, `targetPhase`)
 * and runs the value through the shared `phaseLabel` normalizer so the
 * log says "Declare Attackers" instead of the cryptic "main-hook" id.
 * Returns undefined for non-phase moves so we don't pollute every row.
 */
function describeStepPhase(
  moveId: string,
  params: Record<string, unknown>,
): string | undefined {
  const id = moveId.toLowerCase();
  const PHASE_PARAM_KEYS = ["phase", "nextPhase", "targetPhase", "toPhase"];
  for (const k of PHASE_PARAM_KEYS) {
    const v = params[k];
    if (typeof v === "string" && v.length > 0) {return phaseLabel(v);}
  }
  // For moves whose name implies a phase transition but no param carries
  // It, surface the closest phase keyword from the move id itself.
  if (
    id.includes("phase") ||
    id.startsWith("advance") ||
    id.startsWith("nextphase") ||
    id === "endturn" ||
    id === "end-turn"
  ) {
    return undefined; // No param data — let the move id speak for itself.
  }
  return undefined;
}

export function MoveLog({ trail, cardNames }: MoveLogProps) {
  // Iter-8 gap 4: flash the header pill when the count changes. We track
  // The previous trail length in a ref and toggle a transient flash class
  // For ~800ms whenever the count grows. Avoid flashing on initial mount
  // (prev === undefined) so a fresh page-load doesn't strobe.
  const prevLenRef = useRef<number | null>(null);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    const prev = prevLenRef.current;
    if (prev !== null && trail.length > prev) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 800);
      prevLenRef.current = trail.length;
      return () => clearTimeout(t);
    }
    prevLenRef.current = trail.length;
    return undefined;
  }, [trail.length]);
  return (
    <aside className="move-log" data-testid="move-log">
      <h3
        className={flash ? "move-log-header move-log-header-flash" : "move-log-header"}
        data-testid="move-log-header"
        data-flash={flash ? "true" : "false"}
      >
        Move log ({trail.length})
      </h3>
      <ol className="trail">
        {trail.map((s) => {
          const cardLabel = describeStepCard(s.params, cardNames);
          const phaseName = describeStepPhase(s.moveId, s.params);
          const location =
            typeof s.params.location === "string" ? s.params.location : undefined;
          const cat = categorizeMove(s.moveId);
          // Build a small, readable inline summary. Keep the full params
          // As a tooltip for power users.
          // Slice 4 (undo/rewind): when this step was rewound by a later
          // POST /api/v2/undo call, the server flips `undone = true` on the
          // Trail entry. Render the row with `movelog-row-undone` so it
          // Shows up strike-through + dimmed (recommended visual per the
          // Slice spec — keeps history clearer than silently deleting).
          const undoneClass = s.undone ? " movelog-row-undone" : "";
          return (
            <li
              key={s.seq}
              className={`step step-${s.success ? "ok" : "fail"}${undoneClass}`}
              data-testid={`step-${s.seq}`}
              data-move-category={cat.category}
              data-undone={s.undone ? "true" : undefined}
              title={JSON.stringify(s.params)}
            >
              <span
                className={`move-dot move-dot-${cat.category}`}
                data-testid={`step-${s.seq}-dot`}
                aria-hidden="true"
              >
                {cat.symbol}
              </span>{" "}
              <span className="seq">#{s.seq}</span>{" "}
              <strong>{s.playerId}</strong>{" "}
              <span className="move-id">{s.moveId}</span>
              {phaseName ? (
                <span
                  className="move-phase-label"
                  data-testid={`step-${s.seq}-phase`}
                >
                  {phaseName}
                </span>
              ) : null}
              {cardLabel ? (
                <>
                  {" "}
                  <span
                    className="move-card-name"
                    data-testid={`step-${s.seq}-card`}
                  >
                    {cardLabel}
                  </span>
                </>
              ) : null}
              {location ? (
                <>
                  {" → "}
                  <span className="move-location">{location}</span>
                </>
              ) : null}
              {s.error ? <em className="err"> {s.error}</em> : null}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

/**
 * Helper used by PlayPage: build a cardId → name lookup table from the
 * union of all players' hands and all battlefield units. Exported so it
 * can be unit-tested independently of PlayPage's render path.
 */
export function buildCardNameMap(
  hand: Record<string, readonly HandCard[]>,
  battlefields: readonly GameViewBattlefield[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [, cards] of Object.entries(hand)) {
    for (const c of cards) {
      out[c.id] = c.name ?? c.definitionId ?? c.id;
    }
  }
  for (const bf of battlefields) {
    for (const u of bf.units) {
      out[u.id] = u.name ?? u.definitionId ?? u.id;
    }
  }
  return out;
}
