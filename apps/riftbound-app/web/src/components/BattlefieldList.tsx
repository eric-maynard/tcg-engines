import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { BattlefieldUnit, CombatUnit, GameViewBattlefield } from "../lib/api";
import { deriveShowdownStepIndex } from "./ShowdownBreadcrumb";

interface BattlefieldListProps {
  readonly battlefields: readonly GameViewBattlefield[];
  /**
   * Phase B batch 27 iter-4: id of the battlefield currently in active
   * combat (showdown). When set, the matching tile is brightened and all
   * other tiles are dimmed to draw focus to the contested lane.
   */
  readonly activeBattlefieldId?: string | null;
  /**
   * Optional local-player id so each tile can split units into
   * "ours / theirs" side-slots that mirror RiftAtlas's
   * attacker-side / defender-side board geometry.
   */
  readonly localPlayerId?: string | null;
  /**
   * Iter-11 gap 1: when set, the matching BF tile renders a SHOWDOWN beam
   * + phase badge, and units flagged in `attackerIds` / `defenderIds`
   * get combat-role badges. Pure data-driven (no per-card ifs).
   */
  readonly combatPhase?: string | null;
  readonly attackerIds?: readonly string[];
  readonly defenderIds?: readonly string[];
  /**
   * Iter-15 Gap 1: explicit attacker→defender pair list. When provided AND
   * non-empty, MatchupLines draws ONE line per pair instead of the
   * cartesian-product fallback. Pure pass-through from the engine's
   * `view.combat.pairs` (currently always undefined; reserved contract).
   */
  readonly pairs?: readonly {
    readonly attackerId: string;
    readonly defenderId: string;
  }[];
  /**
   * Iter-15 Gap 2: full combatants used to source `might` for the per-line
   * damage label rendered at each matchup-line midpoint. Optional — when
   * absent, the line midpoint label is suppressed (no crash).
   */
  readonly combatAttackers?: readonly CombatUnit[];
  readonly combatDefenders?: readonly CombatUnit[];
  /**
   * Iter-15 polish: when truthy, friendly units on the active BF that don't
   * yet have an `attacker` / `defender` role get a pulsing gold border so
   * the human can see at a glance which board pieces are clickable. Pure
   * data-driven via `localPlayerId` + `actionableRolePhase`.
   */
  readonly actionableRolePhase?: "attacker" | "defender" | null;
}

const EMPTY_IDS: readonly string[] = [];

/**
 * RiftAtlas-style battlefield tiles (Phase B batch 27 iter-4).
 *
 * Each tile is now a compact ~300px card-shaped slot with two unit
 * "sides" (ours-left / theirs-right) flanking the central card face. An
 * always-rendered empty placeholder appears in each side so the player
 * can see where units WOULD go before any are placed. Rules text moves
 * into a collapsed <details> panel so the BF reads as a board piece, not
 * a text dump — but the markup still exists in the DOM (CardArt tests
 * query by testid regardless of visibility).
 *
 * Combat-active highlighting: when `activeBattlefieldId` matches, the
 * tile glows; the others are dimmed via `bf-inactive`.
 */
/**
 * Iter-10 gap 1+2: per-side slot state. Each side carries one of three
 * states — `controlled` (gold border, the BF is held by the player on
 * this side), `contested` (red border, this side is part of an active
 * contest), or `idle` (neutral). The state is derived data-driven from
 * the parent BF's `contested` / `controller` fields plus the local-player
 * id (which decides which side is "ours" vs "theirs"). No per-card ifs.
 *
 * For gap 2, when the slot has units we render small overlapping
 * mini-chips (32×40, stacked) instead of the placeholder. That keeps the
 * BF tile readable when a single lane has 3+ units fighting for it.
 */
