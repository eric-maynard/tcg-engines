/**
 * Server UI snapshot (`window.__rbGameState`, apps/riftbound-app/server/snapshot.ts
 * buildGameSnapshot) + `__rbAvailableMoves` → the shapes L1/L2 consume:
 *
 *  - `toGameState()`      public RiftboundGameState (missing bookkeeping fields defaulted)
 *  - `toInternalView()`   zones / cards / cardMetas like RuleEngine.internalState
 *  - `SnapshotEngine`     a read-only façade with getState()/internalState/enumerateMoves()
 *                         so observation.ts / card-state.ts / game.ts helpers run unchanged
 *  - `browserDecisionContext()` the DecisionContext for decision.ts
 *
 * Hidden cards: outside sandbox the server already replaces other players'
 * hand/deck cards with `hidden-<zone>-<owner>-<i>` stubs (definitionId "");
 * they are kept as instances (so counts are right) and the harness redaction
 * in observation.ts hides them again per viewer. In sandbox the snapshot is
 * omniscient and the harness applies the per-seat redaction itself.
 */

import type { PlayerId } from "@tcg/core";
import type { CardDefinitionRegistry } from "../../operations/card-lookup";
import type { RiftboundCardMeta, RiftboundGameState } from "../../types";
import { toLookupPayload } from "../card-pool";
import type { DecisionContext } from "../decision";
import { cardLabel } from "../card-state";
import type { HarnessEngine, InternalCard, InternalView, InternalZone } from "../internal";
import { canonicalJson, fnv1a } from "../internal";
import type { CardPool, FlatMove, Seat } from "../types";

// ---------------------------------------------------------------------------
// Wire shapes
// ---------------------------------------------------------------------------

export interface UiCard {
  readonly id: string;
  readonly definitionId: string;
  readonly owner: string;
  readonly controller: string;
  readonly name: string;
  readonly cardType: string;
  readonly energyCost?: number;
  readonly powerCost?: readonly string[];
  readonly might?: number;
  readonly domain?: unknown;
  readonly rulesText?: string;
  readonly meta?: Readonly<Record<string, unknown>>;
}

export interface UiSnapshot {
  readonly gameId?: string;
  readonly status: RiftboundGameState["status"];
  readonly winner?: string;
  readonly victoryScore?: number;
  readonly turn: RiftboundGameState["turn"];
  readonly players: RiftboundGameState["players"];
  readonly runePools: RiftboundGameState["runePools"];
  readonly battlefields: RiftboundGameState["battlefields"];
  readonly zones: Readonly<Record<string, readonly UiCard[]>>;
  readonly interaction?: RiftboundGameState["interaction"] & { showdown?: unknown };
  readonly pendingChoice?: RiftboundGameState["pendingChoice"];
  readonly setup?: RiftboundGameState["setup"];
  readonly playerNames?: Readonly<Record<string, string>>;
  readonly canUndo?: boolean;
  readonly log?: readonly { text: string; timestamp?: number; key?: string }[];
  readonly [extra: string]: unknown;
}

export interface UiMove {
  readonly moveId: string;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly playerId?: string;
}

/** Meta of one inbound WS frame as recorded by the page tap / client hook. */
export interface FrameMeta {
  readonly type: string;
  readonly seq?: number;
  readonly requestId?: string;
  readonly error?: string;
  readonly errorCode?: string;
  readonly moveId?: string;
  readonly playerId?: string;
  readonly at?: number;
  readonly inferred?: boolean;
}

/** What READ_FRAME returns from the page. */
export interface PageRead {
  readonly seq: number;
  readonly state: UiSnapshot;
  readonly moves: readonly UiMove[];
  readonly viewingPlayer: string;
  readonly gameId: string;
  readonly sandbox: boolean;
  readonly last: FrameMeta | null;
  readonly frameCount: number;
  readonly requestCounter: number;
  readonly wsOpen: boolean;
  readonly pregame: unknown;
  readonly interactionMode: string | null;
}

