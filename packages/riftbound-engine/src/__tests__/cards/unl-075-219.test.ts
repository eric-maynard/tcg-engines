/**
 * Gustwalker — unl-075-219 · Unit · Mind · 3 energy + [mind] · 3 might
 *
 *   [Hunt 2] (When I conquer or hold, gain 2 XP.)
 *   [Level 3][>] I have +1 [Might] and [Ganking]. (While you have 3+ XP, get the effect. A [Ganking]
 *   unit can move from battlefield to battlefield.)
 *
 * Rules: 823 (Hunt X = "When I conquer or hold, my controller gains X XP" — a triggered Conquer AND
 * Hold effect), 727.1.b.2 (the very example: Gustwalker's dependent ability is active exactly while
 * its controller has 3+ XP; 727.1.c.2 passives start applying the moment the condition turns true),
 * 810 / 144.4.c.1 (Ganking: the Standard Move may go battlefield → battlefield; it is still a Standard
 * Move, so the unit must be ready and exhausts), 469.1/469.2 (Conquer vs Hold), XP is a persistent
 * player resource (728) — not a "this turn" value.
 *
 * Head-judge corner cases for THIS card:
 *   1. Threshold is inclusive and live: 2 XP → plain 3-Might, no Ganking; exactly 3 XP → 4 Might with
 *      Ganking; conquering at 1 XP pushes you to 3 and the bonus switches on immediately afterwards.
 *   2. Hunt fires on BOTH conquer (walk onto an empty enemy battlefield / win a combat) and hold (your
 *      Beginning Phase) — and on nothing else (a plain move to an uncontrolled-by-anyone… still a
 *      conquer; the opponent's Beginning; sitting in base).
 *   3. Ganking is a Standard Move: legal bf1 → bf2 only at Level 3, only while ready, and it exhausts;
 *      a gank into an enemy-held battlefield opens a real combat fought at 4 Might.
 *   4. The +1 applies in combat both ways (it is not Shield/Assault): a Level-3 Gustwalker defending
 *      against a 3-Might attacker survives; below Level 3 the same fight trades.
 *   5. XP persists across turns, so the Level bonus is still on next turn; cost is 3 energy + exactly
 *      one MIND power (off-domain power does not pay it).
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-075-219";

describe("Gustwalker (unl-075-219)", () => {
  test("registry payload: Hunt 2 keyword, gain-2-XP triggers on conquer and on hold, and a while-level(3) static giving self +1 Might and Ganking", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "mind", energyCost: 3, might: 3, name: "Gustwalker" });
    expect(def?.powerCost).toEqual(["mind"]);
    expect(def?.abilities).toHaveLength(4);
    expect(def?.abilities?.[0]).toEqual({ keyword: "Hunt", type: "keyword", value: 2 });
    expect(def?.abilities?.[1]).toEqual({ effect: { amount: 2, type: "gain-xp" }, trigger: { event: "conquer", on: "self" }, type: "triggered" });
    expect(def?.abilities?.[2]).toEqual({ effect: { amount: 2, type: "gain-xp" }, trigger: { event: "hold", on: "self" }, type: "triggered" });
    expect(def?.abilities?.[3]).toMatchObject({
      condition: { threshold: 3, type: "while-level" },
      effect: { effects: [{ amount: 1, target: "self", type: "modify-might" }, { keyword: "Ganking", type: "grant-keyword" }], type: "sequence" },
      type: "static",
    });
  });

  test("cost: 3 energy + 1 mind exactly; enters base exhausted at 3 Might (0 XP); 2 energy, or a non-mind power, cannot pay", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { mind: 1 } }).hand(P1, CARD, "gw").build();
    await game.p1.play("gw");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("gw")).toBe("base");
    expect(game.state("gw")).toMatchObject({ isExhausted: true, might: 3 });
    expect(game.state("gw").keywords).toContain("Hunt");
    expect(game.state("gw").keywords).not.toContain("Ganking");
    expect((await scenario().resources(P1, { energy: 2, power: { mind: 1 } }).hand(P1, CARD, "gw").build()).p1.can("play", "gw")).toBe(false);
    expect((await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, CARD, "gw").build()).p1.can("play", "gw")).toBe(false);
  });

  test("[Level 3] threshold is inclusive: 0 and 2 XP → 3 Might, no Ganking, gank illegal; exactly 3 (and 7) XP → 4 Might with Ganking, gank legal", async () => {
    for (const [xp, might, ganking] of [[0, 3, false], [2, 3, false], [3, 4, true], [7, 4, true]] as const) {
      const game = await scenario()
        .xp(P1, xp)
        .battlefield("bf1", { controller: P1 })
        .battlefield("bf2", { controller: null })
        .unit(P1, "bf1", CARD, "gw")
        .build();
      expect(game.state("gw").might).toBe(might);
      expect(game.state("gw").baseMight).toBe(3);
      expect(game.state("gw").keywords.includes("Ganking")).toBe(ganking);
      expect(game.p1.can("gank", "gw")).toBe(ganking);
    }
  });

  test("[Hunt 2] on conquer: walking onto an empty enemy battlefield scores 1 point and gains exactly 2 XP (0 → 2: still below Level 3)", async () => {
    const game = await scenario()
      .xp(P1, 0)
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "gw", { exhausted: false })
      .build();
    await game.p1.move("gw", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(2);
    expect(game.p2.xp()).toBe(0);
    expect(game.state("gw").might).toBe(3);
    expect(game.state("gw").keywords).not.toContain("Ganking");
  });

  test("live threshold: conquering at 1 XP → 3 XP, and the +1 Might / Ganking switch on right after the Hunt trigger resolves", async () => {
    const game = await scenario()
      .xp(P1, 1)
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", CARD, "gw", { exhausted: false })
      .build();
    expect(game.state("gw").might).toBe(3);
    await game.p1.move("gw", "bf1");
    await game.settle();
    expect(game.p1.xp()).toBe(3);
    expect(game.state("gw")).toMatchObject({ might: 4, staticMightBonus: 1 });
    expect(game.state("gw").keywords).toContain("Ganking");
    // It just made a Standard Move, so it is exhausted and cannot gank again this turn.
    expect(game.state("gw").isExhausted).toBe(true);
    expect(game.p1.can("gank", "gw")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("[Hunt 2] on hold: the trigger sits on the chain in P1's Beginning Phase; afterwards 1 point and 2 XP; the opponent's Beginning gives nothing", async () => {
    const game = await scenario().turn(2).active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "gw").build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gw", controller: P1, triggered: true })]);
    expect(game.p1.xp()).toBe(0);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(2);
    // P1 ends, P2's Beginning: no hold for P1, no XP for anyone.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.xp()).toBe(2);
    expect(game.p2.xp()).toBe(0);
  });

  test("two consecutive holds cross the threshold: 0 → 2 → 4 XP, and on that second turn Gustwalker is a ready 4-Might Ganking unit that may gank to bf2", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", CARD, "gw")
      .build();
    await game.advanceTurn(); // P1: hold #1
    expect(game.p1.xp()).toBe(2);
    expect(game.p1.can("gank", "gw")).toBe(false);
    await game.advanceTurn(); // P2
    await game.advanceTurn(); // P1: hold #2
    expect(game.p1.xp()).toBe(4);
    expect(game.p1.points()).toBe(2);
    expect(game.state("gw")).toMatchObject({ isReady: true, might: 4 });
    expect(game.p1.can("gank", "gw")).toBe(true);
    await game.p1.gank("gw", "bf2");
    await game.settle();
    expect(game.locationOf("gw")).toBe("bf2");
    expect(game.state("gw").isExhausted).toBe(true); // still a Standard Move
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1); // conquered the open battlefield
    expect(game.p1.xp()).toBe(6); // …which is another Hunt conquer
  });

  test("[Ganking] into an enemy-held battlefield opens a real combat fought at 4 Might: a 3-Might defender dies, Gustwalker conquers and Hunts again (3 → 5 XP)", async () => {
    const game = await scenario()
      .xp(P1, 3)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", CARD, "gw")
      .unit(P2, "bf2", { might: 3, name: "Sentinel" }, "sentinel")
      .build();
    await game.p1.gank("gw", "bf2");
    expect(game.state("gw")).toMatchObject({ combatRole: "attacker", might: 4 });
    await game.settle();
    expect(game.zoneOf("sentinel")).toBe("trash");
    expect(game.locationOf("gw")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(5);
  });

  test("negative space: below Level 3 a battlefield→battlefield move is simply not legal (only base is offered), and losing a combat grants no XP", async () => {
    const game = await scenario()
      .xp(P1, 2)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", CARD, "gw")
      .unit(P2, "bf2", { might: 5, name: "Wall" }, "wall")
      .build();
    expect((await game.p1.try((p) => p.gank("gw", "bf2"))).ok).toBe(false);
    expect((await game.p1.try((p) => p.move("gw", "bf2"))).ok).toBe(false);
    expect(game.locationOf("gw")).toBe("bf1");
    // Go home, then attack the 5-Might wall from base next turn at 3 Might: Gustwalker dies, no conquer, no XP.
    const lose = await scenario()
      .xp(P1, 2)
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", CARD, "gw", { exhausted: false })
      .unit(P2, "bf2", { might: 5, name: "Wall" }, "wall")
      .build();
    await lose.p1.move("gw", "bf2");
    await lose.settle();
    expect(lose.zoneOf("gw")).toBe("trash");
    expect(lose.p1.xp()).toBe(2);
    expect(lose.p1.points()).toBe(0);
  });

  test("the +1 is plain Might (works while defending too): at Level 3 a 3-Might attacker dies and Gustwalker lives; at 2 XP the same attack trades", async () => {
    const strong = await scenario()
      .active(P2)
      .xp(P1, 3)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "gw")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await strong.p2.move("raider", "bf1");
    expect(strong.state("gw")).toMatchObject({ combatRole: "defender", might: 4 });
    await strong.settle();
    expect(strong.zoneOf("raider")).toBe("trash");
    expect(strong.zoneOf("gw")).toBe("battlefield-bf1");
    expect(strong.p1.xp()).toBe(3); // defending successfully is neither conquer nor hold

    const weak = await scenario()
      .active(P2)
      .xp(P1, 2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "gw")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await weak.p2.move("raider", "bf1");
    await weak.settle();
    expect(weak.zoneOf("raider")).toBe("trash");
    expect(weak.zoneOf("gw")).toBe("trash");
  });

  test("XP belongs to the controller: P2's XP does not level up P1's Gustwalker, and P1's XP does not level up an enemy Gustwalker", async () => {
    const game = await scenario()
      .xp(P1, 0)
      .xp(P2, 9)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", CARD, "mine")
      .unit(P2, "bf2", CARD, "theirs")
      .build();
    expect(game.state("mine").might).toBe(3);
    expect(game.state("mine").keywords).not.toContain("Ganking");
    expect(game.state("theirs").might).toBe(4);
    expect(game.state("theirs").keywords).toContain("Ganking");
  });
});
