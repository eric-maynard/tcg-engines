/**
 * Event bus — dispatcher + per-card listener registry (Phase 1 + 2).
 *
 * Covers the unified typed-event chokepoint (`events/dispatcher.ts`) and
 * the derived-from-state listener registry (`events/listener-registry.ts`):
 *
 *  - `dispatchEvent` polls every live card, fires the matching triggered
 *    abilities, and (when given an event log) records the event.
 *  - `dispatchUnitDied` is the single emission point for "a unit died":
 *    it emits one `die` event per killed unit, so Deathknell / "when I die"
 *    / "when a friendly/enemy unit dies" all fire through the same poll.
 *  - `buildListenerRegistry` enumerates live card listeners keyed by event
 *    type; a card stops being a listener once it leaves the board (except a
 *    just-died card keeps its own `die` self-trigger from the trash).
 */

import { describe, expect, it } from "bun:test";
import { evaluateAbilityCondition } from "../../abilities/trigger-runner";
import { EVENT_TYPES_NEEDING_RECALC } from "../../events";
import type { GameEventRecord } from "../../events";
import {
  P1,
  P2,
  buildListenerRegistryForTest,
  createCard,
  createMinimalGameState,
  dispatchEventForTest,
  dispatchEventWithMaintenanceForTest,
  dispatchUnitDiedForTest,
  getCardMeta,
  getChainItems,
  getState,
  passChainPriority,
  runStateMaintenanceForTest,
  setCardsPlayedThisTurn,
  setInteractionStateForTest,
  setPlayerXp,
} from "./helpers";

// A triggered ability that damages itself by 1 when `event` (with optional
// `on` scope) is raised. Side effect (a `damage` counter) proves it fired.
const SELF_DAMAGE_TRIGGER = (event: string, on?: string) => ({
  effect: { amount: 1, target: { type: "self" }, type: "damage" },
  on,
  trigger: { event, on },
  type: "triggered" as const,
});

// A Deathknell keyword carrying a self-damage effect — the parser shape the
// Trigger runner synthesises into a real `{ trigger: { event: "die", on:
// "self" } }` ability.
const DEATHKNELL_SELF_DAMAGE = {
  effect: { amount: 1, target: { type: "self" }, type: "damage" },
  keyword: "Deathknell",
  type: "keyword" as const,
};

describe("Event bus — dispatchEvent (the typed-event chokepoint)", () => {
  it("polls a live card and fires its matching triggered ability", () => {
    const engine = createMinimalGameState({ phase: "beginning" });
    createCard(engine, "hero", {
      abilities: [SELF_DAMAGE_TRIGGER("start-of-turn")],
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "base",
    });

    const fired = dispatchEventForTest(engine, { playerId: P1, type: "start-of-turn" });

    expect(fired).toBe(1);
    expect(getCardMeta(engine, "hero")?.damage).toBe(1);
  });

  it("does not fire a card whose trigger event does not match", () => {
    const engine = createMinimalGameState({ phase: "beginning" });
    createCard(engine, "hero", {
      abilities: [SELF_DAMAGE_TRIGGER("end-of-turn")],
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "base",
    });

    const fired = dispatchEventForTest(engine, { playerId: P1, type: "start-of-turn" });

    expect(fired).toBe(0);
    expect(getCardMeta(engine, "hero")?.damage ?? 0).toBe(0);
  });

  it("records the event in an attached event log with a monotonic seq + listener count", () => {
    const engine = createMinimalGameState({ phase: "beginning" });
    // Vanilla unit so the start-of-turn dispatch fires no listeners (and
    // Hence raises no nested damageDealt/counterChanged events) — keeps the
    // Log to exactly the two events dispatched here.
    createCard(engine, "hero", {
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "base",
    });

    const log: GameEventRecord[] = [];
    dispatchEventForTest(engine, { playerId: P1, type: "start-of-turn" }, log);
    dispatchEventForTest(engine, { playerId: P2, type: "end-of-turn" }, log);

    expect(log).toHaveLength(2);
    expect(log[0]).toEqual({
      event: { playerId: P1, type: "start-of-turn" },
      listenersFired: 0,
      seq: 0,
    });
    expect(log[1]).toEqual({
      event: { playerId: P2, type: "end-of-turn" },
      listenersFired: 0,
      seq: 1,
    });
  });

  it("the event log sees NESTED engine-bus events raised while a triggered ability resolves", () => {
    const engine = createMinimalGameState({ phase: "beginning" });
    createCard(engine, "hero", {
      abilities: [SELF_DAMAGE_TRIGGER("start-of-turn")],
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "base",
    });

    const log: GameEventRecord[] = [];
    dispatchEventForTest(engine, { playerId: P1, type: "start-of-turn" }, log);

    // The hero's self-damage effect raises damageDealt + counterChanged
    // Through the dispatcher *before* `fireTriggers` returns, so those are
    // Logged first; the outer start-of-turn event is logged last.
    expect(log.map((r) => r.event.type)).toEqual([
      "damageDealt",
      "counterChanged",
      "start-of-turn",
    ]);
    expect(getCardMeta(engine, "hero")?.damage).toBe(1);
  });

  it("a no-op event (no listeners) returns 0 and still records to the log", () => {
    const engine = createMinimalGameState({ phase: "beginning" });
    const log: GameEventRecord[] = [];
    const fired = dispatchEventForTest(engine, { playerId: P1, type: "draw" }, log);
    expect(fired).toBe(0);
    expect(log).toHaveLength(1);
  });
});

