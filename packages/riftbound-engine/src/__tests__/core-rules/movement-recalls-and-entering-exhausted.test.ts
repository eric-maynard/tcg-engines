/**
 * Core rules — Movement: Recalls are not Moves; units enter the board exhausted
 * (Accelerate / "I enter ready" replacements); Awaken readies. CARD-INDEPENDENT
 * (inline filler units / gear / spells only).
 *
 * Rules covered:
 *   143.4 / 143.4.a / 178.1.a.1 / 359.2.c   units enter the board exhausted (unless replaced)
 *   144 / 144.2 / 144.4.b / 414.4          Standard Move: exhausting is the cost; an exhausted unit cannot pay it
 *   184.1 / 185.2.d                        tokens follow their type (enter exhausted) unless the effect says "ready"
 *   369.3                                  "I enter ready" is a replacement on entering
 *   805.1.a / 805.1.a.1 / 805.2 / 805.2.a / 805.3 / 805.6 / 805.6.a   Accelerate
 *   410.1.b                                any number of discretionary actions while costs can be paid
 *   415.3.a / 415.3.b                      Awaken readies your permanents; effects may ready
 *   420.2.a / 449.1 / 456.3                movement restrictions bind Moves, never Recalls
 *   446.1 / 446.2                          corrective Recalls and zone changes are not Moves
 *   455 / 456 / 456.1 / 456.2 / 458 / 458.1   Recall: relocation to base, no move triggers, state preserved
 *   457.1 / 323.7                          cleanup Recalls (unattached gear at a battlefield; permanents in the wrong base)
 *   323.6                                  losing control of an emptied battlefield at cleanup
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";
import type { ActionDecision } from "../../harness/types";

// ---------------------------------------------------------------------------
// Inline filler definitions
// ---------------------------------------------------------------------------

const spell = (name: string, effect: Record<string, unknown>, timing: "action" | "reaction" = "action") => ({
  abilities: [{ effect, timing, type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name,
  timing,
});

/** "Recall a friendly unit." */
const RECALL_FRIENDLY = spell("Filler Recall", { target: { controller: "friendly", type: "unit" }, type: "recall" });
/** "Move a friendly unit to base." (an effect-driven Move — still a Move). */
const MOVE_FRIENDLY_HOME = spell("Filler March Home", { target: { controller: "friendly", type: "unit" }, to: "base", type: "move" });
/** "Ready a friendly unit." */
const READY_FRIENDLY = spell("Filler Second Wind", { target: { controller: "friendly", type: "unit" }, type: "ready" });
/** "Give a unit +1 Might this turn." */
const PLUS_ONE_THIS_TURN = spell("Filler Pump", { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" });
/** "Return a unit to its owner's hand." */
const BOUNCE = spell("Filler Bounce", { target: { type: "unit" }, type: "return-to-hand" });
/** "Kill a unit." */
const KILL = spell("Filler Kill", { target: { type: "unit" }, type: "kill" });
/** "Take control of an enemy unit." */
const STEAL = spell("Filler Steal", { duration: "permanent", target: { controller: "enemy", type: "unit" }, type: "take-control" });
/** "Play a 1-Might Recruit unit token to your base." */
const RECRUIT = spell("Filler Recruit", { location: "base", token: { might: 1, name: "Recruit", type: "unit" }, type: "create-token" });
/** "Play a READY 1-Might Recruit unit token to your base." (184.1) */
const READY_RECRUIT = spell("Filler Ready Recruit", { location: "base", ready: true, token: { might: 1, name: "Recruit", type: "unit" }, type: "create-token" });

/** Unit: "When I move, draw 1." */
const MOVER_DRAWS = (extra: Record<string, unknown> = {}) => ({
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "move", on: "self" }, type: "triggered" }],
  might: 3,
  name: "Filler Wanderer",
  ...extra,
});

