/**
 * Per-seat observations: the single redaction path (mirrors
 * apps/riftbound-app/server/snapshot.ts buildGameSnapshot).
 */

import { getGlobalCardRegistry } from "../operations/card-lookup";
import { getActingSeat } from "../views/acting-seat";
import { buildCardState } from "./card-state";
import type { HarnessEngine } from "./internal";
import { getInternalState } from "./internal";
import type {
  BattlefieldView,
  CardPool,
  CardView,
  Decision,
  DecisionSummary,
  Observation,
  Seat,
  Viewer,
  ZoneKey,
  ZoneSummary,
} from "./types";
import { SPECTATOR } from "./types";

/** Zones whose contents are identity-hidden from non-owners (rule 127: private). */
export function isPrivateZone(zone: string): boolean {
  return zone === "hand" || zone.startsWith("facedown-") || isSecretZone(zone);
}

/** Zones nobody may look at (rule 127: secret) — deck order. */
export function isSecretZone(zone: string): boolean {
  return zone === "mainDeck" || zone === "runeDeck";
}

/** Zones that hold one shared list for all players (filter by owner). */
export const PER_PLAYER_ZONES: readonly ZoneKey[] = [
  "hand",
  "base",
  "trash",
  "banishment",
  "mainDeck",
  "runeDeck",
  "runePool",
  "legendZone",
  "championZone",
];

export function canSee(viewer: Viewer, zone: string, owner: string): boolean {
  if (viewer === SPECTATOR) {
    return true;
  }
  if (!isPrivateZone(zone)) {
    return true;
  }
  if (isSecretZone(zone)) {
    return false;
  }
  return owner === viewer;
}

/** The zone KIND a visibility grant names (rule 127 private zones). */
function visibilityZoneKind(zone: string): string | undefined {
  if (zone === "hand") {
    return "hand";
  }
  if (zone.startsWith("facedown-")) {
    return "facedown";
  }
  return undefined;
}

/**
 * rule 127 — an information effect ("They reveal their hand. You can look at
 * their facedown cards this turn.", unl-053-219) lets one seat see into
 * another's private zone. Secret zones (deck order) are never granted.
 */
export function hasVisibilityGrant(
  engine: HarnessEngine,
  viewer: Viewer,
  zone: string,
  owner: string,
): boolean {
  if (viewer === SPECTATOR || isSecretZone(zone)) {
    return false;
  }
  const kind = visibilityZoneKind(zone);
  if (kind === undefined) {
    return false;
  }
  const grants = engine.getState().visibilityGrants ?? [];
  return grants.some(
    (g) => g.viewer === viewer && g.owner === owner && g.zones.includes(kind),
  );
}

/**
 * rule 424.1.a.3 — a card that "is revealed" is public information from the
 * moment it is revealed until the effect that revealed it finishes resolving.
 * The in-flight `reveal-and-pick` prompt IS that window (unl-139-219 Bone
 * Skewer: the WHOLE hand is shown even though only units may be picked), so
 * the visibility clears itself as soon as the prompt is answered — no
 * turn-scoped grant is recorded.
 */
export function isRevealedForPendingChoice(
  engine: HarnessEngine,
  viewer: Viewer,
  id: string,
): boolean {
  if (viewer === SPECTATOR) {
    return false;
  }
  const pending = engine.getState().pendingChoice;
  if (pending === undefined || pending.type !== "reveal-and-pick") {
    return false;
  }
  return pending.prompter === viewer && (pending.revealed as readonly string[]).includes(id);
}

export function summarizeDecision(d: Decision | null): DecisionSummary | null {
  if (!d) {
    return null;
  }
  return {
    context: d.kind === "action" ? d.context : undefined,
    id: d.id,
    kind: d.kind,
    prompt: d.prompt,
    seat: d.seat,
  };
}

export function zoneCards(engine: HarnessEngine, zone: string, owner?: Seat): string[] {
  const internal = getInternalState(engine);
  const z = internal.zones[zone];
  if (!z) {
    return [];
  }
  if (!owner) {
    return [...z.cardIds];
  }
  // rule 108.2: board presence follows CONTROL, not ownership — a card played
  // from an opponent's deck (ogn-025-298 Blind Fury) sits on the caster's side
  // while still being owned by its original player. Hidden/owned zones (hand,
  // deck, trash, banishment) stay owner-split.
  if (isBoardZone(zone)) {
    return z.cardIds.filter((id) => {
      const inst = internal.cards[id];
      return (inst?.controller ?? inst?.owner) === owner;
    });
  }
  return z.cardIds.filter((id) => internal.cards[id]?.owner === owner);
}

