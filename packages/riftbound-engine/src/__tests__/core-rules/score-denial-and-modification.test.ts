/**
 * Core rules — Score denial & modification.
 *
 * Card-independent: every denier / modifier / bonus-point source is an inline filler def
 * built through the ScenarioBuilder. Printed cards that carry the same text (Tianna
 * Crownguard sfd-060 "opponents can't gain points", Otterpus VEN-053, Aspirant's Climb
 * ogn-276, The Arena's Greatest ogn-290, Nasus Ascended / Tryndamere "you score 1 point")
 * are only the inspiration for the inline shapes; none is loaded here.
 *
 * Vocabulary (469–471): a *Score* (Conquer 469.1 / Hold 469.2) is an event that (a) gains
 * "up to one" point (471.1) and (b) triggers Conquer/Hold abilities (471.2). A static
 * "can't gain points" (054.1 can't-beats-can, active while on board 365.1) or a
 * skip/replacement (443) removes the POINT, not the Score: the battlefield still counts as
 * scored this turn (470 — once per battlefield per turn) and Conquer/Hold triggers still
 * fire (383.4.c.2.c / 383.4.d.2.c). Nothing is retroactive when the denier later leaves.
 *
 * Rules covered
 *   054.1, 055        can't beats can; impossible instructions are skipped
 *   194.1.c           points from spells/abilities ("you gain/score 1 point")
 *   194.2(.a/.b), 323.1, 472   win check at cleanup: ≥ Victory Score AND more than everyone
 *   194.3(.a), 483.3.a         Victory Score 8 by default; modes/cards may alter it
 *   194.4(.a/.b)      0-point floor
 *   315.2.a / 315.2.b(.2) / 816.1.b   Beginning Step effects precede the Scoring Step (Hold)
 *   316.4             start-of-Main-Phase effects (after scoring)
 *   319.5, 340.1, 383.3.d(.1)  LIFO resolution; turn player orders simultaneous triggers first
 *   323.5 / 323.6     cleanup kills lethal units; empty battlefields become uncontrolled
 *   348.2.a(.1)       non-combat showdown → establish control → Conquer if not yet scored
 *   365.1             passives only active while on the board
 *   383.4.c.2.c / 383.4.d.2.c  Conquer/Hold triggers fire even if the point is negated
 *   431.1.a, 431.2.c, 431.3(.a/.b/.c/.c.1)   Burn Out sequence
 *   443.1.a / 443.2 / 443.4     Skip = replace with nothing (method-specific)
 *   466.1 / 466.5(.d) combat cleanup precedes establishing control / Conquer
 *   469.1 / 469.2 / 470 / 471 / 471.1(.a/.a.1/.b/.b.1) / 471.2.c   Scoring & the Final Point
 *   485.7, 315.3.b    second player channels 3 on their first turn
 */

import { describe, expect, test } from "bun:test";
import { FILLER_UNIT_DEF, Game, P1, P2, basicRuneDef, loadDefaultCardPool, scenario } from "../../harness";

// ---------------------------------------------------------------------------
// Inline filler definitions
// ---------------------------------------------------------------------------

/** Static "Opponents can't gain points." — the shape the card parser emits for Tianna's clause, without her "while I'm at a battlefield" condition. */
const DENY_POINTS = { effect: { restriction: "opponents can't gain points.", type: "restriction" }, type: "static" } as const;
const denier = (might = 1) => ({ abilities: [DENY_POINTS], might, name: "Filler Denier" });

/** "When I conquer, draw 1." */
const CONQUER_DRAW = { effect: { amount: 1, type: "draw" }, trigger: { event: "conquer", on: "self" }, type: "triggered" } as const;
/** "When I hold, draw 1." */
const HOLD_DRAW = { effect: { amount: 1, type: "draw" }, trigger: { event: "hold", on: "self" }, type: "triggered" } as const;
/** "When I conquer, you gain 1 point." (194.1.c bonus point) */
const CONQUER_POINT = { effect: { amount: 1, type: "score" }, trigger: { event: "conquer", on: "self" }, type: "triggered" } as const;
/** "[0]: Return me to base." — a free self-recall so a battlefield can be vacated at will (scenario device). */
const RETURN_TO_BASE = { cost: { energy: 0 }, effect: { target: "self", type: "recall" }, type: "activated" } as const;
/** "When any unit dies, you gain 1 point." */
const ANY_DEATH_POINT = { effect: { amount: 1, type: "score" }, trigger: { event: "die", on: "any-unit" }, type: "triggered" } as const;

const spell = (name: string, effect: Record<string, unknown>) => ({
  abilities: [{ effect, timing: "action", type: "spell" }],
  cardType: "spell",
  energyCost: 0,
  name,
  timing: "action",
});
/** "Deal 3 to a unit." */
const BOLT3 = spell("Filler Bolt", { amount: 3, target: { type: "unit" }, type: "damage" });
/** "Kill a unit." */
const KILL = spell("Filler Cull", { target: { type: "unit" }, type: "kill" });
/** "You lose N points." — modelled as a negative point gain on the caster (the engine has no dedicated lose-points effect). */
const loseSelf = (n: number) => spell(`Filler Tithe ${n}`, { amount: -n, type: "score" });

const legend = (name: string, abilities: readonly unknown[]) => ({ abilities, cardType: "legend", domain: ["fury", "mind"], name });
/** Legend: "At the start of your Beginning Phase, deal 1 to a unit." */
const LEGEND_DAWN_PING = legend("Filler Dawn Pinger", [
  { effect: { amount: 1, target: { type: "unit" }, type: "damage" }, trigger: { event: "beginning-phase", on: "controller", timing: "at" }, type: "triggered" },
]);
/** Legend: "At the start of your Beginning Phase, deal 1 to an enemy unit." */
const LEGEND_DAWN_PING_ENEMY = legend("Filler Dawn Sniper", [
  { effect: { amount: 1, target: { controller: "enemy", type: "unit" }, type: "damage" }, trigger: { event: "beginning-phase", on: "controller", timing: "at" }, type: "triggered" },
]);
/** Legend: "At the start of your Main Phase, deal 1 to an enemy unit." */
const LEGEND_NOON_PING_ENEMY = legend("Filler Noon Sniper", [
  { effect: { amount: 1, target: { controller: "enemy", type: "unit" }, type: "damage" }, trigger: { event: "main-phase", on: "controller", timing: "at" }, type: "triggered" },
]);
/** Legend: "[Exhaust]: You gain 1 point." */
const LEGEND_EXHAUST_POINT = legend("Filler Laurel", [{ cost: { exhaust: true }, effect: { amount: 1, type: "score" }, type: "activated" }]);

