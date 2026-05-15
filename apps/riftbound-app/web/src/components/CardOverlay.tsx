/**
 * CardOverlay — inline rules-text popover for hand chips and battlefield
 * units. Phase B batch 20 QQ.
 *
 * Renders a small floating panel anchored to the trigger element when the
 * user hovers. The panel shows whatever card info is available in the
 * current API shape (`HandCard` = `id` + `definitionId`) plus a `cardInfo`
 * prop that callers can pass when richer data IS available (name, type,
 * might, cost, rulesText, parsed abilities). When `cardInfo` is missing,
 * the overlay degrades gracefully and shows a stub explaining that the
 * full card definition isn't wired through the API yet — Batch 21 needs
 * to extend the `/api/v2/state` view (or add a new `/api/v2/card-def/:id`
 * route) to thread `rulesText`/`abilities` through.
 *
 * Design notes:
 *   - Pure presentational; no fetching of its own. Keeps it lane-safe
 *     (no `web/src/lib/**` touches, no `server.ts` touches).
 *   - Uses CSS position:absolute with a parent wrapper that owns hover
 *     state so the popover can sit OUTSIDE the trigger button without
 *     flickering. The wrapper is keyboard-accessible (focusin/focusout)
 *     so a non-mouse user gets the same info.
 *   - All test hooks via `data-testid` so vitest can drive hover.
 */

import {
  type CSSProperties,
  type FocusEvent,
  type MouseEvent,
  type PropsWithChildren,
  type ReactNode,
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/**
 * Shape of card info the overlay can render. Optional fields degrade
 * gracefully: pass whatever you have. `cardId` is the only required
 * field so the overlay always has SOMETHING to display.
 */
export interface CardInfo {
  /** The instance id (e.g. `player-1-main-3-aggressive-warrior`). */
  readonly cardId: string;
  /** The definition id (e.g. `aggressive-warrior`). */
  readonly definitionId?: string;
  /** Human-readable card name. */
  readonly name?: string;
  /** Unit | spell | gear | equipment | rune | legend | battlefield */
  readonly cardType?: string;
  /** Base might for units. */
  readonly might?: number;
  /** Energy cost. */
  readonly energyCost?: number;
  /** Power-cost domains (e.g. `["fury", "chaos"]`). */
  readonly powerCost?: readonly string[];
  /** Rules text from the card definition. */
  readonly rulesText?: string;
  /**
   * Parsed abilities — one-line summaries, e.g.
   *   ["[Trigger: on attack] deal 1 damage to enemy unit"]
   * Caller-formatted so the overlay stays presentation-only.
   */
  readonly abilities?: readonly string[];
  /**
   * Phase B batch 26 JJJ: optional card art URL. When present, the overlay
   * renders a large image at the top of the popover so the user sees the
   * actual card on hover (RiftAtlas parity).
   */
  readonly imageUrl?: string;
}

export interface CardOverlayProps {
  /** Card to describe. Falls back to a stub if `cardInfo` is undefined. */
  readonly cardInfo?: CardInfo;
  /**
   * The hover trigger — usually the hand-chip button or a battlefield
   * unit. The overlay wraps this in a span and shows the popover on
   * hover / focus.
   */
  readonly children: ReactNode;
  /**
   * Optional: which side of the trigger to anchor the popover. Default
   * `top`. (`bottom` keeps the overlay below the trigger; useful for
   * cards in the top row of a hand.)
   */
  readonly placement?: "top" | "bottom";
  /** Optional: testid prefix so multiple overlays can coexist in tests. */
  readonly testIdPrefix?: string;
  /**
   * Iter-18 Gap 1: when true, after the user dwells on the trigger for
   * ~700ms the popover swaps to a LARGE preview (~3x normal — full art at
   * top, name/cost/might inline, rules + abilities at bottom). The big
   * popover auto-positions to avoid clipping the right/top edge of the
   * viewport. Pure presentational — opt-in by the parent (hand chip uses
   * it; BF unit mini-chips don't, to keep the board hover lightweight).
   */
  readonly expandOnLongHover?: boolean;
  /** Iter-18 Gap 1: dwell delay in ms before showing the expanded preview. */
  readonly expandDelayMs?: number;
}

const POPOVER_BASE_STYLE: CSSProperties = {
  background: "rgba(20, 20, 28, 0.96)",
  border: "1px solid #555",
  borderRadius: "6px",
  color: "#eee",
  fontSize: "12px",
  lineHeight: 1.4,
  maxWidth: "280px",
  minWidth: "200px",
  padding: "8px 10px",
  pointerEvents: "none",
  position: "absolute",
  textAlign: "left",
  zIndex: 50,
};

/**
 * Format a one-line summary of energy + power cost.
 *   energyCost=2, powerCost=["fury"] → "2 fury"
 *   energyCost=3, powerCost=["fury","chaos"] → "3 fury+chaos"
 *   energyCost=undefined → ""
 */
function formatCost(info: CardInfo): string {
  if (info.energyCost === undefined) {return "";}
  const power = info.powerCost && info.powerCost.length > 0
    ? ` ${info.powerCost.join("+")}`
    : "";
  return `${info.energyCost}${power}`;
}

/** A small typed key/value row. Pure presentation. */
function StatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="card-overlay-stat-row">
      <strong>{label}:</strong> <span>{value}</span>
    </div>
  );
}