function UnitSlot({
  side,
  units,
  state,
  attackerIds,
  defenderIds,
  flashIds,
  actionableRolePhase,
}: {
  readonly side: "ours" | "theirs";
  readonly units: readonly BattlefieldUnit[];
  readonly state: "controlled" | "contested" | "idle";
  readonly attackerIds: readonly string[];
  readonly defenderIds: readonly string[];
  readonly flashIds: ReadonlySet<string>;
  /**
   * Iter-15 polish: when set, units on the "ours" side that don't yet have
   * a combat role get a pulsing-gold border to flag them as actionable
   * targets for `assignAttacker` / `assignDefender`. Pure data-driven via
   * the role-id sets — no per-card branching.
   */
  readonly actionableRolePhase?: "attacker" | "defender" | null;
}) {
  return (
    <div
      className={`bf-side bf-side-${side} bf-side-${state}`}
      data-testid={`bf-side-${side}`}
      data-side={side}
      data-side-state={state}
    >
      {units.length === 0 ? (
        <div className="bf-slot-empty" aria-hidden="true">
          <span className="bf-slot-empty-label">
            {side === "ours" ? "your unit" : "opp unit"}
          </span>
        </div>
      ) : (
        <ul
          className="bf-units bf-mini-stack"
          data-testid={`bf-mini-stack-${side}`}
        >
          {units.map((u, idx) => {
            // Iter-11 gap 2: combat-role badge state. A unit can be either
            // Attacker or defender (or neither). Pure data-driven from the
            // Engine's combat.attackers / combat.defenders lists.
            const isAttacker = attackerIds.includes(u.id);
            const isDefender = !isAttacker && defenderIds.includes(u.id);
            const role: "attacker" | "defender" | "none" = isAttacker
              ? "attacker"
              : (isDefender
                ? "defender"
                : "none");
            const isFlashing = flashIds.has(u.id);
            // Iter-15 polish: pulse only friendly ("ours") units that have
            // No role yet while the phase asks for an action of that kind.
            const isActionable =
              side === "ours" && role === "none" && Boolean(actionableRolePhase);
            return (
            <li
              key={u.id}
              className={`bf-unit bf-mini-chip${u.imageUrl ? " bf-mini-chip-art bf-unit-art" : ""}${role !== "none" ? ` bf-mini-chip-role-${role}` : ""}${isFlashing ? " bf-unit-role-flash" : ""}${isActionable ? ` bf-mini-chip-actionable bf-mini-chip-actionable-${actionableRolePhase}` : ""}`}
              data-testid={`bf-unit-${u.id}`}
              data-mini-chip-id={u.id}
              data-controller={u.controller}
              data-stack-index={idx}
              data-has-image={u.imageUrl ? "true" : "false"}
              data-combat-role={role}
              data-role={role !== "none" ? role : undefined}
              data-role-flash={isFlashing ? "true" : "false"}
              data-actionable={isActionable ? "true" : "false"}
              style={{
                // Each chip after the first is pulled up by 18px so they
                // Overlap vertically — pure inline style so per-card
                // Styling stays data-driven (the index supplies the offset).
                marginTop: idx === 0 ? 0 : -18,
                zIndex: idx + 1,
                // Iter-M: --card-img drives the CSS-only hover-zoom preview
                // (::after on .bf-mini-chip:hover). Unset when no image.
                ...(u.imageUrl
                  ? ({ "--card-img": `url(${u.imageUrl})` } as CSSProperties)
                  : {}),
              }}
              title={u.name ?? u.definitionId ?? u.id}
            >
              {u.imageUrl ? (
                <img
                  className="bf-mini-chip-image bf-unit-image"
                  data-testid={`bf-unit-image-${u.id}`}
                  src={u.imageUrl}
                  alt={u.name ?? u.definitionId}
                  loading="lazy"
                />
              ) : (
                <span className="bf-mini-chip-fallback" aria-hidden="true">
                  {(u.name ?? u.definitionId ?? u.id).slice(0, 2)}
                </span>
              )}
              {u.imageUrl ? (
                <span
                  className="bf-mini-chip-name-banner"
                  data-testid={`bf-unit-name-banner-${u.id}`}
                  aria-hidden="true"
                >
                  {u.name ?? u.definitionId}
                </span>
              ) : null}
              {u.might !== undefined ? (
                <span className="bf-mini-chip-might bf-unit-might">{u.might}</span>
              ) : null}
              {/* Hidden accessible name + owner for tests + screen readers. */}
              <span className="bf-unit-name sr-only">
                {u.name ?? u.definitionId ?? u.id}
              </span>
              <small className="bf-unit-owner sr-only">[{u.controller}]</small>
              {role !== "none" ? (
                <span
                  className={`bf-mini-chip-role bf-mini-chip-role-badge bf-mini-chip-role-badge-${role}`}
                  data-testid={`bf-unit-role-${u.id}`}
                  data-role={role}
                  aria-label={role}
                  title={role}
                >
                  {/* Iter-13 Gap 1: badge now carries a TEXT label
                      ("ATTACKING" / "DEFENDING") plus the original glyph so
                      it's legible on a board screenshot. The glyph still
                      lives in the DOM as `bf-mini-chip-role-glyph` for the
                      tiny variant CSS may toggle to. */}
                  <span className="bf-mini-chip-role-glyph" aria-hidden="true">
                    {role === "attacker" ? "⚔" : "\u{1F6E1}"}
                  </span>
                  <span className="bf-mini-chip-role-text">
                    {role === "attacker" ? "ATTACKING" : "DEFENDING"}
                  </span>
                </span>
              ) : null}
            </li>
          );
          })}
        </ul>
      )}
    </div>
  );
}