function isBoardZone(zone: string): boolean {
  return zone === "base" || zone.startsWith("battlefield-") || zone.startsWith("facedown-");
}

export function listZoneSummaries(engine: HarnessEngine, viewer: Viewer, forSeat?: Seat): ZoneSummary[] {
  const internal = getInternalState(engine);
  const out: ZoneSummary[] = [];
  const owners = Object.keys(engine.getState().players);
  for (const [zoneId, z] of Object.entries(internal.zones)) {
    if ((PER_PLAYER_ZONES as readonly string[]).includes(zoneId)) {
      for (const owner of owners) {
        if (forSeat && owner !== forSeat) {
          continue;
        }
        const count = z.cardIds.filter((id) => internal.cards[id]?.owner === owner).length;
        out.push({ count, owner, visible: canSee(viewer, zoneId, owner), zone: zoneId as ZoneKey });
      }
    } else {
      out.push({ count: z.cardIds.length, visible: !zoneId.startsWith("facedown-") || viewer === SPECTATOR, zone: zoneId as ZoneKey });
    }
  }
  return out;
}

export function viewCard(
  engine: HarnessEngine,
  viewer: Viewer,
  id: string,
  index: number,
  pool?: CardPool,
): CardView {
  const internal = getInternalState(engine);
  const inst = internal.cards[id];
  const owner = inst?.owner ?? "";
  const zone = (inst?.zone ?? "unknown") as ZoneKey;
  if (
    !canSee(viewer, zone, owner) &&
    !hasVisibilityGrant(engine, viewer, zone, owner) &&
    !isRevealedForPendingChoice(engine, viewer, id)
  ) {
    return { hidden: true, index, owner, zone };
  }
  return buildCardState(engine, id, pool);
}

export function observe(
  engine: HarnessEngine,
  viewer: Viewer,
  seq: number,
  decision: Decision | null,
  pool?: CardPool,
): Observation {
  const state = engine.getState();
  const internal = getInternalState(engine);
  const registry = getGlobalCardRegistry();

  const zones: Record<string, CardView[]> = {};
  for (const [zoneId, z] of Object.entries(internal.zones)) {
    zones[zoneId] = z.cardIds.map((id, idx) => viewCard(engine, viewer, id, idx, pool));
  }

  const battlefields: BattlefieldView[] = Object.values(state.battlefields ?? {}).map((bf) => ({
    contested: bf.contested,
    contestedBy: bf.contestedBy,
    controller: bf.controller,
    facedownCount: internal.zones[`facedown-${bf.id}`]?.cardIds.length ?? 0,
    id: bf.id,
    name: registry.get(bf.id)?.name ?? bf.id,
    units: zones[`battlefield-${bf.id}`] ?? [],
  }));

  const resources: Record<string, { energy: number; power: Record<string, number> }> = {};
  const points: Record<string, number> = {};
  for (const pid of Object.keys(state.players)) {
    const pool_ = state.runePools[pid];
    resources[pid] = { energy: pool_?.energy ?? 0, power: { ...(pool_?.power ?? {}) } as Record<string, number> };
    points[pid] = state.players[pid]?.victoryPoints ?? 0;
  }

  const chain = (state.interaction?.chain?.items ?? []).map((it) => {
    // rule 355.3 — a "Choose one —" item whose mode was chosen as it was played / finalized.
    const menu = it.effect as { type?: string; _chosenIndex?: unknown } | undefined;
    const mode = menu?.type === "choice" && typeof menu._chosenIndex === "number" ? menu._chosenIndex : undefined;
    return {
      cardId: it.cardId,
      controller: it.controller,
      countered: it.countered === true,
      id: it.id,
      ...(mode !== undefined ? { mode } : {}),
      name: registry.get(it.cardId)?.name ?? it.cardId,
      // rule 355.5 — the Game Objects chosen for it as it was played (public).
      ...(it.targets ? { targets: [...it.targets] } : {}),
      triggered: it.triggered === true,
      type: it.type,
    };
  });

  const visibleDecision =
    decision && (viewer === SPECTATOR || decision.seat === viewer) ? decision : summarizeDecision(decision);

  return {
    actingSeat: getActingSeat(state),
    battlefields,
    chain,
    decision: visibleDecision,
    points,
    resources,
    seq,
    state,
    status: state.status,
    turn: { activePlayer: state.turn.activePlayer, number: state.turn.number, phase: state.turn.phase },
    viewer,
    winner: state.winner,
    zones,
  };
}