/** Gear: "When you move a friendly unit, gain 1 XP." */
const MOVE_WATCHER_GEAR = {
  abilities: [
    {
      effect: { amount: 1, type: "gain-xp" },
      trigger: { event: "move", on: { actor: "controller", cardType: "unit", controller: "friendly" } },
      type: "triggered",
    },
  ],
  cardType: "gear",
  name: "Filler Move Watcher",
};

/** Gear: "When any permanent moves, gain 1 XP." (catches gear/stolen-unit relocations if they were Moves). */
const ANY_MOVE_WATCHER_GEAR = {
  abilities: [{ effect: { amount: 1, type: "gain-xp" }, trigger: { event: "move", on: "any" }, type: "triggered" }],
  cardType: "gear",
  name: "Filler Omni Move Watcher",
};

/** Gear: "When a friendly unit becomes ready, draw 1." (805.6.a probe). */
const READY_WATCHER_GEAR = {
  abilities: [
    {
      effect: { amount: 1, type: "draw" },
      trigger: { event: "ready", on: { cardType: "unit", controller: "friendly" } },
      type: "triggered",
    },
  ],
  cardType: "gear",
  name: "Filler Ready Watcher",
};

/** Gear: "When a friendly unit becomes exhausted, draw 1." (entering exhausted is not an Exhaust action). */
const EXHAUST_WATCHER_GEAR = {
  abilities: [
    {
      effect: { amount: 1, type: "draw" },
      trigger: { event: "exhaust", on: { cardType: "unit", controller: "friendly" } },
      type: "triggered",
    },
  ],
  cardType: "gear",
  name: "Filler Exhaust Watcher",
};

/** 2-Might Fury unit with [Accelerate] ([1][fury]). */
const ACCELERATE_UNIT = {
  abilities: [{ cost: { energy: 1, power: ["fury"] }, keyword: "Accelerate", type: "keyword" }],
  domain: "fury",
  energyCost: 2,
  keywords: ["Accelerate"],
  might: 2,
  name: "Filler Sprinter",
};

/** 2-Might unit with the replacement ability "I enter ready." (369.3). */
const ENTERS_READY_UNIT = {
  abilities: [{ effect: { target: "self", type: "enter-ready" }, type: "static" }],
  energyCost: 0,
  might: 2,
  name: "Filler Eager One",
};

/**
 * Enemy permanent with the passive "Enemy units can't move to base." — encoded the way the card
 * parser encodes printed "can't move to base" text (grant-keyword NoMoveToBase).
 */
const MOVE_LOCKER = {
  abilities: [
    {
      effect: { duration: "permanent", keyword: "NoMoveToBase", target: { controller: "enemy", type: "unit" }, type: "grant-keyword" },
      type: "static",
    },
  ],
  might: 2,
  name: "Filler Warden",
};

/** Filler Equipment (+1 Might). */
const BLADE = {
  abilities: [{ cost: { energy: 0 }, keyword: "Equip", type: "keyword" }],
  cardType: "equipment",
  keywords: ["Equip"],
  mightBonus: 1,
  name: "Filler Blade",
};

// ---------------------------------------------------------------------------
// 1. Units played from hand enter exhausted
// ---------------------------------------------------------------------------