describe("Event bus — dispatchUnitDied (the single 'a unit died' emission point)", () => {
  it("fires a dying unit's own Deathknell", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "doomed", {
      abilities: [DEATHKNELL_SELF_DAMAGE],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "trash", // Already moved to trash, as the engine death path does
    });

    const fired = dispatchUnitDiedForTest(engine, [{ cardId: "doomed", owner: P1 }]);

    expect(fired).toBe(1);
    expect(getCardMeta(engine, "doomed")?.damage).toBe(1);
  });

  it("fires a board card's 'when a friendly unit dies' trigger but not an enemy's", () => {
    const engine = createMinimalGameState({ phase: "main" });
    // Friendly watcher (P1) — should fire.
    createCard(engine, "friendly-watcher", {
      abilities: [SELF_DAMAGE_TRIGGER("die", "friendly-other-units")],
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "base",
    });
    // Enemy watcher (P2) with the same friendly-scoped trigger — should NOT fire.
    createCard(engine, "enemy-watcher", {
      abilities: [SELF_DAMAGE_TRIGGER("die", "friendly-other-units")],
      cardType: "unit",
      might: 3,
      owner: P2,
      zone: "base",
    });
    createCard(engine, "doomed", {
      cardType: "unit",
      might: 1,
      owner: P1,
      zone: "trash",
    });

    dispatchUnitDiedForTest(engine, [{ cardId: "doomed", owner: P1 }]);

    expect(getCardMeta(engine, "friendly-watcher")?.damage).toBe(1);
    expect(getCardMeta(engine, "enemy-watcher")?.damage ?? 0).toBe(0);
  });

  it("emits one die event per killed unit in a batch (each death fires independently)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "watcher", {
      abilities: [SELF_DAMAGE_TRIGGER("die", "any-unit")],
      cardType: "unit",
      might: 9,
      owner: P1,
      zone: "base",
    });
    createCard(engine, "dead-a", { cardType: "unit", might: 1, owner: P1, zone: "trash" });
    createCard(engine, "dead-b", { cardType: "unit", might: 1, owner: P2, zone: "trash" });

    const log: GameEventRecord[] = [];
    dispatchUnitDiedForTest(
      engine,
      [{ cardId: "dead-a", owner: P1 }, { cardId: "dead-b", owner: P2 }],
      log,
    );

    // Two `die` events recorded (one per killed unit); the any-unit watcher
    // Fired twice. (Each watcher firing also raises nested damageDealt /
    // CounterChanged events, which the log records too — filter to `die`.)
    expect(log.filter((r) => r.event.type === "die")).toHaveLength(2);
    expect(getCardMeta(engine, "watcher")?.damage).toBe(2);
  });
});