/** Battlefield: "Increase the points needed to win the game by 1." (Aspirant's Climb shape) */
const CLIMB_BATTLEFIELD = { abilities: [{ effect: { amount: 1, type: "increase-victory-score" }, type: "static" }], cardType: "battlefield", name: "Filler Summit" };
/** Battlefield: "At the start of each player's first Beginning Phase, that player gains 1 point." (The Arena's Greatest shape) */
const FIRST_DAWN_POINT_BATTLEFIELD = {
  abilities: [
    {
      effect: { amount: 1, type: "score" },
      trigger: { event: "beginning-phase", on: "any-player", restrictions: [{ type: "once-per-game" }], timing: "at" },
      type: "triggered",
    },
  ],
  cardType: "battlefield",
  name: "Filler Arena",
};

// ---------------------------------------------------------------------------
// Static "Opponents can't gain points" denier
// ---------------------------------------------------------------------------

describe("054.1 / 365.1 / 469.1 / 470 / 471.1 — a static 'opponents can't gain points' denier removes the Conquer POINT, not the Conquer", () => {
  function conquerBoard() {
    return scenario()
      .points(P1, 4)
      .points(P2, 2)
      .battlefield("A")
      .battlefield("B", { controller: P2 })
      .unit(P2, "B", denier(), "denier")
      .unit(P1, "base", { abilities: [CONQUER_DRAW], might: 2, name: "Filler Scout" }, "scout")
      .build();
  }

  test("with the denier out, moving Scout alone to empty A still opens a showdown, establishes control (348.2.a), fires 'When I conquer' (383.4.c.2.c) and marks A scored-this-turn (470)", async () => {
    const game = await conquerBoard();
    const hand0 = game.p1.hand().length;
    await game.p1.move("scout", "A");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // 323.8 / 323.12
    await game.settle();
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
    expect(game.locationOf("scout")).toBe("A");
    expect(game.p1.hand()).toHaveLength(hand0 + 1); // conquer trigger resolved
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
    expect(game.chain()).toEqual([]);
  });

  // Expected (054.1, 471.1 "up to one point"): P1 stays on 4 — the gain is forbidden while the denier is on the board.
  // Actual: the engine has no gain-denial static (the parsed `restriction` effect is ignored) → P1 goes to 5.
  test("054.1 / 471.1 — the conquer under an opponents-can't-gain-points static must award NO point; engine awards it", async () => {
    const game = await conquerBoard();
    await game.p1.move("scout", "A");
    await game.settle();
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
    expect(game.p1.points()).toBe(4);
    expect(game.p2.points()).toBe(2);
  });

  test("the denial says 'opponents': on P2's next turn P2 (the denier's controller) Holds B and gains its point normally", async () => {
    const game = await conquerBoard();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.gameState.scoredThisTurn[P2]).toEqual(["B"]);
    expect(game.p2.points()).toBe(3);
  });
});

