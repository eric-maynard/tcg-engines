/**
 * rule-id: ven-031-166 (Twilight Shroud) — "It can't be chosen by enemy spells
 * and abilities this turn" must parse to a turn-scoped Untargetable grant and
 * the target resolver must drop such units from ENEMY choices only.
 */

import { afterEach, describe, expect, test } from "bun:test";
import type { TargetResolverContext } from "../abilities/target-resolver";
import { resolveTarget } from "../abilities/target-resolver";
import {
  CardDefinitionRegistry,
  clearGlobalCardRegistry,
  setGlobalCardRegistry,
} from "../operations/card-lookup";
import type { RiftboundGameState } from "../types";

function mockState(): RiftboundGameState {
  return {
    battlefields: {},
    conqueredThisTurn: {},
    gameId: "t",
    players: { p1: { id: "p1", victoryPoints: 0 }, p2: { id: "p2", victoryPoints: 0 } },
    runePools: { p1: { energy: 0, power: {} }, p2: { energy: 0, power: {} } },
    scoredThisTurn: {},
    status: "playing",
    turn: { activePlayer: "p1", number: 1, phase: "main" },
    victoryScore: 8,
  };
}

function ctxFor(
  playerId: string,
  metas: Record<string, Record<string, unknown>>,
  extra: Partial<TargetResolverContext> = {},
): TargetResolverContext {
  const loc: Record<string, { zone: string; owner: string }> = {
    shrouded: { owner: "p1", zone: "base" },
    plain: { owner: "p1", zone: "base" },
  };
  return {
    cards: {
      getCardMeta: ((id: string) => metas[id]) as never,
      getCardOwner: ((id: string) => loc[id]?.owner) as never,
    },
    draft: mockState(),
    playerId,
    sourceCardId: "src",
    zones: {
      getCardZone: ((id: string) => loc[id]?.zone) as never,
      getCardsInZone: ((zoneId: string, pid?: string) =>
        Object.entries(loc)
          .filter(([, d]) => d.zone === zoneId && (!pid || d.owner === pid))
          .map(([id]) => id)) as never,
    },
    ...extra,
  };
}

describe("ven-031-166 Twilight Shroud — can't be chosen by enemy spells/abilities", () => {
  afterEach(() => clearGlobalCardRegistry());

  test("parser emits a turn-scoped Untargetable grant on the chosen unit", async () => {
    const { getAllCards } = await import("../../../riftbound-cards/src/data/all-cards");
    const card = getAllCards().find((c) => c.id === "ven-031-166");
    const spell = card?.abilities?.find((a) => a.type === "spell") as
      | { effect?: { type?: string; effects?: Record<string, unknown>[] } }
      | undefined;
    expect(spell?.effect?.type).toBe("sequence");
    expect(spell?.effect?.effects?.[1]).toMatchObject({
      duration: "turn",
      keyword: "Untargetable",
      type: "grant-keyword",
    });
  });

  test("enemy chooser cannot pick the shrouded unit; its controller still can; 'all' sweeps still hit it", () => {
    const registry = new CardDefinitionRegistry();
    registry.register("shrouded", { cardType: "unit", id: "shrouded", might: 2, name: "S" });
    registry.register("plain", { cardType: "unit", id: "plain", might: 2, name: "P" });
    setGlobalCardRegistry(registry);
    const metas = {
      shrouded: { grantedKeywords: [{ duration: "turn", keyword: "Untargetable" }] },
    };

    expect(resolveTarget({ quantity: "all", type: "unit" }, ctxFor("p2", metas, { choosing: true }))).toEqual([
      "plain",
    ]);
    expect(resolveTarget({ type: "unit" }, ctxFor("p2", metas))).toEqual(["plain"]);
    expect(
      resolveTarget({ quantity: "all", type: "unit" }, ctxFor("p1", metas, { choosing: true })).sort(),
    ).toEqual(["plain", "shrouded"]);
    // Programmatic "all enemy units" is not a choice — still includes it.
    expect(
      resolveTarget({ controller: "enemy", quantity: "all", type: "unit" }, ctxFor("p2", metas)).sort(),
    ).toEqual(["plain", "shrouded"]);
  });
});