describe("Event bus — listener registry (derived from state)", () => {
  it("enumerates a live board card as a listener keyed by its trigger event", () => {
    const engine = createMinimalGameState({ phase: "beginning" });
    createCard(engine, "hero", {
      abilities: [SELF_DAMAGE_TRIGGER("start-of-turn"), SELF_DAMAGE_TRIGGER("conquer", "self")],
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "base",
    });

    const registry = buildListenerRegistryForTest(engine);
    const hero = registry.listeners.find((l) => l.cardId === "hero");
    expect(hero).toBeDefined();
    expect(hero?.owner).toBe(P1);
    expect([...(hero?.byEvent.keys() ?? [])].toSorted()).toEqual(["conquer", "start-of-turn"]);
    expect(registry.cardsListeningFor("start-of-turn")).toContain("hero");
    expect(registry.cardsListeningFor("die")).not.toContain("hero");
  });

  it("a card with no triggered abilities is enumerated but listens for nothing", () => {
    const engine = createMinimalGameState({ phase: "beginning" });
    createCard(engine, "vanilla", { cardType: "unit", might: 3, owner: P1, zone: "base" });

    const registry = buildListenerRegistryForTest(engine);
    const vanilla = registry.listeners.find((l) => l.cardId === "vanilla");
    expect(vanilla).toBeDefined();
    expect(vanilla?.byEvent.size).toBe(0);
    for (const ids of [
      registry.cardsListeningFor("die"),
      registry.cardsListeningFor("start-of-turn"),
    ]) {
      expect(ids).not.toContain("vanilla");
    }
  });

  it("a card in hand is NOT a listener; a just-died card in trash still subscribes to its own die self-trigger", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "in-hand", {
      abilities: [SELF_DAMAGE_TRIGGER("start-of-turn")],
      cardType: "spell",
      owner: P1,
      zone: "hand",
    });
    createCard(engine, "just-died", {
      abilities: [DEATHKNELL_SELF_DAMAGE],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "trash",
    });

    const registry = buildListenerRegistryForTest(engine);
    expect(registry.listeners.find((l) => l.cardId === "in-hand")).toBeUndefined();
    const justDied = registry.listeners.find((l) => l.cardId === "just-died");
    expect(justDied).toBeDefined();
    expect(justDied?.byEvent.has("die")).toBe(true);
  });
});

describe("Event bus — new engine-bus event types (routed through dispatchEvent)", () => {
  // No card text subscribes to these today, so they fire 0 listeners — but
  // They still flow through the chokepoint and land in the event log.
  it("each new event type dispatches cleanly (0 listeners) and records to the log", () => {
    const engine = createMinimalGameState({ phase: "main" });
    const log: GameEventRecord[] = [];
    const events = [
      { cardId: "x", cause: "test", counter: "damage", delta: 1, type: "counterChanged" as const },
      { amount: 2, cardId: "x", sourceId: "y", type: "damageDealt" as const },
      { amount: 1, playerId: P1, type: "xpGained" as const },
      {
        battlefieldId: "bf-1",
        cause: "test",
        controller: P1,
        previousController: null,
        type: "controlChanged" as const,
      },
      { phase: "main", playerId: P1, type: "phaseBegan" as const },
      { phase: "main", playerId: P1, type: "phaseEnded" as const },
      { battlefieldId: "bf-1", contestedBy: P1, type: "combatStaged" as const },
      { attackingPlayer: P1, battlefieldId: "bf-1", type: "combatOpened" as const },
      { battlefieldId: "bf-1", type: "combatResolved" as const, winner: P1 },
      {
        cardId: "x",
        chainItemId: "chain-1",
        controller: P1,
        triggered: false,
        type: "chainItemAdded" as const,
      },
      {
        cardId: "x",
        chainItemId: "chain-1",
        controller: P1,
        countered: false,
        type: "chainItemResolved" as const,
      },
    ];
    for (const ev of events) {
      const fired = dispatchEventForTest(engine, ev, log);
      expect(fired).toBe(0);
    }
    expect(log).toHaveLength(events.length);
    expect(log.map((r) => r.event.type)).toEqual(events.map((e) => e.type));
    expect(log.map((r) => r.seq)).toEqual(events.map((_e, i) => i));
  });
});