describe("315.2.b.2 / 469.2 / 383.4.d.2.c — under the denier the Hold still HAPPENS: hold trigger fires, battlefield is scored-this-turn, turn proceeds", () => {
  function holdBoard() {
    return scenario()
      .turn(2)
      .active(P2)
      .points(P1, 3)
      .battlefield("A", { controller: P1 })
      .battlefield("B")
      .unit(P1, "A", { abilities: [HOLD_DRAW], might: 2, name: "Filler Warden" }, "warden")
      .unit(P2, "base", denier(), "denier")
      .build();
  }

  test("P2 ends turn → P1's Scoring Step Holds A: Warden's 'When I hold' goes on the chain and resolves (+1 card), A is marked scored, then Channel (2 runes) and Draw (1) happen", async () => {
    const game = await holdBoard();
    const hand0 = game.p1.hand().length;
    const runes0 = game.p1.runes().length;
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "warden", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
    expect(game.p1.hand()).toHaveLength(hand0 + 2); // hold trigger + draw phase
    expect(game.p1.runes()).toHaveLength(runes0 + 2);
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
  });

  // Expected: P1 stays on 3 (gain forbidden, 054.1) even though the Hold and its trigger happened.
  // Actual: no gain-denial in the engine → 4.
  test("054.1 / 471.1 — the Hold under an opponents-can't-gain-points static must gain NO point; engine awards it", async () => {
    const game = await holdBoard();
    await game.p2.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
    expect(game.p1.points()).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Method-specific denial (Skip — 443)
// ---------------------------------------------------------------------------

describe("443.1.a / 443.2 — 'skip the next point they would gain from CONQUERING' is method-specific: the Hold is untouched, the conquer yields 0 but still Scores", () => {
  /**
   * P2's lingering effect on P1, modelled as a P2 permanent carrying a one-shot score
   * replacement scoped to conquers by the enemy player (443.4: Skip is a replacement effect).
   */
  const SKIP_NEXT_ENEMY_CONQUER_POINT = {
    duration: "next",
    method: "conquer",
    name: "Skip the next point an opponent would gain from conquering",
    replacement: "prevent",
    replaces: "score",
    target: { controller: "enemy", type: "player" },
    type: "replacement",
  } as const;

  function skipBoard() {
    return scenario()
      .turn(2)
      .active(P2)
      .points(P1, 3)
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: P2 })
      .unit(P1, "A", { might: 2, name: "Filler Holder" }, "holder")
      .unit(P2, "B", { might: 1, name: "Filler Weakling" }, "weak")
      .gear(P2, { abilities: [SKIP_NEXT_ENEMY_CONQUER_POINT], name: "Filler Hex Totem" }, "hex")
      .unit(P1, "base", { abilities: [CONQUER_DRAW, RETURN_TO_BASE], might: 3, name: "Filler Raider" }, "raider")
      .unit(P1, "base", { might: 2, name: "Filler Second" }, "second")
      .build();
  }

  // Expected (443.1.a third example, 469.2): Hold is a different method → P1 3→4 at the Scoring Step.
  // Actual: the engine's `score` replacement matcher has no notion of the scoring method — the
  // conquer-only skip also swallows (and is consumed by) the Hold point → P1 stays 3.
  test("443.1.a / 469.2 — a conquer-only skip must not touch the Hold point", async () => {
    const game = await skipBoard();
    await game.p2.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
    expect(game.p1.points()).toBe(4);
  });

  // Expected (443.2, 383.4.c.2.c, 470): the combat conquer of B is replaced with nothing → +0, but the
  // conquer trigger still draws 1 and B is marked scored.
  // Actual: the skip was already (wrongly) spent on the Hold, so the conquer pays out +1.
  test("443.2 — the skipped conquer gains 0 (trigger still fires, B still scored)", async () => {
    const game = await skipBoard();
    await game.p2.endTurn();
    await game.settle();
    const before = game.p1.points();
    const hand0 = game.p1.hand().length;
    await game.p1.move("raider", "B"); // attack: 3 into 1 → defender dies → 466.5.d Conquer
    await game.settle();
    expect(game.zoneOf("weak")).toBe("trash");
    expect(game.gameState.battlefields.B?.controller).toBe(P1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A", "B"]);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.p1.points()).toBe(before);
  });

  test("470 / 471.2.c: after B was conquered once, vacating it (323.6) and re-establishing control the same turn is NOT a Conquer — no point, and B is not listed twice", async () => {
    const game = await skipBoard();
    await game.p2.endTurn();
    await game.settle();
    await game.p1.move("raider", "B");
    await game.settle();
    expect(game.gameState.battlefields.B?.controller).toBe(P1);
    const afterFirst = game.p1.points();

    await game.p1.activate("raider", 1); // "[0]: Return me to base."
    await game.settle();
    expect(game.locationOf("raider")).toBe("base");
    expect(game.gameState.battlefields.B?.controller).toBeNull(); // 323.6
    await game.p1.move("second", "B");
    await game.settle();
    expect(game.gameState.battlefields.B?.controller).toBe(P1);
    expect(game.p1.points()).toBe(afterFirst);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A", "B"]);
  });
});

// ---------------------------------------------------------------------------
// 470 — once per battlefield per turn (no denier)
// ---------------------------------------------------------------------------

describe("469.1 / 469.2 / 470 / 471.2.c — a same-turn control flip: re-establishing control of a battlefield already Scored (by Hold OR Conquer) is not a second Score", () => {
  function flipBoard() {
    return scenario()
      .turn(2)
      .active(P2)
      .points(P1, 2)
      .battlefield("A", { controller: P1 })
      .battlefield("B")
      .unit(P1, "A", { abilities: [CONQUER_DRAW, RETURN_TO_BASE], might: 2, name: "Filler U1" }, "u1")
      .unit(P1, "base", { abilities: [CONQUER_DRAW, RETURN_TO_BASE], might: 2, name: "Filler U2" }, "u2")
      .unit(P1, "base", { might: 2, name: "Filler U3" }, "u3")
      .unit(P1, "base", { abilities: [CONQUER_DRAW], might: 2, name: "Filler U4" }, "u4")
      .build();
  }

  test("Hold A (→3), Conquer B (→4, U2 draws 1); both units return to base, A and B lapse (323.6); re-taking A with U3 and B with U4 (a standard move exhausts, so fresh units) gives NO points and scored-this-turn stays [A,B]; next P1 turn Holds both for +2", async () => {
    const game = await flipBoard();
    await game.p2.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(3);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);

    const hand0 = game.p1.hand().length;
    await game.p1.move("u2", "B");
    await game.settle();
    expect(game.gameState.battlefields.B?.controller).toBe(P1);
    expect(game.p1.points()).toBe(4);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A", "B"]);

    await game.p1.activate("u1", 1);
    await game.settle();
    await game.p1.activate("u2", 1);
    await game.settle();
    expect(game.locationOf("u1")).toBe("base");
    expect(game.locationOf("u2")).toBe("base");
    expect(game.gameState.battlefields.A?.controller).toBeNull();
    expect(game.gameState.battlefields.B?.controller).toBeNull();

    await game.p1.move("u3", "A");
    await game.settle();
    await game.p1.move("u4", "B");
    await game.settle();
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
    expect(game.gameState.battlefields.B?.controller).toBe(P1);
    expect(game.p1.points()).toBe(4); // A was Held, B was Conquered — neither can Score again this turn
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A", "B"]);
    expect(game.isOver()).toBe(false);

    // Per-turn reset: after P2's turn, P1 Holds A and B normally.
    await game.advanceTurn(); // → P2
    expect(game.p1.points()).toBe(4);
    await game.advanceTurn(); // → P1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(6);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(expect.arrayContaining(["A", "B"]));
  });

  // Expected (471.2.c "these will only trigger when the Battlefield is Scored"): U4 taking already-scored B is not a
  // Conquer, so U4's "When I conquer, draw 1" must NOT fire — exactly one extra card (U2's) all turn.
  // Actual: the non-combat-showdown control change re-emits a `conquer` event → U4 draws as well.
  test("471.2.c — 'When I conquer' must not trigger when control of an already-scored battlefield is re-established the same turn; engine fires it", async () => {
    const game = await flipBoard();
    await game.p2.endTurn();
    await game.settle();
    const hand0 = game.p1.hand().length;
    await game.p1.move("u2", "B");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    await game.p1.activate("u2", 1);
    await game.settle();
    expect(game.locationOf("u2")).toBe("base");
    expect(game.gameState.battlefields.B?.controller).toBeNull();
    await game.p1.move("u4", "B");
    await game.settle();
    expect(game.gameState.battlefields.B?.controller).toBe(P1);
    expect(game.p1.points()).toBe(4);
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });
});

// ---------------------------------------------------------------------------
// Denier leaves mid-turn — nothing retroactive
// ---------------------------------------------------------------------------

describe("470 / 471.1 / 365.1 — the denier dying mid-turn grants nothing retroactively, the denied battlefield stays 'scored', but an unscored battlefield now scores", () => {
  function midTurnBoard() {
    return scenario()
      .turn(2)
      .active(P2)
      .points(P1, 4)
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: P2 })
      .unit(P1, "A", { abilities: [RETURN_TO_BASE], might: 2, name: "Filler Watch" }, "w")
      .unit(P2, "B", denier(1), "denier")
      .unit(P1, "base", { might: 2, name: "Filler Runner A" }, "ra")
      .unit(P1, "base", { abilities: [CONQUER_DRAW], might: 2, name: "Filler Runner B" }, "rb")
      .hand(P1, BOLT3, "bolt")
      .build();
  }

  // Expected: Scoring Step under denial → P1 stays 4 (A scored for 0); killing the denier afterwards changes nothing (still 4).
  // Actual: no denial → the Hold already paid 5.
  test("054.1 / 471.1 — Hold under denial pays 0 and killing the denier later in the turn does NOT add the point back; engine paid the Hold up front", async () => {
    const game = await midTurnBoard();
    await game.p2.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
    expect(game.p1.points()).toBe(4);
    await game.p1.cast("bolt", { targets: "denier" });
    await game.settle();
    expect(game.zoneOf("denier")).toBe("trash"); // 323.5
    expect(game.gameState.battlefields.B?.controller).toBeNull(); // 323.6
    expect(game.p1.points()).toBe(4);
  });

  test("after the Hold, A is scored-this-turn: once the denier is dead, vacating and re-taking A is NOT a Conquer (+0) while taking B (unscored, denier gone) IS (+1, and its conquer trigger draws)", async () => {
    const game = await midTurnBoard();
    await game.p2.endTurn();
    await game.settle();
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
    await game.p1.cast("bolt", { targets: "denier" });
    await game.settle();
    expect(game.zoneOf("denier")).toBe("trash");
    const base = game.p1.points();
    const hand0 = game.p1.hand().length;

    await game.p1.activate("w");
    await game.settle();
    expect(game.gameState.battlefields.A?.controller).toBeNull();
    await game.p1.move("ra", "A");
    await game.settle();
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
    expect(game.p1.points()).toBe(base); // 470: A already scored this turn (for 0 points — still counts)
    expect(game.p1.hand()).toHaveLength(hand0);

    await game.p1.move("rb", "B");
    await game.settle();
    expect(game.gameState.battlefields.B?.controller).toBe(P1);
    expect(game.p1.points()).toBe(base + 1); // nothing forbids any more (365.1)
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A", "B"]);
  });
});