describe("143.4 / 359.2.c / 414.4: a unit played from hand enters exhausted and cannot Standard Move this turn", () => {
  test("Case A (to base) and Case B (to a controlled battlefield): both copies enter exhausted; the Standard Move cost is unpayable; no 'becomes exhausted' trigger fires", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2 }, "holder")
      .gear(P1, EXHAUST_WATCHER_GEAR, "exhaustWatch")
      .hand(P1, { energyCost: 1, might: 2, name: "Filler Grunt" }, "u1")
      .hand(P1, { energyCost: 1, might: 2, name: "Filler Grunt" }, "u2")
      .build();
    const handBefore = game.p1.hand().length;
    // Case A — to base.
    await game.p1.play("u1", { to: "base" });
    await game.settle();
    expect(game.locationOf("u1")).toBe("base");
    expect(game.state("u1").isExhausted).toBe(true);
    expect(game.state("u1").isReady).toBe(false); // must NOT enter ready
    // Standard Move u1 → bf1 is not offered / rejected (exhaust cost cannot be paid).
    const moveOpt = game.p1.option("standardMove");
    const movable = (moveOpt?.fields.find((f) => f.name === "unitIds")?.options ?? []) as string[][];
    expect(movable.flat()).not.toContain("u1");
    const r = await game.p1.try((p) => p.move("u1", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("u1")).toBe("base");
    // Case B — to a battlefield P1 controls.
    await game.p1.play("u2", { to: "bf1" });
    await game.settle();
    expect(game.locationOf("u2")).toBe("bf1");
    expect(game.state("u2").isExhausted).toBe(true);
    // Entering exhausted is not an Exhaust action on a ready object → the watcher never drew.
    expect(game.p1.hand().length).toBe(handBefore - 2);
    expect(game.p1.energy()).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 2. Tokens enter exhausted unless the effect says "ready"
// ---------------------------------------------------------------------------

describe("185.2.d / 184.1: token units enter exhausted by default; 'play a ready … token' enters ready", () => {
  test("first token exhausted; second (ready) may Standard Move immediately", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .hand(P1, RECRUIT, "recruit")
      .hand(P1, READY_RECRUIT, "readyRecruit")
      .build();
    await game.p1.cast("recruit");
    await game.settle();
    const [t1] = game.p1.units("base");
    expect(t1).toBeDefined();
    expect(game.state(t1 as string).isToken).toBe(true);
    expect(game.state(t1 as string).isExhausted).toBe(true); // must NOT default to ready
    expect(game.p1.can("move")).toBe(false);
    await game.p1.cast("readyRecruit");
    await game.settle();
    const tokens = game.p1.units("base");
    expect(tokens).toHaveLength(2);
    const t2 = tokens.find((t) => t !== t1) as string;
    expect(game.state(t2).isReady).toBe(true);
    expect(game.state(t1 as string).isExhausted).toBe(true);
    // Neutral Open after resolution → the ready token (only) can Standard Move.
    expect((game.decision() as ActionDecision).context).toBe("main");
    const movable = (game.p1.option("standardMove")?.fields.find((f) => f.name === "unitIds")?.options ?? []) as string[][];
    expect(movable.flat()).toContain(t2);
    expect(movable.flat()).not.toContain(t1);
    await game.p1.move(t2, "bf1");
    expect(game.locationOf(t2)).toBe("bf1");
  });
});

// ---------------------------------------------------------------------------
// 3. Accelerate paid / declined / wrong domain
// ---------------------------------------------------------------------------

describe("805: Accelerate — pay [1]+[C] while playing to enter ready via replacement", () => {
  test("paid: extra [1]+[fury] deducted, enters READY without a 'becomes ready' event, and may Standard Move at once (805.1.a, 805.2, 805.6, 805.6.a)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .battlefield("bf1", { controller: null })
      .gear(P1, READY_WATCHER_GEAR, "readyWatch")
      .hand(P1, ACCELERATE_UNIT, "sprinter")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p1.play("sprinter", { accelerate: true });
    await game.settle();
    expect(game.locationOf("sprinter")).toBe("base");
    expect(game.state("sprinter").isReady).toBe(true);
    // Cost 2 + Accelerate [1] energy and 1 fury power.
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("fury")).toBe(0);
    // 805.6.a: no ready event → the watcher must NOT have drawn.
    expect(game.p1.hand().length).toBe(handBefore - 1);
    expect(game.chain()).toEqual([]);
    // Ready → Standard Move is available this turn.
    await game.p1.move("sprinter", "bf1");
    expect(game.locationOf("sprinter")).toBe("bf1");
  });

  test("declined: enters exhausted and only the base cost is taken", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .hand(P1, ACCELERATE_UNIT, "sprinter")
      .build();
    await game.p1.play("sprinter", { accelerate: false });
    await game.settle();
    expect(game.locationOf("sprinter")).toBe("base");
    expect(game.state("sprinter").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.power("fury")).toBe(1);
    expect(game.p1.can("move")).toBe(false);
  });

  test("805.1.a.1: power of the wrong domain cannot pay the Accelerate power portion — paying is not a legal variant; nothing is spent", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .hand(P1, ACCELERATE_UNIT, "sprinter")
      .build();
    const payField = game.p1.option("playUnit", "sprinter")?.fields.find((f) => f.arg === "payOptional");
    expect(payField?.options ?? []).not.toContain(true);
    const r = await game.p1.try((p) => p.play("sprinter", { accelerate: true }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("sprinter")).toBe("hand");
    expect(game.p1.energy()).toBe(3);
    expect(game.p1.power("calm")).toBe(1);
    // The plain play (no Accelerate) is still legal and enters exhausted.
    await game.p1.play("sprinter", { accelerate: false });
    await game.settle();
    expect(game.state("sprinter").isExhausted).toBe(true);
    expect(game.p1.power("calm")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 4. Accelerate is locked in at payment; cannot be paid once on board
// ---------------------------------------------------------------------------

describe("805.2.a / 805.2.b / 805.3: Accelerate is an additional cost of PLAYING the unit only", () => {
  test("an exhausted Accelerate unit already on the board offers no way to pay Accelerate now (805.2.a, 805.3); a paid Accelerate is not undone later (805.2.b)", async () => {
    // 805.2.b note: permanents leave the chain as soon as they are finalized (359.2) and units get
    // no Reaction window (359.3.c is spells-only), so "loses Accelerate mid-finalization" has no
    // reachable game state here; we assert the lock-in from the other side: once paid and on the
    // board, nothing about the keyword is consulted again and the unit simply stays ready.
    const onBoard = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .unit(P1, "base", ACCELERATE_UNIT, "sprinter", { exhausted: true })
      .build();
    const labels = onBoard.p1.legal().map((o) => `${o.moveId}:${o.card ?? ""}`);
    expect(labels.some((l) => l.includes("sprinter"))).toBe(false); // no activate/pay option on the unit
    const act = await onBoard.p1.try((p) => p.activate("sprinter"));
    expect(act.ok).toBe(false);
    expect(onBoard.state("sprinter").isExhausted).toBe(true);
    expect(onBoard.p1.energy()).toBe(3); // must NOT take/refund anything
    expect(onBoard.p1.power("fury")).toBe(1);

    const paid = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .hand(P1, ACCELERATE_UNIT, "sprinter")
      .hand(P1, PLUS_ONE_THIS_TURN, "pump")
      .build();
    await paid.p1.play("sprinter", { accelerate: true });
    await paid.settle();
    expect(paid.state("sprinter").isReady).toBe(true);
    // A later effect touching the unit does not revisit the replacement: still ready, cost not refunded.
    await paid.p1.cast("pump", { targets: "sprinter" });
    await paid.settle();
    expect(paid.state("sprinter").isReady).toBe(true);
    expect(paid.p1.energy()).toBe(0);
    expect(paid.p1.power("fury")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. "I enter ready" static replacement
// ---------------------------------------------------------------------------

describe("369.3 / 143.4.a: 'I enter ready.' replaces entering exhausted, at any play location, with no extra cost", () => {
  test("played to a controlled battlefield: enters ready there, no 'becomes ready' trigger, and may Standard Move bf→base this turn (144.4.b)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2 }, "holder")
      .gear(P1, READY_WATCHER_GEAR, "readyWatch")
      .hand(P1, ENTERS_READY_UNIT, "eager")
      .build();
    const handBefore = game.p1.hand().length;
    expect(game.p1.energy()).toBe(0); // no Accelerate-style payment involved
    await game.p1.play("eager", { to: "bf1" });
    await game.settle();
    expect(game.locationOf("eager")).toBe("bf1");
    expect(game.state("eager").isReady).toBe(true); // must NOT enter exhausted then ready
    expect(game.p1.hand().length).toBe(handBefore - 1); // watcher did not draw
    expect(game.chain()).toEqual([]);
    expect((game.decision() as ActionDecision).context).toBe("main");
    await game.p1.move("eager", "base");
    expect(game.locationOf("eager")).toBe("base");
    expect(game.state("eager").isExhausted).toBe(true); // the move's exhaust cost was paid normally
  });
});

// ---------------------------------------------------------------------------
// 6. Recall is not a Move
// ---------------------------------------------------------------------------

describe("455 / 456 / 456.1 / 456.2 / 458 / 458.1: a Recall relocates to base without being a Move", () => {
  test("recalled unit keeps exhausted + damage + this-turn buff; neither 'When I move' nor 'When you move a friendly unit' fires; the emptied battlefield's control is lost at cleanup (323.6)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", MOVER_DRAWS(), "wanderer", { damage: 1, exhausted: true })
      .gear(P1, MOVE_WATCHER_GEAR, "moveWatch")
      .hand(P1, PLUS_ONE_THIS_TURN, "pump")
      .hand(P1, RECALL_FRIENDLY, "recall")
      .build();
    await game.p1.cast("pump", { targets: "wanderer" });
    await game.settle();
    expect(game.state("wanderer").might).toBe(4);
    const handBefore = game.p1.hand().length;
    const movedBefore = game.gameState.unitsMovedThisTurn[P1] ?? 0;
    await game.p1.cast("recall", { targets: "wanderer" });
    await game.settle();
    // 456.2: location changed to base.
    expect(game.locationOf("wanderer")).toBe("base");
    // 458 / 458.1: state untouched — must NOT ready or heal.
    expect(game.state("wanderer").isExhausted).toBe(true);
    expect(game.state("wanderer").damage).toBe(1);
    expect(game.state("wanderer").might).toBe(4);
    // 456 / 456.1: not a Move → no move triggers, no move bookkeeping.
    expect(game.p1.hand().length).toBe(handBefore - 1); // only the spell left the hand; no draw
    expect(game.p1.xp()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.gameState.unitsMovedThisTurn[P1] ?? 0).toBe(movedBefore);
    // 323.6: bf1 now has no P1 unit → P1 no longer controls it.
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
  });

  test("contrast: an effect-driven MOVE to base IS a Move — both move triggers fire", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", MOVER_DRAWS(), "wanderer")
      .gear(P1, MOVE_WATCHER_GEAR, "moveWatch")
      .hand(P1, MOVE_FRIENDLY_HOME, "march")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("march", { targets: "wanderer" });
    await game.settle();
    expect(game.locationOf("wanderer")).toBe("base");
    expect(game.p1.hand().length).toBe(handBefore - 1 + 1); // spell out, "When I move" drew 1
    expect(game.p1.xp()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 7. Movement locks bind Moves, not Recalls
// ---------------------------------------------------------------------------

describe("456.3 / 449.1 / 420.2.a: a Recall cannot be stopped by movement restrictions; a Move can", () => {
  test("449.1/420.2.a — engine does not enforce movement-restricting passives: with an enemy 'enemy units can't move to base' on the board, Standard Move bf→base and an effect-driven move to base still go through", async () => {
    // Expected: (a) Standard Move U → base rejected, U stays ready at bf1; (b) 'Move a friendly unit
    // to base' resolves but the move instruction is skipped (359.3.e.6). Actual: both relocate U.
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2 }, "U")
      .unit(P2, "base", MOVE_LOCKER, "warden")
      .hand(P1, MOVE_FRIENDLY_HOME, "march")
      .build();
    // (a) Standard Move is illegal under the lock; the cost is not paid.
    const r = await game.p1.try((p) => p.move("U", "base"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("U")).toBe("bf1");
    expect(game.state("U").isReady).toBe(true);
    // (b) The spell is playable (358.3.a) but its move does nothing.
    await game.p1.cast("march", { targets: "U" });
    await game.settle();
    expect(game.zoneOf("march")).toBe("trash");
    expect(game.locationOf("U")).toBe("bf1");
  });

  test("(c) 'Recall a friendly unit' succeeds despite the lock (456.3); (d) once the locking permanent dies, another ready unit Standard-Moves normally — the lock does not outlive its source", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", { might: 2 }, "U")
      .unit(P1, "bf2", { might: 2 }, "V")
      .unit(P2, "base", MOVE_LOCKER, "warden")
      .hand(P1, RECALL_FRIENDLY, "recall")
      .hand(P1, KILL, "kill")
      .build();
    await game.p1.cast("recall", { targets: "U" });
    await game.settle();
    expect(game.locationOf("U")).toBe("base"); // the lock must NOT block the recall
    expect(game.state("U").isReady).toBe(true); // recall paid no exhaust cost
    await game.p1.cast("kill", { targets: "warden" });
    await game.settle();
    expect(game.zoneOf("warden")).toBe("trash");
    expect((game.decision() as ActionDecision).context).toBe("main");
    await game.p1.move("V", "base");
    expect(game.locationOf("V")).toBe("base");
    expect(game.state("V").isExhausted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. Rules-driven Recalls in Cleanup
// ---------------------------------------------------------------------------

describe("457.1 / 323.7 / 446.1: cleanup Recalls (loose gear at a battlefield; permanents in the wrong base) are not Moves", () => {
  test.failing("BUG: 457.1/323.7 — Setup A: when a unit at bf1 is killed by a spell, its attached Equipment stays at the battlefield still 'attached' to the dead unit instead of being recalled to base at the next cleanup", async () => {
    // Expected: E unattached in P1's base after the cleanup, exhausted state kept, no move trigger.
    // Actual: E remains in battlefield-bf1 with attachedTo → the trashed unit (the kill-effect path
    // never detaches, and cleanup only auto-recalls loose cardType "gear").
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Filler Bearer" }, "bearer", { equippedWith: ["blade"] })
      .card("blade", { def: BLADE, meta: { attachedTo: "bearer", exhausted: true }, owner: P1, zone: "bf1" })
      .gear(P1, ANY_MOVE_WATCHER_GEAR, "omniWatch")
      .hand(P1, KILL, "kill")
      .build();
    expect(game.zoneOf("blade")).toBe("battlefield-bf1");
    expect(game.state("blade").attachedTo).toBe("bearer");
    expect(game.state("bearer").might).toBe(3);
    await game.p1.cast("kill", { targets: "bearer" });
    await game.settle();
    expect(game.zoneOf("bearer")).toBe("trash");
    // 457.1 / 323.7: E must NOT be left at bf1.
    expect(game.zoneOf("blade")).toBe("base");
    expect(game.state("blade").attachedTo).toBeUndefined();
    // 458.1: ready/exhausted state preserved by the recall.
    expect(game.state("blade").isExhausted).toBe(true);
    // 456.1 / 446.1: not a Move.
    expect(game.p1.xp()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
  });

  test("Setup B: gaining control of an enemy unit sitting in the enemy base relocates it under P1's control in base without a Move — exhausted state and damage unchanged, no move trigger, no Ganking/readiness needed", async () => {
    // Engine note: bases are one shared zone partitioned by player, so "recalled to P1's base" is
    // observable as (location base) ∧ (controller P1).
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P2, "base", { might: 2, name: "Filler Turncoat" }, "turncoat", { damage: 1, exhausted: true })
      .gear(P1, ANY_MOVE_WATCHER_GEAR, "omniWatch")
      .hand(P1, STEAL, "steal")
      .build();
    const movedBefore = game.gameState.unitsMovedThisTurn[P1] ?? 0;
    await game.p1.cast("steal", { targets: "turncoat" });
    await game.settle();
    expect(game.state("turncoat").controller).toBe(P1);
    expect(game.state("turncoat").owner).toBe(P2);
    expect(game.locationOf("turncoat")).toBe("base");
    expect(game.state("turncoat").isExhausted).toBe(true);
    expect(game.state("turncoat").damage).toBe(1);
    expect(game.p1.xp()).toBe(0); // must NOT count as a Move
    expect(game.gameState.unitsMovedThisTurn[P1] ?? 0).toBe(movedBefore);
    expect(game.chain()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 9. Zone change is not a Move; re-entering resets to "enters exhausted"
// ---------------------------------------------------------------------------

describe("446.2 / 143.4 / 359.2.c: bouncing to hand and replaying is a zone change, not a Move; the replayed unit is a new object that enters exhausted", () => {
  test("no move trigger on bounce or on replay; control of the emptied battlefield is lost; the replayed unit is exhausted and cannot Standard Move", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", MOVER_DRAWS({ energyCost: 0 }), "wanderer")
      .gear(P1, MOVE_WATCHER_GEAR, "moveWatch")
      .hand(P1, BOUNCE, "bounce")
      .build();
    expect(game.state("wanderer").isReady).toBe(true);
    const handBefore = game.p1.hand().length; // includes the bounce spell
    await game.p1.cast("bounce", { targets: "wanderer" });
    await game.settle();
    expect(game.zoneOf("wanderer")).toBe("hand");
    // -1 spell +1 returned unit, and NO "When I move" draw.
    expect(game.p1.hand().length).toBe(handBefore);
    expect(game.p1.xp()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1); // 323.6
    // Replay the same card to base this turn.
    await game.p1.play("wanderer", { to: "base" });
    await game.settle();
    expect(game.locationOf("wanderer")).toBe("base");
    expect(game.state("wanderer").isExhausted).toBe(true); // must NOT remember it was ready before
    expect(game.p1.hand().length).toBe(handBefore - 1); // entering from hand is not a Move → no draw
    expect(game.p1.xp()).toBe(0);
    expect(game.p1.can("move")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 10. Awaken readies exhausted movers; ready state is the only gate on repeated Standard Moves
// ---------------------------------------------------------------------------

describe("414.4 / 410.1.b / 415.3.a / 415.3.b / 458.1: exhaustion gates the Standard Move; effects and your own Awaken ready units", () => {
  test("move → (recall keeps it exhausted, no second move) → 'ready a friendly unit' → second Standard Move the same Main Phase; still exhausted through P2's Awaken; readied at P1's next Awaken", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", { might: 2, name: "Filler Scout" }, "scout")
      .hand(P1, RECALL_FRIENDLY, "recall")
      .hand(P1, READY_FRIENDLY, "secondWind")
      .build();
    await game.p1.move("scout", "bf1");
    await game.settle(); // showdown at the empty battlefield passes → P1 controls bf1
    expect(game.locationOf("scout")).toBe("bf1");
    expect(game.state("scout").isExhausted).toBe(true);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    // Recall later this turn: back in base, STILL exhausted (458.1) → cannot Standard Move (414.4).
    await game.p1.cast("recall", { targets: "scout" });
    await game.settle();
    expect(game.locationOf("scout")).toBe("base");
    expect(game.state("scout").isExhausted).toBe(true);
    expect(game.p1.can("move")).toBe(false);
    // A Ready effect (415.3.b) lifts the only gate → a second Standard Move this Main Phase (410.1.b).
    await game.p1.cast("secondWind", { targets: "scout" });
    await game.settle();
    expect(game.state("scout").isReady).toBe(true);
    expect(game.p1.can("move")).toBe(true); // must NOT impose a once-per-turn move limit
    await game.p1.move("scout", "bf2");
    await game.settle();
    expect(game.locationOf("scout")).toBe("bf2");
    expect(game.state("scout").isExhausted).toBe(true);
    expect(game.gameState.unitsMovedThisTurn[P1]).toBe(2);
    // P2's turn (P2's Awaken) must NOT ready P1's unit.
    await game.p1.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.state("scout").isExhausted).toBe(true);
    // P1's next Awaken readies all P1 permanents (415.3.a).
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("scout").isReady).toBe(true);
    expect(game.p1.can("move")).toBe(true);
  });
});
