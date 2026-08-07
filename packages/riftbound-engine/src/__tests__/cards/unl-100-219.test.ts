/**
 * Voracious Gromp — unl-100-219 · Unit · Body · 5 energy (no power) · 5 Might
 *
 *   [Hunt 3] (When I conquer or hold, gain 3 XP.)
 *
 * Rules: 823 (Hunt X ≡ "When I conquer or hold, my controller gains X XP"; it is BOTH a conquer and a
 * hold effect, 823.1.b), 383.4.c.2.a / 383.4.d.2.a (only units PRESENT at the scored battlefield
 * trigger), 471.2.c (a battlefield scores at most once per turn per player), 315.2.b (Hold happens in
 * the TURN player's Scoring Step), 728 (XP).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. Exactly 3 per score: the registry carries the Hunt keyword AND explicit conquer/hold triggers —
 *     the engine must not fire both (3, never 6).
 *  2. Presence: Gromp dying in the very combat his side wins (defender dumps lethal on him) is not
 *     "present at the conquer" → 0 XP even though his controller conquers; Gromp in base / at another
 *     battlefield while a friend conquers elsewhere → 0 XP.
 *  3. Hold is YOUR Scoring Step only: nothing at the opponent's turn start; and a failed attack
 *     (defender survives) is no conquer.
 *  4. Doublers: Red Brambleback here doubles the CONQUER half (6 XP); Blue Sentinel here doubles the
 *     HOLD half (6 XP). Two Hunt units conquering together sum (Gromp 3 + Scorchclaw 2 = 5).
 *  5. XP is banked immediately: after a conquer, Crowd Favorite's "Spend 2 XP: Buff me" is payable
 *     the same turn (3 → 1).
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-100-219";
const SCORCHCLAW = "unl-016-219"; // Fury 3: [Hunt 2] …
const BRAMBLEBACK = "unl-029-219"; // Fury 4: Your conquer effects for conquering here trigger an additional time. When I conquer, Buff a friendly unit.
const BLUE_SENTINEL = "unl-087-219"; // Mind 4: Your hold effects for holding here trigger an additional time. …
const CROWD_FAVORITE = "unl-102-219"; // Body 3: [Hunt] / Spend 2 XP: [Buff] me.

describe("Voracious Gromp (unl-100-219)", () => {
  test("cost: 5 energy, no power → a 5-Might Hunt unit that enters the base exhausted; 4 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "gromp").build();
    await game.p1.play("gromp");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("gromp")).toMatchObject({ baseMight: 5, isExhausted: true, might: 5, zone: "base" });
    expect(game.state("gromp").keywords).toContain("Hunt");
    expect(game.chain()).toEqual([]); // no play effect
    expect(game.p1.xp()).toBe(0);
    expect((await scenario().resources(P1, { energy: 4, power: { body: 3 } }).hand(P1, CARD, "g").build()).p1.can("play", "g")).toBe(false);
  });

  test("conquer (walk onto an open battlefield): +1 point and EXACTLY 3 XP — the keyword and its trigger are one ability, not two", async () => {
    const game = await scenario().battlefield("bf1", { controller: null }).unit(P1, "base", CARD, "gromp").build();
    await game.p1.move("gromp", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(3);
    expect(game.p2.xp()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("conquer through combat: 5 Might kills a 4-Might defender, survives its 4 damage, takes bf1 → 3 XP", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 4, name: "Warden" }, "warden").unit(P1, "base", CARD, "gromp").build();
    await game.p1.move("gromp", "bf1");
    await game.settle();
    expect(game.zoneOf("warden")).toBe("trash");
    expect(game.locationOf("gromp")).toBe("bf1");
    expect(game.state("gromp").damage).toBe(0); // healed in combat cleanup
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.xp()).toBe(3);
  });

  test("negative space — a failed attack (6-Might defender survives, Gromp dies) is no conquer: 0 points, 0 XP", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 6, name: "Wall" }, "wall").unit(P1, "base", CARD, "gromp").build();
    await game.p1.move("gromp", "bf1");
    await game.settle();
    expect(game.zoneOf("gromp")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.xp()).toBe(0);
  });

  test("hold: at the start of YOUR Beginning Phase Gromp's Hunt goes on the chain (phase holds), then +1 point and 3 XP", async () => {
    const game = await scenario().turn(2).active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "gromp").build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gromp", controller: P1, triggered: true })]);
    expect(game.p1.xp()).toBe(0); // not before it resolves
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(3);
  });

  test("negative space — the OPPONENT's turn start is not your hold: Gromp parked on your battlefield gains nothing until your own turn", async () => {
    const game = await scenario().turn(3).active(P1).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "gromp").build();
    await game.advanceTurn(); // → P2
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.xp()).toBe(0);
    expect(game.p1.points()).toBe(0);
    await game.advanceTurn(); // → P1: now it holds
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.xp()).toBe(3);
    expect(game.p1.points()).toBe(1);
  });

  test("presence (383.4.c.2.a): Gromp in BASE while a friend conquers bf1 → the friend scores, Gromp gains no XP", async () => {
    const game = await scenario().battlefield("bf1", { controller: null }).unit(P1, "base", CARD, "gromp").unit(P1, "base", { might: 2, name: "Scout" }, "scout").build();
    await game.p1.move("scout", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(0);
  });

  test("presence: Gromp KILLED in the combat his side wins (defender puts its 5 on him) is gone before the conquer → ally conquers, 0 XP", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Brute" }, "brute")
      .unit(P1, "base", CARD, "gromp")
      .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
      .build();
    game.script(P2, [(d) => (d.kind === "distribute" ? { allocation: { gromp: 5 }, kind: "distribute" } : undefined)]);
    await game.p1.move(["gromp", "ally"], "bf1");
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash"); // 5 + 3 = 8 ≥ 5
    expect(game.zoneOf("gromp")).toBe("trash"); // took the full 5
    expect(game.locationOf("ally")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(0);
  });

  test("two Hunt units conquer together: Gromp (3) + Scorchclaw (2) → 5 XP from one conquer", async () => {
    const game = await scenario().battlefield("bf1", { controller: null }).unit(P1, "base", CARD, "gromp").unit(P1, "base", SCORCHCLAW, "claw").build();
    await game.p1.move(["gromp", "claw"], "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(5);
  });

  test("partner — Red Brambleback conquering HERE with Gromp doubles the conquer half of Hunt: 6 XP (and Brambleback's own Buff asks twice)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", CARD, "gromp")
      .unit(P1, "base", BRAMBLEBACK, "rb")
      .build();
    game.script(P1, ["gromp", "rb"]); // the two Buff prompts
    await game.p1.move(["gromp", "rb"], "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(6);
    expect(game.state("gromp").isBuffed).toBe(true);
    expect(game.state("rb").isBuffed).toBe(true);
  });

  test("partner — Red Brambleback at a DIFFERENT battlefield does not double: conquering bf2 with Gromp alone is 3 XP", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", BRAMBLEBACK, "rb")
      .unit(P1, "base", CARD, "gromp")
      .build();
    await game.p1.move("gromp", "bf2");
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.xp()).toBe(3);
  });

  test("Blue Sentinel's 'your hold effects for holding here trigger an additional time' is never applied — Gromp holding beside it gains 3 XP, not 6 (383.4.d, 823.1.b)", async () => {
    // Expected: Hunt is a hold effect (823.1.b); with Blue Sentinel at the same held battlefield it
    // triggers twice → 6 XP. Actual: the doubler is encoded as a granted "HoldRepeatHere" keyword that
    // nothing in the engine reads, so only one Hunt item is created → 3 XP.
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "gromp")
      .unit(P1, "bf1", BLUE_SENTINEL, "blue")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(6);
  });

  test("Crowd Favorite's 'Spend 2 XP' cost is charged once — after Gromp's conquer banks 3 XP, activating it leaves 1 XP (728, 823.1.c.1)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", CARD, "gromp")
      .unit(P1, "base", CROWD_FAVORITE, "fav")
      .build();
    expect(game.p1.can("activate", "fav")).toBe(false); // 0 XP: unpayable
    await game.p1.move("gromp", "bf1");
    await game.settle();
    expect(game.p1.xp()).toBe(3);
    expect(game.p1.can("activate", "fav")).toBe(true);
    await game.p1.activate("fav");
    await game.settle();
    expect(game.p1.xp()).toBe(1);
    expect(game.state("fav")).toMatchObject({ isBuffed: true, might: 4 });
  });

  test("registry payload: Hunt keyword with value 3, expanded to one conquer trigger and one hold trigger of gain-xp 3 — nothing else", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 5, might: 5, name: "Voracious Gromp" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      { keyword: "Hunt", type: "keyword", value: 3 },
      { effect: { amount: 3, type: "gain-xp" }, trigger: { event: "conquer", on: "self" }, type: "triggered" },
      { effect: { amount: 3, type: "gain-xp" }, trigger: { event: "hold", on: "self" }, type: "triggered" },
    ]);
  });
});
