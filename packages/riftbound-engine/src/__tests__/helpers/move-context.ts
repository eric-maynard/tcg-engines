/**
 * Shared mock move-context builder for engine tests.
 *
 * Several bugfix/regression test files (`monkey-test-bugfixes.test.ts`,
 * `visual-monkey-bugfixes-2.test.ts`, etc) need to call enumerators and
 * reducers directly. The full `MoveContext` / `MoveEnumerationContext`
 * surface from `@tcg/core` is wide and drifts as fields get added.
 *
 * This helper centralizes the mock so each test file doesn't duplicate
 * a ~100-line context literal that silently rots.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  MoveContext,
  MoveEnumerationContext,
} from "@tcg/core";

import type { RiftboundCardMeta, RiftboundGameState } from "../../types";

export const HELPER_P1 = "player-1";
export const HELPER_P2 = "player-2";

/**
 * Build a default `RiftboundGameState` suitable for direct enumerator/reducer
 * calls in tests. Callers can override any top-level field.
 */
export function createMockMoveState(
  overrides?: Partial<RiftboundGameState>,
): RiftboundGameState {
  return {
    battlefields: {
      "bf-1": { contested: false, controller: null, id: "bf-1" },
      "bf-2": { contested: false, controller: null, id: "bf-2" },
    },
    conqueredThisTurn: { [HELPER_P1]: [], [HELPER_P2]: [] },
    gameId: "test-mock-context",
    players: {
      [HELPER_P1]: { id: HELPER_P1, victoryPoints: 0, xp: 0 },
      [HELPER_P2]: { id: HELPER_P2, victoryPoints: 0, xp: 0 },
    },
    runePools: {
      [HELPER_P1]: { energy: 10, power: {} },
      [HELPER_P2]: { energy: 10, power: {} },
    },
    scoredThisTurn: { [HELPER_P1]: [], [HELPER_P2]: [] },
    status: "playing",
    turn: { activePlayer: HELPER_P1, number: 1, phase: "main" },
    victoryScore: 8,
    xpGainedThisTurn: { [HELPER_P1]: 0, [HELPER_P2]: 0 },
    ...overrides,
  } as RiftboundGameState;
}

export interface MockCardEntry {
  owner: string;
  zone: string;
  meta?: Partial<RiftboundCardMeta>;
}

export type MockMoveContext = MoveEnumerationContext<RiftboundCardMeta, unknown> &
  MoveContext<Record<string, unknown>, RiftboundCardMeta, unknown>;

export interface CreateMockMoveContextResult {
  cardStore: Map<string, { owner: string; zone: string }>;
  context: MockMoveContext;
  counterStore: Map<string, Record<string, number>>;
  flagStore: Map<string, Record<string, boolean>>;
  metaStore: Map<string, Partial<RiftboundCardMeta>>;
  zoneContents: Map<string, string[]>;
}

/**
 * Build a fully-typed mock `MoveContext & MoveEnumerationContext` for direct
 * enumerator/reducer tests. The returned `context` is cast through `unknown`
 * to the union type — call sites can spread additional fields (e.g.
 * `params`, `playerId`) when invoking enumerators.
 */
export function createMockMoveContext(
  _state: RiftboundGameState,
  cards: Record<string, MockCardEntry>,
  options: { playerId?: string } = {},
): CreateMockMoveContextResult {
  const cardStore = new Map<string, { owner: string; zone: string }>();
  const zoneContents = new Map<string, string[]>();
  const metaStore = new Map<string, Partial<RiftboundCardMeta>>();
  const flagStore = new Map<string, Record<string, boolean>>();
  const counterStore = new Map<string, Record<string, number>>();

  for (const [id, data] of Object.entries(cards)) {
    cardStore.set(id, { owner: data.owner, zone: data.zone });
    metaStore.set(id, data.meta ?? {});
    const existing = zoneContents.get(data.zone) ?? [];
    existing.push(id);
    zoneContents.set(data.zone, existing);
  }

  const playerId = (options.playerId ?? HELPER_P1) as CorePlayerId;

  const context = ({
    cards: {
      getCardMeta: ((cardId: string) => metaStore.get(cardId) ?? {}) as unknown as (
        cardId: CoreCardId,
      ) => Partial<RiftboundCardMeta>,
      getCardOwner: ((cardId: string) => cardStore.get(cardId)?.owner) as unknown as (
        cardId: CoreCardId,
      ) => string | undefined,
      updateCardMeta: ((cardId: string, meta: Partial<RiftboundCardMeta>) => {
        const existing = metaStore.get(cardId) ?? {};
        metaStore.set(cardId, { ...existing, ...meta });
      }) as unknown as (cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => void,
    },
    counters: {
      addCounter: ((cardId: string, counter: string, amount: number) => {
        const existing = counterStore.get(cardId) ?? {};
        existing[counter] = (existing[counter] ?? 0) + amount;
        counterStore.set(cardId, existing);
      }) as unknown as (cardId: CoreCardId, type: string, amount: number) => void,
      clearCounter: (() => {}) as unknown as (cardId: CoreCardId, type: string) => void,
      getFlag: ((cardId: string, flag: string) =>
        flagStore.get(cardId)?.[flag] ?? false) as unknown as (
        cardId: CoreCardId,
        flag: string,
      ) => boolean,
      removeCounter: (() => {}) as unknown as (
        cardId: CoreCardId,
        type: string,
        amount: number,
      ) => void,
      setFlag: ((cardId: string, flag: string, value: boolean) => {
        const existing = flagStore.get(cardId) ?? {};
        existing[flag] = value;
        flagStore.set(cardId, existing);
      }) as unknown as (cardId: CoreCardId, flag: string, value: boolean) => void,
    },
    endGame: undefined as
      | ((opts: { winner: CorePlayerId; reason: string; metadata: unknown }) => void)
      | undefined,
    params: {} as Record<string, unknown>,
    playerId,
    zones: {
      drawCards: (() => []) as unknown as (params: {
        count: number;
        from: CoreZoneId;
        to: CoreZoneId;
        playerId: CorePlayerId;
      }) => CoreCardId[],
      getCardZone: ((cardId: string) => cardStore.get(cardId)?.zone) as unknown as (
        cardId: CoreCardId,
      ) => string | undefined,
      getCardsInZone: ((zoneId: string, ownerPlayerId?: string) => {
        if (ownerPlayerId) {
          const all = zoneContents.get(zoneId) ?? [];
          return all.filter((id) => cardStore.get(id)?.owner === ownerPlayerId);
        }
        return [...(zoneContents.get(zoneId) ?? [])];
      }) as unknown as (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[],
      moveCard: ((params: { cardId: string; targetZoneId: string }) => {
        const { cardId, targetZoneId } = params;
        for (const [_zone, zCards] of zoneContents) {
          const idx = zCards.indexOf(cardId);
          if (idx !== -1) {
            zCards.splice(idx, 1);
            break;
          }
        }
        const target = zoneContents.get(targetZoneId) ?? [];
        target.push(cardId);
        zoneContents.set(targetZoneId, target);
        const card = cardStore.get(cardId);
        if (card) {
          card.zone = targetZoneId;
        }
      }) as unknown as (params: { cardId: CoreCardId; targetZoneId: CoreZoneId }) => void,
      shuffleZone: (() => {}) as unknown as (
        zoneId: CoreZoneId,
        playerId?: CorePlayerId,
      ) => void,
    },
  } as unknown) as MockMoveContext;

  return {
    cardStore,
    context,
    counterStore,
    flagStore,
    metaStore,
    zoneContents,
  };
}
