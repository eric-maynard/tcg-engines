/**
 * Monkey-rescan finding — batch 13 random-monkey.
 *
 * Random monkey produced 30 seeds × 41 turns of gameplay with ZERO
 * `standardMove` / `conquerBattlefield` / `contestBattlefield` enumerations.
 * Root cause: the awaken phase's "ready your units" sweep wrote to
 * `meta.exhausted` (a property), while every other site in the engine
 * (`playUnit`, `standardMove`, the `exhaust`/`ready` effects, etc.) writes
 * the exhausted state via `counters.setFlag(cardId, "exhausted", …)`, which
 * the core counters bag stores under `meta.__flags.exhausted` — a DIFFERENT
 * field.
 *
 * Result: a unit played via `playUnit` got `__flags.exhausted = true` on
 * entry (correct), but awaken's ready-sweep cleared only `meta.exhausted`
 * (which was never set to begin with), leaving the unit permanently
 * exhausted. `standardMove`'s legality check
 * (`context.counters.getFlag("exhausted")` → reads `__flags.exhausted`)
 * always saw the unit as exhausted, so the move was never enumerated.
 *
 * Fix (generic, no per-card ifs):
 *
 *   1. In `riftbound-flow.ts#buildFlowCounters.setFlag`, write the flag to
 *      `meta.__flags[flag]` (the core counters storage) instead of
 *      `meta[flag]` directly — unifies the read/write contract with the
 *      core operations-impl bag.
 *   2. In the awaken phase's ready-sweep, ALSO clear
 *      `__flags.exhausted` via the flow-counters setFlag (additive — keep
 *      the legacy `meta.exhausted` clear in place for any code path that
 *      still writes to the property directly).
 *
 * Both fixes ship together; this test locks the contract.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { CardDefinitionRegistry, clearGlobalCardRegistry, setGlobalCardRegistry } from "../../operations/card-lookup";
import {
  P1,
  createBattlefield,
  createCard,
  createMinimalGameState,
  runPhaseHook,
} from "../rules-audit/helpers";

describe("Awaken phase clears the canonical __flags.exhausted (monkey finding)", () => {
  let registry: CardDefinitionRegistry;
  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });
  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("an exhausted unit in base whose flag was set via the counter bag is unflagged at the start of its owner's awaken", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "awaken" });
    createBattlefield(engine, "bf-1", { controller: null });
    // A unit entered via `playUnit`-style storage: the exhausted state lives
    // In `meta.__flags.exhausted`, not `meta.exhausted`.
    createCard(engine, "u1", {
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });

    // Simulate the playUnit-time flag write via the core counters storage
    // Shape. We poke the internal meta directly because the audit harness
    // Doesn't expose `counters.setFlag` outside a move execution.
    const internal = (engine as unknown as {
      internalState: {
        cardMetas: Record<string, { __flags?: Record<string, boolean> }>;
      };
    }).internalState;
    internal.cardMetas["u1"] = { __flags: { exhausted: true } };

    // Pre-condition: the flag-canonical "exhausted" is set.
    expect(internal.cardMetas["u1"]?.__flags?.exhausted).toBe(true);

    // Fire the awaken onBegin hook for P1.
    runPhaseHook(engine, "awaken", "onBegin");

    // The flag MUST be cleared (or, equivalently, the __flags bag was
    // Replaced without an exhausted entry).
    const after = internal.cardMetas["u1"];
    expect(after?.__flags?.exhausted ?? false).toBe(false);
  });

  test("an exhausted unit at a battlefield (controller=P1, owner=P1) is unflagged at awaken too", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "awaken" });
    createBattlefield(engine, "bf-1", { controller: P1 });
    createCard(engine, "u-bf", {
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    const internal = (engine as unknown as {
      internalState: { cardMetas: Record<string, { __flags?: Record<string, boolean> }> };
    }).internalState;
    internal.cardMetas["u-bf"] = { __flags: { exhausted: true } };

    runPhaseHook(engine, "awaken", "onBegin");

    expect(internal.cardMetas["u-bf"]?.__flags?.exhausted ?? false).toBe(false);
  });

  test("legacy `meta.exhausted` path is still cleared (back-compat)", () => {
    // Some legacy/setup paths set `meta.exhausted` directly rather than
    // Through the counters bag. The old awaken code already handled this;
    // We pin it here so a future refactor that drops the direct-property
    // Path is forced to surface the contract change in this test.
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "awaken" });
    createBattlefield(engine, "bf-1", { controller: null });
    createCard(engine, "u2", {
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });
    const internal = (engine as unknown as {
      internalState: { cardMetas: Record<string, { exhausted?: boolean }> };
    }).internalState;
    internal.cardMetas["u2"] = { exhausted: true };

    runPhaseHook(engine, "awaken", "onBegin");

    expect(internal.cardMetas["u2"]?.exhausted ?? false).toBe(false);
  });

  test("an enemy unit (different controller) is NOT readied during my awaken (rule 415.3.a)", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "awaken" });
    createBattlefield(engine, "bf-1", { controller: null });
    // Owned by P2, sitting in P2's base — should not awaken during P1's turn.
    createCard(engine, "enemy", {
      cardType: "unit",
      might: 2,
      owner: "player-2",
      zone: "base",
    });
    const internal = (engine as unknown as {
      internalState: { cardMetas: Record<string, { __flags?: Record<string, boolean> }> };
    }).internalState;
    internal.cardMetas["enemy"] = { __flags: { exhausted: true } };

    runPhaseHook(engine, "awaken", "onBegin");

    // Still exhausted — rule 415.3.a: "ALL non-spell Game Objects they
    // CONTROL". P1's awaken doesn't ready P2's units.
    expect(internal.cardMetas["enemy"]?.__flags?.exhausted).toBe(true);
  });
});