/** The backend's cached "latest known frame". */
export interface BrowserFrame {
  readonly seq: number;
  readonly snapshot: UiSnapshot;
  readonly viewingPlayer: Seat;
  readonly gameId: string;
  readonly sandbox: boolean;
  /** Legal moves per seat (viewing seat from the page; others fetched via REST in sandbox). */
  readonly movesBySeat: Readonly<Record<Seat, readonly FlatMove[]>>;
  readonly last: FrameMeta | null;
  readonly readAt: number;
}

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

export function toFlatMoves(moves: readonly UiMove[], seat: Seat): FlatMove[] {
  return moves.map((m) => ({
    moveId: m.moveId,
    params: (m.params ?? {}) as Record<string, unknown>,
    playerId: (m.playerId as string | undefined) ?? seat,
  }));
}

export function toGameState(s: UiSnapshot): RiftboundGameState {
  const players = Object.keys(s.players ?? {});
  const perPlayer = <T>(v: T): Record<string, T> => Object.fromEntries(players.map((p) => [p, v]));
  const interaction = s.interaction
    ? {
        chain: (s.interaction as { chain?: unknown }).chain ?? null,
        nextChainItemId: (s.interaction as { nextChainItemId?: number }).nextChainItemId ?? 1,
        showdownStack: (s.interaction as { showdownStack?: unknown[] }).showdownStack ?? [],
      }
    : undefined;
  const state = {
    battlefields: s.battlefields ?? {},
    cardsPlayedThisTurn: perPlayer(0),
    conqueredThisTurn: perPlayer([] as string[]),
    gameId: s.gameId ?? "browser",
    interaction,
    pendingChoice: s.pendingChoice,
    players: s.players ?? {},
    runePools: s.runePools ?? {},
    scoredThisTurn: perPlayer([] as string[]),
    setup: s.setup,
    status: s.status,
    turn: s.turn,
    unitsMovedThisTurn: perPlayer(0),
    victoryScore: s.victoryScore ?? 8,
    winner: s.winner,
    xpGainedThisTurn: perPlayer(0),
  };
  return state as unknown as RiftboundGameState;
}

const PER_PLAYER = new Set(["hand", "base", "trash", "banishment", "mainDeck", "runeDeck", "runePool", "legendZone", "championZone"]);

function zoneConfig(zoneId: string): InternalZone["config"] {
  if (zoneId.startsWith("facedown-")) {
    return { faceDown: true, id: zoneId, maxSize: 1, name: zoneId, ordered: false, visibility: "private" };
  }
  if (zoneId === "hand") {
    return { id: zoneId, name: zoneId, ordered: false, visibility: "private" };
  }
  if (zoneId === "mainDeck" || zoneId === "runeDeck") {
    return { faceDown: true, id: zoneId, name: zoneId, ordered: true, visibility: "secret" };
  }
  return { id: zoneId, name: zoneId, ordered: PER_PLAYER.has(zoneId) ? false : zoneId === "chain", visibility: "public" };
}

export function toInternalView(s: UiSnapshot): InternalView {
  const zones: Record<string, InternalZone> = {};
  const cards: Record<string, InternalCard> = {};
  const cardMetas: Record<string, RiftboundCardMeta & Record<string, unknown>> = {};
  for (const [zoneId, list] of Object.entries(s.zones ?? {})) {
    zones[zoneId] = { cardIds: list.map((c) => c.id), config: zoneConfig(zoneId) };
    list.forEach((c, position) => {
      cards[c.id] = {
        controller: c.controller || c.owner,
        definitionId: c.definitionId ?? "",
        owner: c.owner,
        position,
        zone: zoneId,
      };
      const meta = { buffed: false, combatRole: null, damage: 0, exhausted: false, hidden: false, stunned: false, ...(c.meta ?? {}) };
      cardMetas[c.id] = meta as unknown as RiftboundCardMeta & Record<string, unknown>;
    });
  }
  return { cardMetas, cards, zones };
}

/**
 * Register every snapshot card in `registry` (instance id → definition from
 * the pool; token / unknown defs get a stub from the snapshot's own fields).
 * Returns the number of newly registered ids.
 */
