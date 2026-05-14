/**
 * Rules audit — `placeBattlefields` setup move zone-creation contract.
 *
 * Batch 14 sub-agent V regression test for T-M2 (monkey-rescan batch 13).
 *
 * Before the fix, `placeBattlefields` only wrote `state.battlefields[bfId]`
 * and moved the battlefield card into `battlefieldRow`. It did NOT create
 * the per-battlefield zones (`battlefield-<id>`, `facedown-<id>`) — so any
 * subsequent reducer that tried to `zones.moveCard({ targetZoneId:
 * "battlefield-bf-1" })` threw "Target zone battlefield-bf-1 does not
 * exist". This made `standardMove` (the universal "play a card from hand"
 * move) effectively unreachable in production — and hence blocked the
 * entire combat / conquer / score loop in the random-monkey runner.
 *
 * Fix: a new optional `ZoneOperations.createZone(config)` API in @tcg/core,
 * called from `placeBattlefields.reducer` once per battlefield id. Idempotent
 * (safe to re-call) and back-compat (test stubs may omit it).
 *
 * This file pins the GENERIC contract — it is independent of any specific
 * battlefield card / set, and uses only the shared rules-audit helpers.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { CardDefinitionRegistry, clearGlobalCardRegistry, setGlobalCardRegistry } from "../../operations/card-lookup";
import { RuleEngine } from "@tcg/core";
import { riftboundDefinition } from "../../game-definition/definition";
import type {
  RiftboundCardMeta,
  RiftboundGameState,
  RiftboundMoves,
} from "../../types";

const P1 = "player-1";
const P2 = "player-2";

interface EngineHandle {
  executeMove: (id: string, ctx: { params: Record<string, unknown>; playerId: string }) => unknown;
  getState: () => RiftboundGameState;
  internalState: {
    zones: Record<string, { cardIds: unknown[]; config: { id: string } } | undefined>;
  };
}

function buildEngine(battlefieldIds: string[]): EngineHandle {
  const registry = new CardDefinitionRegistry();
  for (const bfId of battlefieldIds) {
    registry.register(bfId, { cardType: "battlefield", id: bfId, name: bfId });
  }
  setGlobalCardRegistry(registry);

  return new RuleEngine<RiftboundGameState, RiftboundMoves, unknown, RiftboundCardMeta>(
    riftboundDefinition,
    [
      { id: P1, name: "P1" },
      { id: P2, name: "P2" },
    ],
    { seed: "place-battlefield-zones" },
  ) as unknown as EngineHandle;
}

describe("placeBattlefields zone-creation contract (batch 14 V)", () => {
  beforeEach(() => {
    clearGlobalCardRegistry();
  });
  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("creates `battlefield-<id>` zone for each placed battlefield", () => {
    const engine = buildEngine(["bf-1", "bf-2"]);
    engine.executeMove("placeBattlefields", {
      params: { battlefieldIds: ["bf-1", "bf-2"] },
      playerId: P1,
    });
    expect(engine.internalState.zones["battlefield-bf-1"]).toBeDefined();
    expect(engine.internalState.zones["battlefield-bf-2"]).toBeDefined();
    expect(engine.internalState.zones["battlefield-bf-1"]?.cardIds).toEqual([]);
    expect(engine.internalState.zones["battlefield-bf-2"]?.cardIds).toEqual([]);
  });

  test("creates paired `facedown-<id>` zone (rule 723) for each placed battlefield", () => {
    const engine = buildEngine(["bf-1", "bf-2"]);
    engine.executeMove("placeBattlefields", {
      params: { battlefieldIds: ["bf-1", "bf-2"] },
      playerId: P1,
    });
    expect(engine.internalState.zones["facedown-bf-1"]).toBeDefined();
    expect(engine.internalState.zones["facedown-bf-2"]).toBeDefined();
    expect(engine.internalState.zones["facedown-bf-1"]?.cardIds).toEqual([]);
    expect(engine.internalState.zones["facedown-bf-2"]?.cardIds).toEqual([]);
  });

  test("does not create zones for battlefields that were not placed", () => {
    const engine = buildEngine(["bf-1", "bf-2"]);
    engine.executeMove("placeBattlefields", {
      params: { battlefieldIds: ["bf-1"] },
      playerId: P1,
    });
    expect(engine.internalState.zones["battlefield-bf-1"]).toBeDefined();
    expect(engine.internalState.zones["battlefield-bf-2"]).toBeUndefined();
    expect(engine.internalState.zones["facedown-bf-2"]).toBeUndefined();
  });

  test("zone config is shaped correctly (id matches `battlefield-<id>`)", () => {
    const engine = buildEngine(["bf-1"]);
    engine.executeMove("placeBattlefields", {
      params: { battlefieldIds: ["bf-1"] },
      playerId: P1,
    });
    const zone = engine.internalState.zones["battlefield-bf-1"];
    expect(zone?.config.id).toBe("battlefield-bf-1");
    const facedown = engine.internalState.zones["facedown-bf-1"];
    expect(facedown?.config.id).toBe("facedown-bf-1");
  });

  test("idempotent — re-placing the same battlefield does not throw or duplicate", () => {
    const engine = buildEngine(["bf-1"]);
    engine.executeMove("placeBattlefields", {
      params: { battlefieldIds: ["bf-1"] },
      playerId: P1,
    });
    // Second call (should be a no-op for zones since they exist).
    expect(() =>
      engine.executeMove("placeBattlefields", {
        params: { battlefieldIds: ["bf-1"] },
        playerId: P1,
      }),
    ).not.toThrow();
    expect(engine.internalState.zones["battlefield-bf-1"]).toBeDefined();
  });
});