const ROLE_FLASH_MS = 800;
const EMPTY_FLASH: ReadonlySet<string> = new Set<string>();

/**
 * Iter-14 Gap 2: visual matchup lines.
 *
 * The active BF tile renders an SVG overlay with one animated gold line
 * per attacker→defender pair so the contested matchup reads as actual
 * combat geometry, not a decorative beam. Positions are computed from the
 * DOM (the chips' bounding rects) on every layout pass + on resize, so the
 * lines stay anchored to the real chip centers regardless of how many
 * units stack up.
 *
 * Pairing model (pure data — no per-card ifs):
 *   - 1 attacker, 1 defender → 1 straight line.
 *   - N attackers, 1 defender → N lines fanning into the defender (one
 *     per attacker).
 *   - 1 attacker, M defenders → M lines fanning out from the attacker.
 *   - N attackers, M defenders → cartesian product (every attacker
 *     targets every defender). Engines that surface explicit pair
 *     assignments can replace this with a `pairs` prop later.
 */
interface MatchupLinesProps {
  readonly tileEl: HTMLDivElement | null;
  readonly attackerIds: readonly string[];
  readonly defenderIds: readonly string[];
  /**
   * Iter-15 Gap 1: explicit pairs. When provided AND non-empty, drives the
   * line rendering directly (one line per pair). Otherwise the cartesian
   * fallback runs.
   */
  readonly pairs?: readonly {
    readonly attackerId: string;
    readonly defenderId: string;
  }[];
  /**
   * Iter-15 Gap 2: per-unit might map (id → might). When set AND
   * `showDamageLabels` is true, each line renders a small `[A]→[D]` label
   * at its midpoint. Absent / undefined values render as "?".
   */
  readonly mightById?: ReadonlyMap<string, number | undefined>;
  /**
   * Iter-15 Gap 2: only render the damage labels when in the Strikes phase
   * (or later). Driven by the same derivation rules ShowdownBreadcrumb uses.
   */
  readonly showDamageLabels?: boolean;
}