export function registerSnapshotCards(registry: CardDefinitionRegistry, s: UiSnapshot, pool?: CardPool): number {
  let added = 0;
  for (const list of Object.values(s.zones ?? {})) {
    for (const c of list) {
      if (!c.id || c.id.startsWith("hidden-") || registry.get(c.id)) {
        continue;
      }
      const def = c.definitionId ? pool?.get(c.definitionId) : undefined;
      if (def) {
        const isRune = def.cardType === "rune";
        registry.register(c.id, toLookupPayload(def, c.id, isRune ? { cardType: "rune", energyCost: 0 } : undefined));
      } else {
        registry.register(c.id, {
          abilities: [],
          cardType: c.cardType as never,
          domain: c.domain as string | string[] | undefined,
          energyCost: c.energyCost,
          id: c.id,
          might: c.might,
          name: c.name ?? c.definitionId ?? c.id,
          powerCost: c.powerCost ? [...c.powerCost] : undefined,
        } as Parameters<CardDefinitionRegistry["register"]>[1]);
      }
      added += 1;
    }
  }
  return added;
}

// ---------------------------------------------------------------------------
// Engine façade
// ---------------------------------------------------------------------------

/**
 * Read-only stand-in for RuleEngine over one BrowserFrame. Satisfies what
 * observation.ts / card-state.ts / game.ts read (`getState()`,
 * `internalState`, `enumerateMoves()`); anything that would mutate throws.
 */
export class SnapshotEngine {
  readonly internalState: InternalView;
  private readonly state: RiftboundGameState;
  private readonly frame: BrowserFrame;

  constructor(frame: BrowserFrame) {
    this.frame = frame;
    this.state = toGameState(frame.snapshot);
    this.internalState = toInternalView(frame.snapshot);
  }

  getState(): RiftboundGameState {
    return this.state;
  }

  legal(seat: Seat, moveIds?: readonly string[]): FlatMove[] {
    const all = this.frame.movesBySeat[seat] ?? [];
    return moveIds ? all.filter((m) => moveIds.includes(m.moveId)) : [...all];
  }

  enumerateMoves(
    playerId: PlayerId | string,
    opts: { moveIds?: readonly string[]; validOnly?: boolean } = {},
  ): { moveId: string; params: Record<string, unknown>; playerId: string; isValid: boolean }[] {
    return this.legal(playerId as string, opts.moveIds).map((m) => ({
      isValid: true,
      moveId: m.moveId,
      params: { ...m.params },
      playerId: m.playerId,
    }));
  }

  canExecuteMove(moveId: string, opts: { params: Record<string, unknown>; playerId: string }): boolean {
    const want = canonicalJson(opts.params);
    return this.legal(opts.playerId, [moveId]).some((m) => canonicalJson(m.params) === want);
  }

  executeMove(): never {
    throw new Error("SnapshotEngine is read-only: act through BrowserBackend.act()");
  }

  getFlowManager(): undefined {
    return undefined;
  }

  getReplayHistory(): readonly unknown[] {
    return [];
  }

  asHarnessEngine(): HarnessEngine {
    return this as unknown as HarnessEngine;
  }
}

export function browserDecisionContext(engine: SnapshotEngine, seq: number, autoProcedures: boolean): DecisionContext {
  return {
    autoProcedures,
    // No probe channel: X ranges fall back to pool energy (decision.ts probeMaxX).
    canExecute: undefined,
    label: (card) => cardLabel(engine.asHarnessEngine(), card),
    legal: (seat, moveIds) => engine.legal(seat, moveIds),
    seq,
    state: engine.getState(),
  };
}

/** Position hash over the UI snapshot (NOT comparable with EngineBackend hashes). */
export function frameHash(frame: BrowserFrame): string {
  const { log: _log, canUndo: _canUndo, gameId: _gameId, playerNames: _names, zones, ...rest } = frame.snapshot;
  const zoneIds: Record<string, string[]> = {};
  const metas: Record<string, unknown> = {};
  for (const [z, list] of Object.entries(zones ?? {})) {
    zoneIds[z] = list.map((c) => c.id);
    for (const c of list) {
      metas[c.id] = c.meta ?? {};
    }
  }
  return fnv1a(canonicalJson({ metas, state: rest, zones: zoneIds }));
}
