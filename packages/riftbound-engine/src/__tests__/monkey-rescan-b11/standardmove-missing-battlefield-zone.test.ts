/**
 * Monkey-rescan finding — batch 13 random-monkey.
 *
 * After the `awaken-unexhaust-flag-storage` fix re-enabled
 * `standardMove` enumeration, the monkey produced ~12 rejected moves per
 * seed of the form:
 *
 *   `"error":"Target zone battlefield-bf-1 does not exist"`
 *   `"errorCode":"EXECUTION_ERROR"`
 *
 * Root cause: the production `placeBattlefields` setup move (in
 * `game-definition/moves/setup.ts`) initializes `draft.battlefields[bfId]`
 * but does NOT create the corresponding `battlefield-<bfId>` zone in
 * `state.zones`. The `standardMove` reducer then calls
 * `zones.moveCard({ targetZoneId: "battlefield-bf-1" })`, which the core
 * `operations-impl.ts#moveCard` blocks with a hard throw: "Target zone
 * battlefield-bf-1 does not exist". Result: enumerator says the move is
 * legal (condition passes), but execution always fails — the entire
 * combat / scoring loop is unreachable for production-shaped state.
 *
 * The audit helper `createBattlefield()` correctly creates the
 * `battlefield-<id>` zone in `internalState.zones`, which is why all
 * existing rule-audit tests work. Production setup has the gap.
 *
 * Fix design (deferred — touches setup invariants):
 *
 *   1. `placeBattlefields.reducer` should additionally create the
 *      per-battlefield zone via a `state.zones[bfZoneId] = { cardIds: [],
 *      config: { id: bfZoneId, name: ..., faceDown: false, ordered: false,
 *      visibility: "public" } }` write. The same routine should also
 *      create the paired `facedown-<id>` zone (rule 723), mirroring
 *      `createBattlefield()`'s pattern.
 *   2. ALTERNATIVELY: lazy-create the battlefield zone in
 *      `standardMove.reducer` (and `contestBattlefield.reducer`, and any
 *      other site that moves a card to a `battlefield-*` zone) before the
 *      `moveCard` call. Easier to land but spreads the fix across N call
 *      sites.
 *   3. The proper layered fix is option 1, gated behind a test that
 *      asserts: after `placeBattlefields(["bf-1","bf-2"])`, the engine's
 *      `state.zones` contains `battlefield-bf-1`, `battlefield-bf-2`,
 *      `facedown-bf-1`, and `facedown-bf-2`. We lock that contract as
 *      `test.todo` here.
 *
 * Locked as `test.todo` because the fix requires either:
 *   - Mutating `state.zones` from inside a move reducer (the core
 *     zone-operations bag in `operations-impl.ts` has no public
 *     `createZone`; the standard pattern would be a new operation), OR
 *   - Pushing the zone-creation invariant up into `placeBattlefields`
 *     where the same draft-mutation pattern still applies.
 *
 * Either way, the change is broader than a single test fixture (it
 * affects the bot harness, the eval suite, the bridge's
 * scenario-builder, etc.) so we surface the gap with a regression test
 * and let batch 14 pick the right layer.
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

function buildEngine(): unknown {
  const registry = new CardDefinitionRegistry();
  // 1 unit per player + 12 runes per player + 2 battlefield card defs.
  for (const pid of [P1, P2]) {
    registry.register(`${pid}-card-0`, {
      cardType: "unit",
      energyCost: 0,
      id: `${pid}-card-0`,
      keywords: [],
      might: 2,
      name: `Unit-${pid}`,
    });
    for (let i = 0; i < 12; i++) {
      registry.register(`${pid}-rune-${i}`, {
        cardType: "rune",
        energyCost: 0,
        id: `${pid}-rune-${i}`,
        keywords: [],
        name: `Rune-${i}`,
      });
    }
  }
  registry.register("bf-1", { cardType: "battlefield", id: "bf-1", name: "BF1" });
  registry.register("bf-2", { cardType: "battlefield", id: "bf-2", name: "BF2" });
  setGlobalCardRegistry(registry);

  return new RuleEngine<RiftboundGameState, RiftboundMoves, unknown, RiftboundCardMeta>(
    riftboundDefinition,
    [
      { id: P1, name: "P1" },
      { id: P2, name: "P2" },
    ],
    { seed: "missing-bf-zone" },
  );
}

describe("standardMove vs missing battlefield zone (monkey finding)", () => {
  beforeEach(() => {
    // Registry is set per-test in buildEngine; clear any prior global.
    clearGlobalCardRegistry();
  });
  afterEach(() => {
    clearGlobalCardRegistry();
  });

  // Batch 14 V fix: placeBattlefields now creates the per-battlefield zones
  // Via the new optional `ZoneOperations.createZone` API. T's `test.todo`
  // Contract is now satisfied — flipping it to a positive assertion.
  test("rule + invariant — placeBattlefields creates the corresponding battlefield-* and facedown-* zones in state.zones (batch 14 fix)", () => {
    const engine = buildEngine() as {
      executeMove: (id: string, ctx: { params: Record<string, unknown>; playerId: string }) => unknown;
      getState: () => RiftboundGameState;
    };
    engine.executeMove("placeBattlefields", {
      params: { battlefieldIds: ["bf-1", "bf-2"] },
      playerId: P1,
    });
    const internal = (engine as unknown as {
      internalState: {
        zones: Record<string, { cardIds: unknown[]; config: { id: string } } | undefined>;
      };
    }).internalState;
    // Per-battlefield zones now exist.
    expect(internal.zones["battlefield-bf-1"]).toBeDefined();
    expect(internal.zones["battlefield-bf-2"]).toBeDefined();
    expect(internal.zones["battlefield-bf-1"]?.cardIds).toEqual([]);
    expect(internal.zones["battlefield-bf-2"]?.cardIds).toEqual([]);
    // Paired facedown zones (rule 723) are also created.
    expect(internal.zones["facedown-bf-1"]).toBeDefined();
    expect(internal.zones["facedown-bf-2"]).toBeDefined();
    // And the battlefield state entries are still created.
    expect(engine.getState().battlefields["bf-1"]).toBeDefined();
    expect(engine.getState().battlefields["bf-2"]).toBeDefined();
  });
});