/**
 * The actual popover panel. Memoised so React only re-renders the
 * panel when its inputs change, not when hover state flips on the
 * outer wrapper. (Hover state changing forces a render of THIS
 * component too via the parent, but the inner DOM stays stable.)
 */
const Popover = forwardRef<HTMLDivElement, { info: CardInfo | undefined; placement: "top" | "bottom"; testIdPrefix: string }>(
  function Popover({ info, placement, testIdPrefix }, ref) {
    const positional: CSSProperties = placement === "bottom"
      ? { left: 0, top: "calc(100% + 4px)" }
      : { bottom: "calc(100% + 4px)", left: 0 };

    if (!info) {
      return (
        <div
          ref={ref}
          data-testid={`${testIdPrefix}-overlay-unknown`}
          style={{ ...POPOVER_BASE_STYLE, ...positional }}
        >
          <em>card info unavailable</em>
        </div>
      );
    }

    const cost = formatCost(info);
    return (
      <div
        ref={ref}
        data-testid={`${testIdPrefix}-overlay-${info.cardId}`}
        style={{ ...POPOVER_BASE_STYLE, ...positional }}
      >
        {info.imageUrl ? (
          <img
            className="card-overlay-image"
            data-testid={`${testIdPrefix}-overlay-image-${info.cardId}`}
            src={info.imageUrl}
            alt={info.name ?? info.definitionId ?? info.cardId}
            loading="lazy"
            style={{
              borderRadius: 4,
              display: "block",
              marginBottom: 6,
              maxWidth: 240,
              width: "100%",
            }}
          />
        ) : null}
        <div className="card-overlay-header">
          <strong data-testid={`${testIdPrefix}-overlay-name`}>
            {info.name ?? info.definitionId ?? info.cardId}
          </strong>
          {info.cardType ? <span className="card-overlay-type"> · {info.cardType}</span> : null}
        </div>
        {cost ? <StatRow label="Cost" value={cost} /> : null}
        {info.might !== undefined ? <StatRow label="Might" value={info.might} /> : null}
        {info.definitionId && info.name && info.definitionId !== info.name ? (
          <StatRow label="ID" value={<code>{info.definitionId}</code>} />
        ) : null}
        {info.rulesText ? (
          <div
            className="card-overlay-rules-text"
            data-testid={`${testIdPrefix}-overlay-rules`}
            style={{ marginTop: 6, whiteSpace: "pre-wrap" }}
          >
            {info.rulesText}
          </div>
        ) : (
          <div
            className="card-overlay-stub"
            data-testid={`${testIdPrefix}-overlay-stub`}
            style={{ color: "#aaa", fontStyle: "italic", marginTop: 6 }}
          >
            rules text not available — batch 21 needs to thread
            rulesText/abilities through /api/v2/state.
          </div>
        )}
        {info.abilities && info.abilities.length > 0 ? (
          <ul
            className="card-overlay-abilities"
            data-testid={`${testIdPrefix}-overlay-abilities`}
            style={{ margin: "6px 0 0", paddingLeft: 16 }}
          >
            {info.abilities.map((a, i) => (
              <li key={`${a}-${i}`}>{a}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  },
);

/**
 * Iter-18 Gap 1: BigPopover — the expanded ~3x preview shown after a
 * 700ms dwell on the trigger. Full card art at top, name + cost + might
 * inline below the art, rules text + abilities at bottom. Auto-positions
 * to flip from right→left or top→bottom when the natural anchor would
 * clip the viewport.
 *
 * Geometry: ~280px wide × ~392px tall (art roughly 280×200 + ~190px of
 * text). Anchored to the wrapper via fixed positioning so the popover
 * isn't clipped by the hand container's `overflow: hidden`/scroll. The
 * wrapper passes its bounding rect through so this component can pick a
 * side that fits.
 */
const BIG_W = 280;
const BIG_H = 392;

interface BigPopoverProps {
  readonly info: CardInfo | undefined;
  readonly anchorRect: DOMRect | null;
  readonly testIdPrefix: string;
}

function BigPopover({ info, anchorRect, testIdPrefix }: BigPopoverProps) {
  if (!anchorRect) {return null;}
  const vw = typeof window !== "undefined" ? window.innerWidth : 1400;
  const vh = typeof window !== "undefined" ? window.innerHeight : 900;
  // Prefer right-of-anchor; flip to left if it would clip.
  const wantRight = anchorRect.right + 8 + BIG_W <= vw;
  const left = wantRight
    ? anchorRect.right + 8
    : Math.max(8, anchorRect.left - 8 - BIG_W);
  // Vertically center on the anchor, then clamp to viewport.
  const desiredTop = anchorRect.top + anchorRect.height / 2 - BIG_H / 2;
  const top = Math.max(8, Math.min(vh - BIG_H - 8, desiredTop));
  const cost = info ? formatCost(info) : "";
  const style: CSSProperties = {
    background: "rgba(20, 20, 28, 0.98)",
    border: "1px solid #8fc2ff",
    borderRadius: 8,
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(140,200,255,0.35)",
    color: "#eee",
    fontSize: 13,
    left,
    lineHeight: 1.45,
    maxWidth: BIG_W,
    padding: 10,
    pointerEvents: "none",
    position: "fixed",
    textAlign: "left",
    top,
    width: BIG_W,
    zIndex: 1000,
  };
  return (
    <div
      className="card-overlay-big"
      data-testid={`${testIdPrefix}-overlay-big${info?.cardId ? `-${info.cardId}` : ""}`}
      data-overlay-big="true"
      data-anchor-side={wantRight ? "right" : "left"}
      style={style}
    >
      {info?.imageUrl ? (
        <img
          className="card-overlay-big-image"
          src={info.imageUrl}
          alt={info.name ?? info.definitionId ?? info.cardId}
          loading="lazy"
          style={{
            background: "#0a0c14",
            borderRadius: 6,
            display: "block",
            marginBottom: 8,
            maxHeight: 200,
            objectFit: "contain",
            width: "100%",
          }}
        />
      ) : null}
      <div
        className="card-overlay-big-header"
        style={{
          alignItems: "center",
          display: "flex",
          gap: 8,
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <strong style={{ flex: 1, fontSize: 14 }}>
          {info?.name ?? info?.definitionId ?? info?.cardId ?? "Unknown"}
        </strong>
        {cost ? (
          <span
            className="card-overlay-big-cost"
            style={{
              background: "#2e5594",
              border: "1px solid #8fc2ff",
              borderRadius: 4,
              fontSize: 11,
              padding: "1px 6px",
              whiteSpace: "nowrap",
            }}
          >
            {cost}
          </span>
        ) : null}
        {info?.might !== undefined ? (
          <span
            className="card-overlay-big-might"
            style={{
              background: "#5a2a2a",
              border: "1px solid #c47878",
              borderRadius: 4,
              fontSize: 11,
              padding: "1px 6px",
            }}
          >
            ⚔ {info.might}
          </span>
        ) : null}
      </div>
      {info?.cardType ? (
        <div
          className="card-overlay-big-type"
          style={{ color: "#8fa3c4", fontSize: 11, marginBottom: 6 }}
        >
          {info.cardType}
        </div>
      ) : null}
      {info?.rulesText ? (
        <div
          className="card-overlay-big-rules"
          style={{
            background: "rgba(0,0,0,0.25)",
            borderRadius: 4,
            marginBottom: 6,
            padding: "6px 8px",
            whiteSpace: "pre-wrap",
          }}
        >
          {info.rulesText}
        </div>
      ) : null}
      {info?.abilities && info.abilities.length > 0 ? (
        <ul
          className="card-overlay-big-abilities"
          style={{ margin: 0, paddingLeft: 16 }}
        >
          {info.abilities.map((a, i) => (
            <li key={`${a}-${i}`} style={{ marginBottom: 2 }}>
              {a}
            </li>
          ))}
        </ul>
      ) : null}
      {!info?.rulesText && (!info?.abilities || info.abilities.length === 0) ? (
        <div
          className="card-overlay-big-stub"
          style={{ color: "#aaa", fontStyle: "italic" }}
        >
          (no rules text)
        </div>
      ) : null}
    </div>
  );
}

/**
 * CardOverlay — wraps children in an inline-block span and renders a
 * popover with card details on hover / focus.
 */
export function CardOverlay(props: PropsWithChildren<CardOverlayProps>) {
  const {
    cardInfo,
    children,
    placement = "top",
    testIdPrefix = "card",
    expandOnLongHover = false,
    expandDelayMs = 700,
  } = props;
  const [hovered, setHovered] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearExpandTimer = useCallback(() => {
    if (expandTimerRef.current) {
      clearTimeout(expandTimerRef.current);
      expandTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearExpandTimer(), [clearExpandTimer]);

  // When the expanded preview opens, snapshot the wrapper's bounding rect
  // So BigPopover can position itself relative to the trigger.
  useLayoutEffect(() => {
    if (expanded && wrapperRef.current) {
      setAnchorRect(wrapperRef.current.getBoundingClientRect());
    } else if (!expanded) {
      setAnchorRect(null);
    }
  }, [expanded]);

  const onMouseEnter = useCallback(
    (_e: MouseEvent<HTMLSpanElement>) => {
      setHovered(true);
      if (expandOnLongHover) {
        clearExpandTimer();
        expandTimerRef.current = setTimeout(() => {
          setExpanded(true);
        }, expandDelayMs);
      }
    },
    [expandOnLongHover, expandDelayMs, clearExpandTimer],
  );
  const onMouseLeave = useCallback(
    (_e: MouseEvent<HTMLSpanElement>) => {
      setHovered(false);
      setExpanded(false);
      clearExpandTimer();
    },
    [clearExpandTimer],
  );
  const onFocus = useCallback(
    (_e: FocusEvent<HTMLSpanElement>) => {
      setHovered(true);
    },
    [],
  );
  const onBlur = useCallback(
    (_e: FocusEvent<HTMLSpanElement>) => {
      setHovered(false);
      setExpanded(false);
      clearExpandTimer();
    },
    [clearExpandTimer],
  );

  return (
    <span
      ref={wrapperRef}
      className="card-overlay-wrapper"
      data-testid={`${testIdPrefix}-overlay-wrapper${cardInfo?.cardId ? `-${cardInfo.cardId}` : ""}`}
      data-overlay-open={hovered ? "true" : "false"}
      data-overlay-expanded={expanded ? "true" : "false"}
      style={{ display: "inline-block", position: "relative" }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      {children}
      {hovered && !expanded ? (
        <Popover info={cardInfo} placement={placement} testIdPrefix={testIdPrefix} />
      ) : null}
      {expanded ? (
        <BigPopover
          info={cardInfo}
          anchorRect={anchorRect}
          testIdPrefix={testIdPrefix}
        />
      ) : null}
    </span>
  );
}
