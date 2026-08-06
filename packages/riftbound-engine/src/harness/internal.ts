/**
 * The ONE place the harness reaches into RuleEngine privates.
 *
 * Zones / card instances / metas are not part of `getState()`; until core
 * grows a sanctioned TestAccess port every consumer casts. Keep the cast here.
 */

import type { RuleEngine } from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../types";

export type HarnessEngine = RuleEngine<RiftboundGameState, RiftboundMoves, unknown, RiftboundCardMeta>;

export interface InternalCard {
  definitionId: string;
  owner: string;
  controller: string;
  zone: string;
  position?: number;
}

export interface InternalZone {
  config: {
    id?: string;
    name?: string;
    visibility?: string;
    faceDown?: boolean;
    ordered?: boolean;
    maxSize?: number;
    owner?: string;
  };
  cardIds: string[];
}

export interface InternalView {
  zones: Record<string, InternalZone>;
  cards: Record<string, InternalCard>;
  cardMetas: Record<string, RiftboundCardMeta & Record<string, unknown>>;
}

export function getInternalState(engine: HarnessEngine): InternalView {
  return (engine as unknown as { internalState: InternalView }).internalState;
}

/** Swap the engine's (Immer-frozen) currentState. Setup only. */
export function replaceCurrentState(engine: HarnessEngine, next: RiftboundGameState): void {
  (engine as unknown as { currentState: RiftboundGameState }).currentState = next;
}

export function peekCurrentState(engine: HarnessEngine): RiftboundGameState {
  return (engine as unknown as { currentState: RiftboundGameState }).currentState;
}

/** Deep, detached snapshot of everything that defines the position. */
export interface FullSnapshot {
  readonly state: RiftboundGameState;
  readonly zones: Record<string, string[]>;
  readonly cards: Record<string, InternalCard>;
  readonly metas: Record<string, Record<string, unknown>>;
}

export function takeSnapshot(engine: HarnessEngine): FullSnapshot {
  const internal = getInternalState(engine);
  const zones: Record<string, string[]> = {};
  for (const [id, z] of Object.entries(internal.zones)) {
    zones[id] = [...z.cardIds];
  }
  return {
    cards: structuredClone(internal.cards),
    metas: structuredClone(internal.cardMetas) as Record<string, Record<string, unknown>>,
    state: engine.getState(),
    zones,
  };
}

/** Canonical JSON: object keys sorted, undefined dropped. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) {
        out[key] = sortKeys(v);
      }
    }
    return out;
  }
  return value;
}

/** FNV-1a 32-bit over a string, hex. Not cryptographic — a change detector. */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function hashSnapshot(snap: FullSnapshot): string {
  const { gameId: _gameId, ...rest } = snap.state as RiftboundGameState & { gameId?: string };
  return fnv1a(canonicalJson({ cards: snap.cards, metas: snap.metas, state: rest, zones: snap.zones }));
}

export function hashEngine(engine: HarnessEngine): string {
  return hashSnapshot(takeSnapshot(engine));
}