interface LineCoords {
  readonly id: string;
  readonly attackerId: string;
  readonly defenderId: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

function MatchupLines({
  tileEl,
  attackerIds,
  defenderIds,
  pairs,
  mightById,
  showDamageLabels,
}: MatchupLinesProps) {
  const [lines, setLines] = useState<readonly LineCoords[]>([]);
  const [size, setSize] = useState<{ w: number; h: number }>({ h: 0, w: 0 });

  // Derive the (attackerId, defenderId) pair list once per render — explicit
  // Pairs win, otherwise cartesian product.
  const effectivePairs = useMemo<
    readonly { attackerId: string; defenderId: string }[]
  >(() => {
    if (pairs && pairs.length > 0) {
      return pairs.map((p) => ({
        attackerId: p.attackerId,
        defenderId: p.defenderId,
      }));
    }
    const out: { attackerId: string; defenderId: string }[] = [];
    for (const aId of attackerIds) {
      for (const dId of defenderIds) {
        out.push({ attackerId: aId, defenderId: dId });
      }
    }
    return out;
  }, [attackerIds, defenderIds, pairs]);

  useLayoutEffect(() => {
    if (!tileEl) {
      setLines([]);
      return undefined;
    }
    const compute = () => {
      const tileRect = tileEl.getBoundingClientRect();
      const centerOf = (id: string): { x: number; y: number } | null => {
        const el = tileEl.querySelector(`[data-mini-chip-id="${CSS.escape(id)}"]`);
        if (!el) {return null;}
        const r = (el as HTMLElement).getBoundingClientRect();
        return {
          x: r.left - tileRect.left + r.width / 2,
          y: r.top - tileRect.top + r.height / 2,
        };
      };
      const out: LineCoords[] = [];
      for (const pair of effectivePairs) {
        const a = centerOf(pair.attackerId);
        if (!a) {continue;}
        const d = centerOf(pair.defenderId);
        if (!d) {continue;}
        out.push({
          attackerId: pair.attackerId,
          defenderId: pair.defenderId,
          id: `${pair.attackerId}->${pair.defenderId}`,
          x1: a.x,
          x2: d.x,
          y1: a.y,
          y2: d.y,
        });
      }
      setLines(out);
      setSize({ h: tileRect.height, w: tileRect.width });
    };
    compute();
    // Re-compute when the tile resizes (chips loading images, side
    // Expanding, etc).
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(compute) : null;
    if (ro) {
      ro.observe(tileEl);
      // Also observe any chips so per-chip layout shifts (image load) recompute.
      tileEl
        .querySelectorAll("[data-mini-chip-id]")
        .forEach((el) => ro.observe(el));
    }
    return () => {
      if (ro) {ro.disconnect();}
    };
    // EffectivePairs / tileEl trigger recomputes; deliberately stringify
    // Pair contents so identical-but-new array instances skip rerun.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tileEl,
    effectivePairs.map((p) => `${p.attackerId}->${p.defenderId}`).join(","),
  ]);

  if (!tileEl || lines.length === 0) {return null;}
  const renderLabel = (ln: LineCoords) => {
    if (!showDamageLabels || !mightById) {return null;}
    const am = mightById.get(ln.attackerId);
    const dm = mightById.get(ln.defenderId);
    const mid = { x: (ln.x1 + ln.x2) / 2, y: (ln.y1 + ln.y2) / 2 };
    const text = `[${am ?? "?"}]→[${dm ?? "?"}]`;
    return (
      <g
        key={`${ln.id}-label`}
        className="bf-matchup-label-group"
        data-testid={`bf-matchup-label-${ln.id}`}
        transform={`translate(${mid.x}, ${mid.y})`}
      >
        <rect
          className="bf-matchup-label-bg"
          x={-26}
          y={-9}
          width={52}
          height={18}
          rx={4}
          ry={4}
        />
        <text
          className="bf-matchup-label-text"
          x={0}
          y={4}
          textAnchor="middle"
        >
          {text}
        </text>
      </g>
    );
  };
  return (
    <svg
      className="bf-matchup-svg"
      data-testid="bf-matchup-svg"
      width={size.w}
      height={size.h}
      viewBox={`0 0 ${size.w} ${size.h}`}
      aria-hidden="true"
    >
      {lines.map((ln) => (
        <line
          key={ln.id}
          className="bf-matchup-line"
          data-testid={`bf-matchup-line-${ln.id}`}
          x1={ln.x1}
          y1={ln.y1}
          x2={ln.x2}
          y2={ln.y2}
        />
      ))}
      {lines.map(renderLabel)}
    </svg>
  );
}

/**
 * Iter-12 Goal 2: track which unit ids JUST gained an attacker/defender
 * badge so the BF tile can render a transient `.bf-unit-role-flash` (gold
 * flash + scale animation). Diff is keyed on the prev role-id set held in
 * a `useRef` — when a NEW id appears in `attackerIds` or `defenderIds`
 * relative to the previous render, we add it to `flashIds` for ~800ms.
 *
 * Pure data-driven (no per-unit ifs): the diff is set algebra. SSR-safe
 * (skips the timer when there's nothing new).
 */
function useRoleChangeFlash(
  attackerIds: readonly string[],
  defenderIds: readonly string[],
): ReadonlySet<string> {
  const prevAttackerIds = useRef<ReadonlySet<string>>(EMPTY_FLASH);
  const prevDefenderIds = useRef<ReadonlySet<string>>(EMPTY_FLASH);
  const [flashIds, setFlashIds] = useState<ReadonlySet<string>>(EMPTY_FLASH);

  useEffect(() => {
    const nextAtt = new Set(attackerIds);
    const nextDef = new Set(defenderIds);
    const newlyFlashed: string[] = [];
    for (const id of nextAtt) {
      if (!prevAttackerIds.current.has(id)) {
        newlyFlashed.push(id);
      }
    }
    for (const id of nextDef) {
      if (!prevDefenderIds.current.has(id)) {
        newlyFlashed.push(id);
      }
    }
    prevAttackerIds.current = nextAtt;
    prevDefenderIds.current = nextDef;
    if (newlyFlashed.length === 0) {
      return undefined;
    }
    setFlashIds((prev) => {
      const merged = new Set(prev);
      for (const id of newlyFlashed) {
        merged.add(id);
      }
      return merged;
    });
    const timer = setTimeout(() => {
      setFlashIds((prev) => {
        const next = new Set(prev);
        for (const id of newlyFlashed) {
          next.delete(id);
        }
        return next;
      });
    }, ROLE_FLASH_MS);
    return () => clearTimeout(timer);
    // We deliberately key on stringified id-sets so identical-but-new
    // Array instances don't retrigger the flash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attackerIds.join(","), defenderIds.join(",")]);

  return flashIds;
}

export function BattlefieldList({
  battlefields,
  activeBattlefieldId,
  localPlayerId,
  combatPhase,
  attackerIds = EMPTY_IDS,
  defenderIds = EMPTY_IDS,
  pairs,
  combatAttackers,
  combatDefenders,
  actionableRolePhase,
}: BattlefieldListProps) {
  const flashIds = useRoleChangeFlash(attackerIds, defenderIds);
  // Iter-15 Gap 2: derive whether we're in the Strikes phase (or later)
  // For damage-label visibility. Reuses the same derivation rule the
  // Breadcrumb uses so the two stay in lockstep.
  const showDamageLabels = (() => {
    if (!combatPhase) {return false;}
    const idx = deriveShowdownStepIndex(
      combatPhase,
      attackerIds.length,
      defenderIds.length,
      false,
    );
    return idx >= 2; // 2 = Strikes, 3 = Resolution
  })();
  // Iter-15 Gap 2: id → might map sourced from CombatUnit.might (engine
  // Surfaces it on `view.combat.attackers/defenders`). Computed once per
  // Render — small N, no memo needed.
  const mightById = new Map<string, number | undefined>();
  for (const u of combatAttackers ?? []) {mightById.set(u.id, u.might);}
  for (const u of combatDefenders ?? []) {mightById.set(u.id, u.might);}
  if (battlefields.length === 0) {
    return (
      <div className="battlefield-row" data-testid="battlefield-row">
        <p className="bf-row-empty">(no battlefields placed)</p>
      </div>
    );
  }
  const hasActive = Boolean(activeBattlefieldId);
  return (
    <div className="battlefield-row" data-testid="battlefield-row">
      {battlefields.map((bf) => {
        const isActive = activeBattlefieldId === bf.id;
        return (
          <BattlefieldTile
            key={bf.id}
            bf={bf}
            isActive={isActive}
            hasActive={hasActive}
            localPlayerId={localPlayerId}
            combatPhase={combatPhase}
            attackerIds={attackerIds}
            defenderIds={defenderIds}
            flashIds={flashIds}
            pairs={pairs}
            mightById={mightById}
            showDamageLabels={showDamageLabels}
            actionableRolePhase={actionableRolePhase}
          />
        );
      })}
    </div>
  );
}

interface BattlefieldTileProps {
  readonly bf: GameViewBattlefield;
  readonly isActive: boolean;
  readonly hasActive: boolean;
  readonly localPlayerId?: string | null;
  readonly combatPhase?: string | null;
  readonly attackerIds: readonly string[];
  readonly defenderIds: readonly string[];
  readonly flashIds: ReadonlySet<string>;
  readonly pairs?: readonly {
    readonly attackerId: string;
    readonly defenderId: string;
  }[];
  readonly mightById?: ReadonlyMap<string, number | undefined>;
  readonly showDamageLabels?: boolean;
  readonly actionableRolePhase?: "attacker" | "defender" | null;
}

function BattlefieldTile({
  bf,
  isActive,
  hasActive,
  localPlayerId,
  combatPhase,
  attackerIds,
  defenderIds,
  flashIds,
  pairs,
  mightById,
  showDamageLabels,
  actionableRolePhase,
}: BattlefieldTileProps) {
  // Trigger one re-render after mount so MatchupLines receives the
  // Attached ref (refs don't trigger re-renders on their own).
  const [tileEl, setTileEl] = useState<HTMLDivElement | null>(null);
  const oursUnits = localPlayerId
    ? bf.units.filter((u) => u.controller === localPlayerId)
    : bf.units;
  const theirsUnits = localPlayerId
    ? bf.units.filter((u) => u.controller !== localPlayerId)
    : [];
  // Iter-10 gap 1: per-side state derived from the BF's controller +
  // Contested flags, then color-coded in CSS. Pure data-driven (no
  // Per-card if). The local-player side gets `controlled` when the
  // BF is held by them; the opponent side gets it when held by them;
  // Contested forces BOTH sides into `contested`.
  const oursState: "controlled" | "contested" | "idle" = bf.contested
    ? "contested"
    : (bf.controller && localPlayerId && bf.controller === localPlayerId
      ? "controlled"
      : "idle");
  const theirsState: "controlled" | "contested" | "idle" = bf.contested
    ? "contested"
    : (bf.controller && localPlayerId && bf.controller !== localPlayerId
      ? "controlled"
      : "idle");
  const tileClass = [
    "bf",
    bf.contested ? "bf-contested" : "",
    bf.controller ? "bf-controlled" : "",
    bf.imageUrl ? "bf-art" : "",
    isActive ? "bf-active" : "",
    hasActive && !isActive ? "bf-inactive" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className={tileClass}
      ref={setTileEl}
      data-testid={`bf-${bf.id}`}
      data-controller={bf.controller ?? ""}
      data-contested={bf.contested ? "true" : "false"}
      data-has-image={bf.imageUrl ? "true" : "false"}
      data-active={isActive ? "true" : "false"}
    >
      {/* Iter-43a: full-tile bg art rendered as a direct child of the .bf
          grid so position:absolute;inset:0 covers the entire tile (including
          the side-slot rails), not just the center column. z-index:0 keeps it
          behind all interactive content. */}
      {bf.imageUrl ? (
        <img
          className="bf-image bf-image-full"
          data-testid={`bf-image-${bf.id}`}
          src={bf.imageUrl}
          alt={bf.name ?? bf.id}
          loading="lazy"
          aria-hidden="true"
        />
      ) : null}
      <UnitSlot
        side="ours"
        units={oursUnits}
        state={oursState}
        attackerIds={isActive ? attackerIds : EMPTY_IDS}
        defenderIds={isActive ? defenderIds : EMPTY_IDS}
        flashIds={isActive ? flashIds : EMPTY_FLASH}
        actionableRolePhase={isActive ? actionableRolePhase ?? null : null}
      />
      {isActive ? (
        <>
          <span
            className="bf-showdown-beam"
            data-testid={`bf-showdown-beam-${bf.id}`}
            aria-hidden="true"
          />
          {combatPhase ? (
            <span
              className="bf-showdown-badge"
              data-testid={`bf-showdown-badge-${bf.id}`}
              data-combat-phase={combatPhase}
            >
              SHOWDOWN — {combatPhase}
            </span>
          ) : null}
          {/* Iter-14 Gap 2: SVG overlay drawing matchup lines from each
              attacker chip to each defender chip. Computed from DOM
              bounding rects so it stays correct regardless of stack count.
              Sits above the BF art (z=3) but below combat-role badges
              (which are z=5+) so the chips remain interactive. */}
          <MatchupLines
            tileEl={tileEl}
            attackerIds={attackerIds}
            defenderIds={defenderIds}
            pairs={pairs}
            mightById={mightById}
            showDamageLabels={showDamageLabels}
          />
        </>
      ) : null}
      <div className="bf-tile-center">
        <header className="bf-header">
          <span className="bf-title">{bf.name ?? bf.id}</span>
          {/* Iter-18 Gap 2: small inline chip showing the sum of friendly
              unit might on this BF (when one controller dominates) or the
              contested might delta (e.g. "3 vs 1") when the lane has units
              from both sides. Pure data-driven: sums BattlefieldUnit.might
              by controller. Units missing `might` (synthetic decks) count
              as 0 — the chip just hides itself if both totals are 0. */}
          {(() => {
            const tallyByController: Record<string, number> = {};
            const presentControllers = new Set<string>();
            for (const u of bf.units) {
              presentControllers.add(u.controller);
              tallyByController[u.controller] =
                (tallyByController[u.controller] ?? 0) + (u.might ?? 0);
            }
            if (presentControllers.size === 0) {return null;}
            const oursTotal = localPlayerId
              ? tallyByController[localPlayerId] ?? 0
              : 0;
            const theirsTotal = Object.entries(tallyByController)
              .filter(([k]) => k !== localPlayerId)
              .reduce((acc, [, v]) => acc + v, 0);
            const contested = presentControllers.size > 1;
            const totalAny = oursTotal + theirsTotal;
            if (totalAny === 0 && !contested) {return null;}
            const display = contested
              ? `${oursTotal} vs ${theirsTotal}`
              : (localPlayerId && tallyByController[localPlayerId]
                ? `${oursTotal}`
                : `${theirsTotal}`);
            return (
              <span
                className={`bf-might-chip${contested ? " bf-might-chip-contested" : ""}`}
                data-testid={`bf-might-chip-${bf.id}`}
                data-contested={contested ? "true" : "false"}
                data-ours-might={oursTotal}
                data-theirs-might={theirsTotal}
                title={
                  contested
                    ? `Contested might: ${oursTotal} (yours) vs ${theirsTotal} (theirs)`
                    : `Total might on this BF: ${display}`
                }
                aria-label={
                  contested
                    ? `contested might ${oursTotal} versus ${theirsTotal}`
                    : `might ${display}`
                }
              >
                <span className="bf-might-chip-glyph" aria-hidden="true">
                  ⚔
                </span>
                <span className="bf-might-chip-value">{display}</span>
              </span>
            );
          })()}
          <span
            className={`bf-status bf-status-${
              bf.contested
                ? "contested"
                : (bf.controller
                  ? "controlled"
                  : "uncontrolled")
            }`}
            data-testid={`bf-status-${bf.id}`}
            data-status={
              bf.contested
                ? "contested"
                : (bf.controller
                  ? "controlled"
                  : "uncontrolled")
            }
            title={
              bf.contested
                ? "contested"
                : (bf.controller
                  ? `held by ${bf.controller}`
                  : "uncontrolled")
            }
            aria-label={
              bf.contested
                ? "contested"
                : (bf.controller
                  ? `held by ${bf.controller}`
                  : "uncontrolled")
            }
          >
            <span className="bf-status-glyph" aria-hidden="true">
              {bf.contested ? "⚔" : (bf.controller ? "★" : "⚿")}
            </span>
          </span>
          {bf.rulesText ? (
            <label
              className="bf-rules-toggle"
              data-testid={`bf-rules-toggle-${bf.id}`}
              title="Show rules"
              aria-label="Show rules"
            >
              <input
                type="checkbox"
                className="bf-rules-toggle-input"
                aria-label="Show rules"
              />
              <span className="bf-rules-toggle-glyph" aria-hidden="true">
                i
              </span>
            </label>
          ) : null}
        </header>
        {bf.rulesText ? (
          <pre
            className="bf-rules-text"
            data-testid={`bf-rules-text-${bf.id}`}
          >
            {bf.rulesText}
          </pre>
        ) : null}
      </div>
      <UnitSlot
        side="theirs"
        units={theirsUnits}
        state={theirsState}
        attackerIds={isActive ? attackerIds : EMPTY_IDS}
        defenderIds={isActive ? defenderIds : EMPTY_IDS}
        flashIds={isActive ? flashIds : EMPTY_FLASH}
        actionableRolePhase={null}
      />
      {/* Iter-19 Gap 2: vertical "VS" divider floating between the two
          side rails — only renders when the BF is contested (units on
          both sides). Pure CSS-positioned overlay (absolute, centered
          via parent grid `position: relative`); no per-card branching.
          Helps the contested geometry pop visually beyond the red glow
          on the side rails. */}
      {bf.contested ? (
        <span
          className="bf-vs-divider"
          data-testid={`bf-vs-divider-${bf.id}`}
          aria-hidden="true"
          title="contested"
        >
          <span className="bf-vs-divider-line" />
          <span className="bf-vs-divider-badge">VS</span>
        </span>
      ) : null}
    </div>
  );
}