describe("466.1 → 466.5.d / 365.1 — killing the denier in the very combat that conquers its battlefield: it is in the trash before control is established, so the point is gained", () => {
  test("Might-4 attacker into the lone Might-2 denier at B: denier dies in the Combat Cleanup (466.1/323.5), THEN P1 establishes control and Conquers (466.5.d) → 5→6", async () => {
    const game = await scenario()
      .points(P1, 5)
      .battlefield("A")
      .battlefield("B", { controller: P2 })
      .unit(P2, "B", denier(2), "denier")
      .unit(P1, "base", { might: 4, name: "Filler Bruiser" }, "bruiser")
      .build();
    await game.p1.move("bruiser", "B");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // 323.9/323.13 combat showdown, attacker has Focus
    await game.settle();
    expect(game.zoneOf("denier")).toBe("trash");
    expect(game.locationOf("bruiser")).toBe("B");
    expect(game.state("bruiser").damage).toBe(0); // healed in the combat cleanup
    expect(game.gameState.battlefields.B?.controller).toBe(P1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["B"]);
    expect(game.p1.points()).toBe(6);
  });

  // Expected: with a SECOND denier surviving in P2's base the same combat conquers B but P1 stays 5.
  // Actual: no gain-denial in the engine → 6.
  test("054.1 — contrast: a second denier that survives in P2's base keeps denying, so the same combat conquer yields no point; engine awards it", async () => {
    const game = await scenario()
      .points(P1, 5)
      .battlefield("A")
      .battlefield("B", { controller: P2 })
      .unit(P2, "B", denier(2), "denier")
      .unit(P2, "base", denier(1), "denier2")
      .unit(P1, "base", { might: 4, name: "Filler Bruiser" }, "bruiser")
      .build();
    await game.p1.move("bruiser", "B");
    await game.settle();
    expect(game.zoneOf("denier")).toBe("trash");
    expect(game.zoneOf("denier2")).toBe("base");
    expect(game.gameState.battlefields.B?.controller).toBe(P1);
    expect(game.p1.points()).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Beginning Step precedes the Scoring Step
// ---------------------------------------------------------------------------

describe("315.2.a → 315.2.b / 816.1.b — start-of-Beginning-Phase effects fully resolve BEFORE the Scoring Step Holds", () => {
  // Denial-independent probe. Expected: the legend's Beginning-Step trigger kills P1's own lone Might-1
  // holder at A; the cleanup (323.5/323.6) leaves A uncontrolled before the Scoring Step → no Hold → P1 stays 6.
  // Actual: the engine performs Hold scoring inside the same step that ENQUEUES the trigger, before it resolves → 7.
  test.failing("BUG: 315.2.a→b — the Hold is scored before start-of-Beginning-Phase triggers resolve (a trigger that empties the battlefield should prevent the Hold)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .points(P1, 6)
      .battlefield("A", { controller: P1 })
      .battlefield("B")
      .unit(P1, "A", { might: 1, name: "Filler Frail Holder" }, "frail")
      .legend(P1, LEGEND_DAWN_PING, "dawn")
      .build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dawn", triggered: true })]);
    expect(game.p1.points()).toBe(6); // Scoring Step has not happened yet
    await game.settle({ policy: "first" }); // only legal target: frail
    expect(game.zoneOf("frail")).toBe("trash");
    expect(game.gameState.battlefields.A?.controller).toBeNull();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(6);
    expect(game.gameState.scoredThisTurn[P1] ?? []).not.toContain("A");
  });

  // Expected: Beginning Step trigger kills the (only enemy) denier → by the Scoring Step nothing forbids → 6→7;
  // and while the trigger is still pending the Hold has not been scored yet (points 6 at that moment).
  // Actual: Hold is scored immediately at phase entry (7 while the trigger is still on the chain).
  test.failing("BUG: 315.2.a→b — with the denier sniped by a start-of-Beginning-Phase trigger the Hold scores (→7), but only AFTER that trigger resolved; engine scores first", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .points(P1, 6)
      .battlefield("A", { controller: P1 })
      .battlefield("B")
      .unit(P1, "A", { might: 2, name: "Filler Holder" }, "h")
      .unit(P2, "base", denier(1), "denier")
      .legend(P1, LEGEND_DAWN_PING_ENEMY, "dawn")
      .build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dawn", triggered: true })]);
    expect(game.p1.points()).toBe(6);
    await game.settle();
    expect(game.zoneOf("denier")).toBe("trash");
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(7);
  });

  // Mirror. Expected: a start-of-MAIN-Phase snipe (316.4) kills the denier only after the Scoring Step → the Hold
  // was denied → P1 stays 6 all turn (nothing retroactive).
  // Actual: no denial → 7.
  test("054.1 / 316.4 — mirror: sniping the denier at the start of the Main Phase is too late, the Hold stayed denied (P1 6); engine has no denial", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .points(P1, 6)
      .battlefield("A", { controller: P1 })
      .battlefield("B")
      .unit(P1, "A", { might: 2, name: "Filler Holder" }, "h")
      .unit(P2, "base", denier(1), "denier")
      .legend(P1, LEGEND_NOON_PING_ENEMY, "noon")
      .build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("denier")).toBe("trash");
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
    expect(game.p1.points()).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// The Final Point (471.1.b)
// ---------------------------------------------------------------------------

describe("471.1.a.1 / 471.1.b(.1) — the Final Point: a lone Conquer draws instead; a Hold just takes it", () => {
  function holdAtSeven() {
    return scenario()
      .turn(2)
      .active(P2)
      .points(P1, 7)
      .points(P2, 3)
      .victoryScore(8)
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: P2 })
      .unit(P1, "A", { might: 2, name: "Filler Holder" }, "h")
      .unit(P2, "B", { might: 2, name: "Filler Squatter" }, "sq")
      .build();
  }

  test("run (a) HOLD: P1 on 7 holds A at the Scoring Step → 8 (Hold is not subject to the Final Point restriction), no draw-instead, B (P2's) untouched", async () => {
    const game = await holdAtSeven();
    const hand0 = game.p1.hand().length;
    await game.p2.endTurn();
    expect(game.p1.points()).toBe(8);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
    expect(game.p1.hand().length).toBeLessThanOrEqual(hand0 + 1); // at most the Draw Phase card, never a "draw instead"
  });

  // Expected (472 / 323.1 / 194.2): 8 ≥ VS and more than P2 → P1 wins at the next cleanup; game over, winner P1.
  // Actual: the Beginning-Phase hold raises P1 to 8 but the game status never flips — play continues.
  test("472 / 323.1 — reaching the Victory Score by Hold must end the game (winner P1); engine keeps playing", async () => {
    const game = await holdAtSeven();
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  // Expected (471.1.b.1): P1 on 7 with nothing held conquers empty A → has NOT scored every battlefield → draws 1
  // INSTEAD of the point (stays 7); the conquer trigger still fires (+1 more card); A is marked scored; no winner.
  // Actual: the showdown-conquer path pays the point unconditionally → 8, game over, trigger never resolves.
  test("471.1.b.1 — run (b) LONE CONQUER at 7 must draw instead of taking the Final Point (trigger still fires, A scored, game continues); engine awards the win", async () => {
    const game = await scenario()
      .points(P1, 7)
      .points(P2, 3)
      .victoryScore(8)
      .battlefield("A")
      .battlefield("B", { controller: P2 })
      .unit(P2, "B", { might: 2, name: "Filler Squatter" }, "sq")
      .unit(P1, "base", { abilities: [CONQUER_DRAW], might: 2, name: "Filler Scout" }, "scout")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("scout", "A");
    await game.settle();
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
    expect(game.p1.hand()).toHaveLength(hand0 + 2); // 1 from the rule + 1 from the trigger
  });
});

describe("470 / 471.1.b.1 — two conquers in one turn at match point: the first draws (and still counts as Scored), the second completes 'every battlefield' and wins", () => {
  // Expected: (1) conquer empty A → draw instead, 7, A scored; (2) attack B, kill the defender, 466.5.d conquer →
  // every battlefield (A,B) scored this turn → Final Point → 8 → P1 wins; no second draw.
  // Actual: step (1) already awards the 8th point and ends the game.
  test("471.1.b.1 — first lone conquer must draw (not win); only the second conquer of the last unscored battlefield takes the Final Point", async () => {
    const game = await scenario()
      .points(P1, 7)
      .points(P2, 2)
      .victoryScore(8)
      .battlefield("A")
      .battlefield("B", { controller: P2 })
      .unit(P2, "B", { might: 1, name: "Filler Weakling" }, "weak")
      .unit(P1, "base", { might: 2, name: "Filler U1" }, "u1")
      .unit(P1, "base", { might: 3, name: "Filler U2" }, "u2")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("u1", "A");
    await game.settle();
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]); // scored for 0 points — still Scored (469.1/470)
    expect(game.isOver()).toBe(false);

    await game.p1.move("u2", "B");
    await game.settle();
    expect(game.zoneOf("weak")).toBe("trash");
    expect(game.gameState.battlefields.B?.controller).toBe(P1);
    expect(game.p1.hand()).toHaveLength(hand0 + 1); // no second draw
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });
});

describe("194.1.c / 471.1.a.1 / 383.4.c.2.c — a 'When I conquer, you gain 1 point' trigger is exempt from the Final Point restriction (but not from denial)", () => {
  function ascendantBoard(points: number, withDenier = false) {
    const b = scenario()
      .points(P1, points)
      .points(P2, 1)
      .victoryScore(8)
      .battlefield("A")
      .battlefield("B", { controller: P2 })
      .unit(P2, "B", { might: 2, name: "Filler Squatter" }, "sq")
      .unit(P1, "base", { abilities: [CONQUER_POINT, RETURN_TO_BASE], might: 3, name: "Filler Ascendant" }, "asc");
    // rule 144.2: exhausting the unit is the COST of a Standard Move, so "asc"
    // cannot move a second time this turn — the post-denier conquer needs a
    // fresh body carrying the same "When I conquer, you gain 1 point".
    return (
      withDenier
        ? b
            .unit(P2, "base", denier(1), "denier")
            .unit(P1, "base", { abilities: [CONQUER_POINT], might: 3, name: "Filler Ascendant II" }, "asc2")
            .hand(P1, BOLT3, "bolt")
        : b
    ).build();
  }

  test("run (b) from 6: the conquer point (7) is granted at the conquer; the trigger then sits on the chain with NO winner yet; only after it resolves (8) does the following cleanup declare P1 the winner (319.5 → 323.1)", async () => {
    const game = await ascendantBoard(6);
    await game.p1.move("asc", "A");
    await game.p1.passFocus();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.passFocus(); // showdown closes → 348.2.a control → Conquer
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "asc", triggered: true })]);

    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  // Expected: from 7 the conquer point is replaced by a draw (471.1.b.1) → 7 & hand +1; the trigger still goes on the
  // chain (383.4.c.2.c) and its ability point is NOT a Conquer point (471.1.a.1) → 8 → P1 wins after it resolves.
  // Actual: the conquer itself pays the 8th point and ends the game; no draw, trigger never resolves.
  test("471.1.b.1 / 471.1.a.1 — run (a) from 7: draw instead of the conquer point, THEN the trigger's point wins it; engine wins on the conquer with no draw", async () => {
    const game = await ascendantBoard(7);
    const hand0 = game.p1.hand().length;
    await game.p1.move("asc", "A");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.isOver()).toBe(false);
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  // Expected (054.1, 055): under the denier the conquer pays 0 and the trigger resolves doing nothing → 3; killing the
  // denier later adds nothing back; a fresh conquer of B afterwards pays conquer +1 and trigger +1 → 5.
  // Actual: no denial → 5 already after the first conquer.
  test("054.1 / 055 — run (c) under a denier: conquer 0 + trigger 0 (impossible instruction) = 3; after the denier dies, conquering B pays 1+1 → 5; engine never denies", async () => {
    const game = await ascendantBoard(3, true);
    await game.p1.move("asc", "A");
    await game.settle();
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
    expect(game.chain()).toEqual([]); // the trigger was added and has resolved (to nothing)
    expect(game.p1.points()).toBe(3);

    await game.p1.cast("bolt", { targets: "denier" });
    await game.settle();
    expect(game.zoneOf("denier")).toBe("trash");
    expect(game.p1.points()).toBe(3); // nothing retroactive

    await game.p1.move("asc2", "B"); // 3 into 2: kills the squatter, conquers B
    await game.settle();
    expect(game.gameState.battlefields.B?.controller).toBe(P1);
    expect(game.p1.points()).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Altered Victory Score
// ---------------------------------------------------------------------------

describe("194.3.a / 483.3.a — a raised Victory Score (9) shifts BOTH the win check and the Final-Point threshold", () => {
  function nineBoard(p1Points: number, holdA = false) {
    const b = scenario()
      .turn(2)
      .active(holdA ? P2 : P1)
      .points(P1, p1Points)
      .points(P2, 2)
      .victoryScore(9)
      .battlefield("A", { controller: holdA ? P1 : null })
      .battlefield("B", { controller: P2 })
      .unit(P2, "B", { might: 2, name: "Filler Squatter" }, "sq")
      .unit(P1, holdA ? "A" : "base", { might: 2, name: "Filler Scout" }, "scout");
    return b.build();
  }

  test("(a) at 7 with VS 9 a lone conquer is NOT within one of the Victory Score → gains the point normally (8), no draw-instead, and 8 < 9 does not win", async () => {
    const game = await nineBoard(7);
    const hand0 = game.p1.hand().length;
    await game.p1.move("scout", "A");
    await game.settle();
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
  });

  // Expected: at 8 with VS 9 the lone conquer IS within one → draw 1 instead, stay 8, no win.
  // Actual: showdown-conquer path pays the point → 9 → win.
  test("471.1.b.1 with VS 9 — (b) at 8 a lone conquer must draw instead (stay 8, no win); engine awards the 9th point", async () => {
    const game = await nineBoard(8);
    const hand0 = game.p1.hand().length;
    await game.p1.move("scout", "A");
    await game.settle();
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.isOver()).toBe(false);
  });

  // Expected: (c) at 8 holding A at the Scoring Step → 9 → wins at cleanup.
  // Actual: hold reaches 9 but status never flips (same defect as the VS-8 hold win).
  test("472 with VS 9 — (c) at 8 a Hold reaches 9 and wins; engine reaches 9 but keeps playing", async () => {
    const game = await nineBoard(8, true);
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.points()).toBe(9);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("(d) sanity: with VS 9, P2 reaching exactly 8 by Hold never ends the game", async () => {
    const game = await scenario()
      .points(P1, 2)
      .points(P2, 7)
      .victoryScore(9)
      .battlefield("A")
      .battlefield("B", { controller: P2 })
      .unit(P2, "B", { might: 2, name: "Filler Squatter" }, "sq")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(8);
    expect(game.isOver()).toBe(false);
    await game.advanceTurn(); // a full further turn of cleanups
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
  });

  // Expected (194.3.a, 365.1): a NON-inert battlefield in play whose static reads "Increase the points needed to win the
  // game by 1" makes the effective Victory Score 9, so conquering to 8 does not win.
  // Actual: the engine applies `increase-victory-score` only once during full game setup (victoryScoreModifier); a
  // battlefield that is simply in play contributes nothing → P1 wins at 8.
  test("194.3.a / 365.1 — an in-play battlefield static 'increase the points needed to win by 1' is not derived from the board (only from game setup); reaching 8 still wins", async () => {
    const game = await scenario()
      .points(P1, 7)
      .points(P2, 2)
      .battlefield("summit", { def: CLIMB_BATTLEFIELD, inert: false })
      .battlefield("B", { controller: P2 })
      .unit(P2, "B", { might: 2, name: "Filler Squatter" }, "sq")
      .unit(P1, "base", { might: 2, name: "Filler Scout" }, "scout")
      .build();
    await game.p1.move("scout", "summit");
    await game.settle();
    expect(game.gameState.battlefields.summit?.controller).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 0-point floor
// ---------------------------------------------------------------------------

describe("194.4 — players cannot have fewer than 0 points", () => {
  test("run (b) control: 'you lose 1 point' at 3 → 2 (a real loss happens)", async () => {
    const game = await scenario().points(P1, 3).hand(P1, loseSelf(1), "tithe").build();
    await game.p1.cast("tithe");
    await game.settle();
    expect(game.zoneOf("tithe")).toBe("trash");
    expect(game.p1.points()).toBe(2);
    expect(game.p2.points()).toBe(0);
  });

  // Expected (194.4.a): losing a point at 0 does nothing — total stays 0.
  // Actual: victoryPoints is not floored; the total becomes −1.
  test("194.4.a — run (a): 'you lose 1 point' at 0 leaves the total at 0", async () => {
    const game = await scenario().points(P1, 0).hand(P1, loseSelf(1), "tithe").build();
    await game.p1.cast("tithe");
    await game.settle();
    expect(game.p1.points()).toBe(0);
  });

  // Expected (194.4 "cannot have less than 0"): losing 2 at 1 clamps to 0.
  // Actual: −1.
  test("194.4 — run (c): 'you lose 2 points' at 1 clamps to 0", async () => {
    const game = await scenario().points(P1, 1).hand(P1, loseSelf(2), "tithe2").build();
    await game.p1.cast("tithe2");
    await game.settle();
    expect(game.p1.points()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Ties at / above the Victory Score
// ---------------------------------------------------------------------------

describe("194.2(.a/.b) / 323.1 / 472 — both players at the Victory Score is a tie: play continues until someone has MORE at a cleanup; being on 8 still cannot lone-conquer the 9th", () => {
  function tieBoard() {
    return scenario()
      .points(P1, 8)
      .points(P2, 8)
      .victoryScore(8)
      .battlefield("A")
      .battlefield("B", { controller: P2 })
      .unit(P2, "B", { might: 2, name: "Filler Squatter" }, "sq")
      .unit(P1, "base", { abilities: [CONQUER_DRAW], might: 2, name: "Filler Scout" }, "scout")
      .legend(P1, LEGEND_EXHAUST_POINT, "laurel")
      .rune(P1, "fury", { alias: "f1" })
      .build();
  }

  test("8–8 in P1's Main Phase: an ordinary action and its cleanup declare NO winner (neither has more than every opponent); the game is not a draw either", async () => {
    const game = await tieBoard();
    expect(game.isOver()).toBe(false);
    await game.p1.tapRune("f1");
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // Expected (471.1.b: "1 point from the Victory Score OR HIGHER"): at 8 the lone conquer of A draws instead → still 8–8,
  // no winner; the conquer trigger still fires.
  // Actual: the conquer pays a 9th point → P1 wins.
  test.failing("BUG: 471.1.b — at 8 (≥ VS−1) a lone conquer must draw instead of scoring the 9th; engine awards it and ends the game", async () => {
    const game = await tieBoard();
    const hand0 = game.p1.hand().length;
    await game.p1.move("scout", "A");
    await game.settle();
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(false);
    expect(game.p1.hand()).toHaveLength(hand0 + 2);
  });

  test("an activated '[Exhaust]: you gain 1 point' (194.1.c, exempt from Final-Point rules 471.1.a.1) → 9 > 8 → P1 wins at the following cleanup", async () => {
    const game = await tieBoard();
    await game.p1.activate("laurel");
    await game.settle();
    expect(game.p1.points()).toBe(9);
    expect(game.p2.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  // Expected: P1 passes the turn at 8–8; P2's Scoring Step Holds B → 9 > 8 → P2 wins.
  // Actual: P2 reaches 9 but the hold path never ends the game.
  test("472 — alternative ending: P1 ends the turn, P2 Holds B → 9 and wins; engine keeps playing", async () => {
    const game = await tieBoard();
    await game.p1.endTurn();
    await game.settle();
    expect(game.p2.points()).toBe(9);
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
  });
});

// ---------------------------------------------------------------------------
// LIFO decides simultaneous point triggers
// ---------------------------------------------------------------------------

describe("383.3.d.1 / 340.1 / 319.5 / 323.1 — two 'when any unit dies, you gain 1 point' triggers off one death: turn player's goes on the chain first, so the OTHER player's resolves first and wins at 7–7", () => {
  function lifoBoard(active: typeof P1) {
    return scenario()
      .active(active)
      .points(P1, 7)
      .points(P2, 7)
      .victoryScore(8)
      .battlefield("A")
      .unit(P1, "base", { abilities: [ANY_DEATH_POINT], might: 2, name: "Filler Vulture X" }, "x")
      .unit(P2, "base", { abilities: [ANY_DEATH_POINT], might: 2, name: "Filler Vulture Y" }, "y")
      .unit(active === P1 ? P2 : P1, "base", { might: 1, name: "Filler Token" }, "t")
      .hand(active, KILL, "cull")
      .build();
  }

  test("P1's turn: P1 kills T → X (P1) is placed first, Y (P2) on top → Y resolves → P2 8 > 7 → P2 wins immediately at that cleanup; X never resolves; final 7–8", async () => {
    const game = await lifoBoard(P1);
    await game.p1.cast("cull", { targets: "t" });
    await game.settle();
    expect(game.zoneOf("t")).toBe("trash");
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.p2.points()).toBe(8);
    expect(game.p1.points()).toBe(7); // not an 8–8 batch, not turn-player-first
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "x", controller: P1, triggered: true })]); // still waiting, never resolved
  });

  test("mirror on P2's turn: P2 kills T → Y first, X on top → X resolves → P1 wins 8–7", async () => {
    const game = await lifoBoard(P2);
    await game.p2.cast("cull", { targets: "t" });
    await game.settle();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.p2.points()).toBe(7);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "y", controller: P2, triggered: true })]);
  });
});

// ---------------------------------------------------------------------------
// Second player's first turn
// ---------------------------------------------------------------------------

describe("485.7 / 315.3.b / 315.2.a — the second player's first turn: 3 runes channelled; a 'first Beginning Phase' point is an ordinary (deniable, non-recurring) gain", () => {
  test("standard duel from decks: P1 channels 2 on turn 1, P2 channels 2 + 1 extra = 3 on turn 2, and only 2 on P2's second turn", async () => {
    const pool = await loadDefaultCardPool();
    const runeDef = basicRuneDef(pool, "fury");
    const bf = pool.all().find((c) => c.cardType === "battlefield" && !((c.abilities as unknown[] | undefined)?.length)) ?? pool.all().find((c) => c.cardType === "battlefield");
    const deck = { battlefieldIds: [bf?.id as string], mainDeckCardIds: Array(40).fill("ogn-175-298"), runeDeckCardIds: Array(12).fill(runeDef.id as string) };
    const game = await Game.fromDecks({ p1: deck, p2: deck });
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.runes()).toHaveLength(2);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.runes()).toHaveLength(3);
    expect(game.p2.runeDeck()).toHaveLength(9);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.runes()).toHaveLength(5);
  });

  // Expected (315.2.a, 190.6.b, 194.1.c): an uncontrolled battlefield reading "At the start of each player's first
  // Beginning Phase, that player gains 1 point" fires in P2's first Beginning Step (handled by the turn player) → P2 = 1,
  // and does NOT fire again on P2's second turn (still 1). P1 likewise got exactly 1 on its own first turn.
  // Actual: the `once-per-game` trigger restriction is unknown to the trigger matcher, which then blocks the trigger
  // entirely — nobody ever gains the point.
  test("315.2.a — a 'first Beginning Phase: that player gains 1 point' battlefield trigger never fires (once-per-game restriction unsupported)", async () => {
    const game = await scenario()
      .turn(1)
      .active(P1)
      .battlefield("arena", { def: FIRST_DAWN_POINT_BATTLEFIELD, inert: false })
      .battlefield("B")
      .build();
    await game.p1.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.gameState.scoredThisTurn[P2] ?? []).toEqual([]); // not a Hold/Conquer — just a gain
    await game.advanceTurn(); // → P1 (its 2nd Beginning Phase in this scenario's history: no point)
    await game.advanceTurn(); // → P2's SECOND turn: must not re-fire
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });

  // Expected (054.1): with P1's denier in P1's base (played turn 1), P2's first-Beginning-Phase gain is forbidden → 0;
  // P2 still channels and draws; killing the denier in P2's Main Phase does not bring the point back (the moment passed).
  // Actual: neither denial nor the once-per-game trigger exists in the engine; P2 is 0 for the wrong reason, so this
  // is pinned to the observable that distinguishes the two: with NO denier P2 must be on 1 (see previous test) while
  // WITH the denier P2 must be on 0 — asserted together.
  test("054.1 / 315.2.a — the first-Beginning-Phase point is denied by an opposing can't-gain-points static and never regained after the denier dies", async () => {
    const build = (withDenier: boolean) => {
      const b = scenario()
        .turn(1)
        .active(P1)
        .battlefield("arena", { def: FIRST_DAWN_POINT_BATTLEFIELD, inert: false })
        .battlefield("B")
        .hand(P2, BOLT3, "bolt");
      return (withDenier ? b.unit(P1, "base", denier(1), "denier") : b).build();
    };
    const free = await build(false);
    await free.p1.endTurn();
    await free.settle();
    expect(free.p2.points()).toBe(1);

    const denied = await build(true);
    await denied.p1.endTurn();
    await denied.settle();
    expect(denied.turnPlayer()).toBe(P2);
    expect(denied.p2.points()).toBe(0);
    await denied.p2.cast("bolt", { targets: "denier" });
    await denied.settle();
    expect(denied.zoneOf("denier")).toBe("trash");
    expect(denied.p2.points()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Burn Out overrides denial after the first point in a sequence
// ---------------------------------------------------------------------------

describe("315.4.b.1 / 431 — Burn Out with an empty deck AND trash: the first point is an ordinary (deniable) gain, every later one in the sequence cannot be prevented and wins immediately", () => {
  // Expected: P2 (deck+trash empty, denier in play) reaches its Draw Phase → burn out #1: P1's gain is DENIED (6);
  // deck still empty → burn out #2, #3: 431.3.b unpreventable → 7, 8 → 431.3.c.1 P1 wins immediately (no cleanup
  // needed); P2 never draws; no infinite loop.
  // Actual: the engine performs a single burn-out (+1 → 7, ignoring the denier), skips the impossible draw and
  // carries on with P2's turn; no repeat, no win.
  test("431.3 / 431.3.b / 431.3.c.1 — repeated Burn Out must keep awarding (undeniable) points until P1 wins at 8; engine burns out once and plays on", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .points(P1, 6)
      .points(P2, 3)
      .victoryScore(8)
      .fillDecks(false)
      .deck(P1, [FILLER_UNIT_DEF, FILLER_UNIT_DEF, FILLER_UNIT_DEF])
      .runeDeck(P1, [{ cardType: "rune", domain: "fury", name: "Fury Rune" }])
      .runeDeck(P2, [{ cardType: "rune", domain: "fury", name: "Fury Rune" }, { cardType: "rune", domain: "fury", name: "Fury Rune" }])
      .unit(P2, "base", denier(1), "denier")
      .build();
    expect(game.p2.deck()).toEqual([]);
    expect(game.p2.trash()).toEqual([]);
    await game.p1.endTurn();
    await game.settle();
    expect(game.p2.hand()).toEqual([]); // P2 never gets to draw
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.p1.points()).toBe(8); // 6 (first burn-out point denied) → 7 → 8, not 9+
    expect(game.p2.points()).toBe(3);
  });
});