describe("Event bus — intervening-if (condition re-checked on resolution)", () => {
  // A triggered ability with a `while-level` condition: damage self by 1 when
  // A `start-of-turn` event fires, IF the controller's XP >= 3.
  const WHILE_LEVEL_3_SELF_DAMAGE = {
    condition: { threshold: 3, type: "while-level" },
    effect: { amount: 1, target: { type: "self" }, type: "damage" },
    trigger: { event: "start-of-turn", on: "self" },
    type: "triggered" as const,
  };

  // Damage applied via the real move-context counter bag lands on the
  // Reserved `__counters.damage` field (not `meta.damage`) — read that.
  const damageOf = (engine: ReturnType<typeof createMinimalGameState>, cardId: string): number => {
    const meta = getCardMeta(engine, cardId) as
      | { damage?: number; __counters?: Record<string, number> }
      | undefined;
    return (meta?.__counters?.damage ?? meta?.damage ?? 0) as number;
  };

  // Put an active chain in place so the trigger queues onto it (rather than
  // Resolving inline), then resolve via passChainPriority.
  function withActiveChain(engine: ReturnType<typeof createMinimalGameState>): void {
    setInteractionStateForTest(engine, {
      chain: {
        active: true,
        activePlayer: P1,
        items: [
          {
            cardId: "placeholder",
            controller: P1,
            effect: { type: "none" },
            id: "chain-seed",
            type: "spell",
          },
        ],
        passedPlayers: [],
        relevantPlayers: [P1, P2],
        turnOrder: [P1, P2],
      },
      nextChainItemId: 2,
      showdownStack: [],
    });
  }

  function resolveWholeChain(engine: ReturnType<typeof createMinimalGameState>): void {
    // Pass priority for both players repeatedly until the chain drains.
    for (let i = 0; i < 12; i++) {
      const st = getState(engine);
      const chain = st.interaction?.chain;
      if (!chain?.active) {
        break;
      }
      const active = chain.activePlayer || P1;
      passChainPriority(engine, active as typeof P1);
    }
  }

  it("condition true at emit AND at resolve → ability fires", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "hero", {
      abilities: [WHILE_LEVEL_3_SELF_DAMAGE],
      cardType: "unit",
      might: 9,
      owner: P1,
      zone: "base",
    });
    setPlayerXp(engine, P1, 5); // Condition met
    withActiveChain(engine);

    dispatchEventForTest(engine, { playerId: P1, type: "start-of-turn" });
    // Trigger queued onto the chain.
    expect(getChainItems(engine).some((it) => it.cardId === "hero")).toBe(true);

    resolveWholeChain(engine);
    expect(damageOf(engine, "hero")).toBe(1);
  });

  it("condition true at emit but FALSE at resolve → ability does nothing (intervening if)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "hero", {
      abilities: [WHILE_LEVEL_3_SELF_DAMAGE],
      cardType: "unit",
      might: 9,
      owner: P1,
      zone: "base",
    });
    setPlayerXp(engine, P1, 5); // Condition met at emit
    withActiveChain(engine);

    dispatchEventForTest(engine, { playerId: P1, type: "start-of-turn" });
    expect(getChainItems(engine).some((it) => it.cardId === "hero")).toBe(true);

    // Condition lapses before the queued ability would resolve.
    setPlayerXp(engine, P1, 0);
    resolveWholeChain(engine);

    expect(damageOf(engine, "hero")).toBe(0);
  });

  it("condition FALSE at emit → never queued", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "hero", {
      abilities: [WHILE_LEVEL_3_SELF_DAMAGE],
      cardType: "unit",
      might: 9,
      owner: P1,
      zone: "base",
    });
    setPlayerXp(engine, P1, 1); // Below threshold
    withActiveChain(engine);

    const fired = dispatchEventForTest(engine, { playerId: P1, type: "start-of-turn" });
    expect(fired).toBe(0);
    expect(getChainItems(engine).some((it) => it.cardId === "hero")).toBe(false);
  });

  it("evaluateAbilityCondition: no condition / legion / while-level / unknown", () => {
    const engine = createMinimalGameState({ phase: "main" });

    expect(evaluateAbilityCondition(undefined, getState(engine), P1)).toBe(true);
    expect(evaluateAbilityCondition({ type: "made-up" }, getState(engine), P1)).toBe(true);

    // Legion: needs a prior card-play this turn.
    expect(evaluateAbilityCondition({ type: "legion" }, getState(engine), P1)).toBe(false);
    setCardsPlayedThisTurn(engine, P1, 1);
    expect(evaluateAbilityCondition({ type: "legion" }, getState(engine), P1)).toBe(true);

    // While-level: XP threshold.
    setPlayerXp(engine, P1, 2);
    expect(evaluateAbilityCondition({ threshold: 3, type: "while-level" }, getState(engine), P1)).toBe(
      false,
    );
    setPlayerXp(engine, P1, 4);
    expect(evaluateAbilityCondition({ threshold: 3, type: "while-level" }, getState(engine), P1)).toBe(
      true,
    );
  });
});

describe("Event bus — static recalc + state-based checks as a DISPATCHER concern", () => {
  // A static "modify-might -N to all enemy units" ability — `recalculateStaticEffects`
  // Applies `staticMightBonus: -N` to enemy units, lowering their effective Might.
  const STATIC_ENEMY_MIGHT_DEBUFF = (amount: number) => ({
    affects: "all-enemy" as const,
    effect: { amount: -amount, type: "modify-might" as const },
    type: "static" as const,
  });

  // A Deathknell that damages itself by 1 — observable as `meta.damage` going
  // To 1 *after* the unit was reaped (state-based checks clear damage on a
  // Kill, then the Deathknell re-applies it).
  const DEATHKNELL_SELF_DAMAGE_LOCAL = {
    effect: { amount: 1, target: { type: "self" }, type: "damage" },
    keyword: "Deathknell",
    type: "keyword" as const,
  };

  it("EVENT_TYPES_NEEDING_RECALC covers zone / play / death / combat / counter / phase events but not pure-info ones", () => {
    for (const t of [
      "play-self",
      "play-card",
      "play-spell",
      "move",
      "die",
      "attack",
      "defend",
      "conquer",
      "hold",
      "win-combat",
      "controlChanged",
      "buff",
      "become-mighty",
      "take-damage",
      "counterChanged",
      "phaseBegan",
      "phaseEnded",
      "start-of-turn",
      "end-of-turn",
    ] as const) {
      expect(EVENT_TYPES_NEEDING_RECALC.has(t)).toBe(true);
    }
    // Purely informational events don't trigger the maintenance pass.
    for (const t of ["draw", "channel-rune", "choose"] as const) {
      expect(EVENT_TYPES_NEEDING_RECALC.has(t)).toBe(false);
    }
  });

  it("static recalc fires after a Might-changing event via the dispatcher (not via post-move cleanup)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    // Aura source: while in play, all enemy units get -1 Might.
    createCard(engine, "aura", {
      abilities: [STATIC_ENEMY_MIGHT_DEBUFF(1)],
      cardType: "unit",
      might: 4,
      owner: P1,
      zone: "base",
    });
    // Enemy unit — no static bonus yet (the recalc hasn't run for the aura).
    createCard(engine, "enemy", { cardType: "unit", might: 3, owner: P2, zone: "base" });
    expect(getCardMeta(engine, "enemy")?.staticMightBonus ?? 0).toBe(0);

    // Dispatch a Might-affecting event (a `buff` on some card) through the
    // Chokepoint with a cleanup-capable context — the dispatcher's
    // Maintenance pass re-runs `recalculateStaticEffects`.
    dispatchEventWithMaintenanceForTest(engine, { cardId: "aura", type: "buff" });

    // The static debuff is now applied — the dispatcher ran the recalc, not a
    // Post-move cleanup wrapper (this path never went through a move).
    expect(getCardMeta(engine, "enemy")?.staticMightBonus).toBe(-1);
  });

  it("a unit pushed lethal by a static Might debuff dies + fires its Deathknell via the dispatcher's recalc→SBA→dispatchUnitDied loop", () => {
    const engine = createMinimalGameState({ phase: "main" });
    // Aura source: all enemy units get -2 Might.
    createCard(engine, "aura", {
      abilities: [STATIC_ENEMY_MIGHT_DEBUFF(2)],
      cardType: "unit",
      might: 5,
      owner: P1,
      zone: "base",
    });
    // Victim: base Might 3, 2 marked damage → NOT lethal (2 < 3) until the
    // Static debuff lowers its effective Might to 1. Carries a Deathknell.
    createCard(engine, "victim", {
      abilities: [DEATHKNELL_SELF_DAMAGE_LOCAL],
      cardType: "unit",
      meta: { damage: 2 },
      might: 3,
      owner: P2,
      zone: "base",
    });
    // Witness: fires whenever any unit dies — proves the death emission
    // Propagated through the dispatcher.
    createCard(engine, "witness", {
      abilities: [SELF_DAMAGE_TRIGGER("die", "any-unit")],
      cardType: "unit",
      might: 9,
      owner: P1,
      zone: "base",
    });

    // A Might-affecting event through the bus: maintenance re-applies the
    // Static (pass 1: `victim.staticMightBonus = -2`), the next pass sees
    // `victim` effective Might = 1 <= marked damage 2 → reaps it → emits
    // `die` → Deathknell + witness fire.
    dispatchEventWithMaintenanceForTest(engine, { cardId: "aura", type: "buff" });

    // Victim was reaped by state-based checks (moved to trash). State-based
    // Checks cleared its damage on the kill; its Deathknell then re-applied 1.
    expect(getCardMeta(engine, "victim")?.damage).toBe(1);
    // Witness's "when a unit dies" trigger fired exactly once.
    expect(getCardMeta(engine, "witness")?.damage).toBe(1);
  });

  it("the recalc → death maintenance loop terminates (bounded) even when static recalc keeps reporting state changes", () => {
    const engine = createMinimalGameState({ phase: "main" });
    // A board with a static ability — `recalculateStaticEffects` returns
    // "applied" on every pass (strip + reapply), so `performCleanup` reports
    // `stateChanged` forever. The maintenance loop must NOT spin on that; it
    // Breaks once two consecutive passes kill nothing.
    createCard(engine, "aura", {
      abilities: [STATIC_ENEMY_MIGHT_DEBUFF(1)],
      cardType: "unit",
      might: 4,
      owner: P1,
      zone: "base",
    });
    createCard(engine, "enemy", { cardType: "unit", might: 3, owner: P2, zone: "base" });

    // Would hang here if the loop spun on `stateChanged`. Bun would time the
    // Test out — reaching the assertions proves termination.
    const reaped = runStateMaintenanceForTest(engine);
    expect(reaped).toBe(0);
    // Re-running is still bounded + idempotent.
    expect(runStateMaintenanceForTest(engine)).toBe(0);
    expect(getCardMeta(engine, "enemy")?.staticMightBonus).toBe(-1);
  });
});
