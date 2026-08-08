/**
 * Xin Zhao, Vigilant — sfd-176-221 · Champion Unit (Xin Zhao) · Order · 3 energy + [order] · 4 Might
 *
 *   [Tank] (I must be assigned combat damage first.)
 *   I enter ready if you have two or more other units in your base.
 *
 * Rules: 143.4 (units enter exhausted unless an effect says otherwise), 364.3.a / 369.3 (a conditional
 * "I enter ready" is a self replacement on entering, its "if" checked as he is played), 815 (Tank: lethal
 * damage must be assigned to him before any non-Tank unit on his side; 465.2.c.3/465.2.c.6 assignment
 * legality), 466.1.a.1 (combat damage heals in the combat cleanup), 108/355.2 (may be played to base or
 * a battlefield you control — the condition still reads your BASE).
 *
 * Head-judge notes — trickiest situations for this card:
 *  - Threshold is "two or more OTHER units in your BASE": 0 or 1 → exhausted; exactly 2 → ready. He never
 *    counts himself, units at battlefields don't count, gear in base doesn't count, the opponent's base
 *    doesn't count.
 *  - Played TO A BATTLEFIELD with two units sitting in base → still enters ready there (the condition is
 *    about your base, not about where he lands).
 *  - Played from the Champion Zone the same replacement applies (and fails with an empty base).
 *  - Tank on defense: a 3-Might attacker into Xin Zhao (4) + a 1-Might pal may NOT snipe the pal — all 3
 *    must go on Xin Zhao (not lethal), everyone on his side lives, attacker dies. Exactly 4 kills him but
 *    still spares the pal; 5 kills both.
 *  - Cost 3 + [order]: no order power → unplayable even with spare energy.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-176-221";
const MASK = "ogn-060-298"; // Mask of Foresight — a real gear, to show non-units in base don't count

function withBaseUnits(n: number, where: "hand" | "champion" = "hand") {
  const b = scenario().resources(P1, { energy: 3, power: { order: 1 } }).battlefield("bf1", { controller: P1 });
  if (where === "hand") {
    b.hand(P1, CARD, "xz");
  } else {
    b.champion(P1, CARD, "xz");
  }
  for (let i = 0; i < n; i++) {
    b.unit(P1, "base", { might: 1, name: `Squire ${i}` }, `squire${i}`);
  }
  // Noise that must NOT count: two friendly units at a battlefield, a friendly gear in base, two enemy units in THEIR base.
  return b
    .unit(P1, "bf1", { might: 1, name: "Scout A" }, "scoutA")
    .unit(P1, "bf1", { might: 1, name: "Scout B" }, "scoutB")
    .gear(P1, MASK, "mask")
    .unit(P2, "base", { might: 1, name: "Enemy A" }, "enemyA")
    .unit(P2, "base", { might: 1, name: "Enemy B" }, "enemyB");
}

function defence(attackerMight: number, palFirst = true) {
  const b = scenario().active(P2).battlefield("bf1", { controller: P1 });
  if (palFirst) {
    b.unit(P1, "bf1", { might: 1, name: "Pal" }, "pal").unit(P1, "bf1", CARD, "xz");
  } else {
    b.unit(P1, "bf1", CARD, "xz").unit(P1, "bf1", { might: 1, name: "Pal" }, "pal");
  }
  return b.unit(P2, "base", { might: attackerMight, name: "Raider" }, "raider");
}

describe("Xin Zhao, Vigilant (sfd-176-221)", () => {
  test("cost: 3 energy + 1 order for a 4-Might Tank champion unit; unaffordable without the order power or at 2 energy", async () => {
    const game = await withBaseUnits(2).build();
    await game.p1.play("xz", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("xz")).toBe("base");
    expect(game.state("xz")).toMatchObject({ baseMight: 4, might: 4 });
    expect(game.state("xz").keywords).toContain("Tank");
    expect((await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "xz").build()).p1.can("play", "xz")).toBe(false);
    expect((await scenario().resources(P1, { energy: 2, power: { order: 2 } }).hand(P1, CARD, "xz").build()).p1.can("play", "xz")).toBe(false);
  });

  test("exactly two other units in your base → he enters READY (battlefield units, gear and enemy units are just noise)", async () => {
    const game = await withBaseUnits(2).build();
    await game.p1.play("xz", { to: "base" });
    await game.settle();
    expect(game.state("xz").isReady).toBe(true);
    expect(game.p1.can("move", undefined)).toBe(true); // and being ready, he can move right away
  });

  test("three other units in base ('or more') → ready", async () => {
    const game = await withBaseUnits(3).build();
    await game.p1.play("xz", { to: "base" });
    await game.settle();
    expect(game.state("xz").isReady).toBe(true);
  });

  test("143.4 — only ONE other unit in base (plus units at a battlefield, a gear, enemy units): the condition fails and he must enter EXHAUSTED", async () => {
    // Expected: exhausted (1 < 2; scouts at bf1, the Mask and P2's units don't count). Actual: the engine cannot
    // evaluate the parsed `unit-count` condition and falls back to an unconditional "enter ready".
    const game = await withBaseUnits(1).build();
    await game.p1.play("xz", { to: "base" });
    await game.settle();
    expect(game.zoneOf("xz")).toBe("base");
    expect(game.state("xz").isExhausted).toBe(true);
  });

  test("143.4 — empty base (he never counts himself): enters EXHAUSTED", async () => {
    // Expected: exhausted (0 other units). Actual: enters ready unconditionally.
    const game = await withBaseUnits(0).build();
    await game.p1.play("xz", { to: "base" });
    await game.settle();
    expect(game.state("xz").isExhausted).toBe(true);
  });

  test("played TO A BATTLEFIELD you control while two units sit in base → the base condition holds, he enters ready at bf1", async () => {
    const game = await withBaseUnits(2).build();
    await game.p1.play("xz", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("xz")).toBe("battlefield-bf1");
    expect(game.state("xz").isReady).toBe(true);
  });

  test("played from the Champion Zone with two units in base: pays 3 + [order] and enters ready", async () => {
    const game = await withBaseUnits(2, "champion").build();
    expect(game.p1.champion()).toBe("xz");
    await game.p1.playChampion("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("xz")).toBe("base");
    expect(game.state("xz").isReady).toBe(true);
  });

  test("143.4 — played from the Champion Zone into an EMPTY base he must enter exhausted", async () => {
    // Expected: exhausted. Actual: ready (same unconditional fallback on the champion-zone path).
    const game = await withBaseUnits(0, "champion").build();
    await game.p1.playChampion("base");
    await game.settle();
    expect(game.zoneOf("xz")).toBe("base");
    expect(game.state("xz").isExhausted).toBe(true);
  });

  test("[Tank] on defense: a 3-Might raider into Pal(1, listed first) + Xin Zhao(4) — all 3 must land on Xin Zhao (not lethal), Pal is spared, the raider dies to 5, P1 holds", async () => {
    // Control: the same fight with a plain 4-Might unit instead of the Tank — the engine's assignment snipes Pal.
    const control = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Pal" }, "pal")
      .unit(P1, "bf1", { might: 4, name: "Plain Four" }, "plain")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await control.p2.move("raider", "bf1");
    await control.settle();
    expect(control.zoneOf("pal")).toBe("trash");

    const game = await defence(3).build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("pal")).toBe("battlefield-bf1");
    expect(game.zoneOf("xz")).toBe("battlefield-bf1");
    expect(game.state("xz").damage).toBe(0); // 3 < 4, healed in the combat cleanup (466.1.a.1)
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("[Tank] assignment legality (465.2.c.3 / 465.2.c.6): a 5-Might raider into Pal + Pal2 + Xin Zhao gets a real split choice, but {pal:1, pal2:1, xz:3} is refused — Xin Zhao needs his lethal 4 first; {xz:4, pal:1} is legal", async () => {
    const game = await scenario()
      .active(P2)
      .autoProcedures(false)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Pal" }, "pal")
      .unit(P1, "bf1", { might: 1, name: "Pal2" }, "pal2")
      .unit(P1, "bf1", CARD, "xz")
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    await game.p2.choose("resolveFullCombat:bf1");
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P2, total: 5 });
    expect((await game.p2.try((p) => p.distribute({ pal: 1, pal2: 1, xz: 3 }))).ok).toBe(false); // Tank lacks lethal
    expect((await game.p2.try((p) => p.distribute({ pal: 1, pal2: 4 }))).ok).toBe(false); // Tank skipped entirely
    await game.p2.distribute({ pal: 1, xz: 4 });
    await game.p2.choose("resolveFullCombat:bf1");
    await game.settle();
    expect(game.zoneOf("xz")).toBe("trash");
    expect(game.zoneOf("pal")).toBe("trash");
    expect(game.zoneOf("pal2")).toBe("battlefield-bf1"); // 6 defending Might kills the raider; Pal2 holds
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("[Tank] with exactly-lethal 4: Xin Zhao takes all 4 and dies, Pal still survives and holds the field; with 5 both die and bf1 is left empty", async () => {
    const four = await defence(4).build();
    await four.p2.move("raider", "bf1");
    await four.settle();
    expect(four.zoneOf("xz")).toBe("trash");
    expect(four.zoneOf("pal")).toBe("battlefield-bf1");
    expect(four.zoneOf("raider")).toBe("trash");
    expect(four.gameState.battlefields.bf1?.controller).toBe(P1);

    const five = await defence(5).build();
    await five.p2.move("raider", "bf1");
    await five.settle();
    expect(five.zoneOf("xz")).toBe("trash");
    expect(five.zoneOf("pal")).toBe("trash");
    expect(five.zoneOf("raider")).toBe("trash");
  });

  test("[Tank] is about ASSIGNMENT order only: as the lone attacker he simply trades Might — Xin Zhao (4) into a 4-Might defender, both die", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 4 }, "wall").unit(P1, "base", CARD, "xz").build();
    await game.p1.move("xz", "bf1");
    await game.settle();
    expect(game.zoneOf("xz")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("trash");
  });

  test("parsed abilities match the printed text: Tank keyword + a conditional static enter-ready (two or more other units in base); champion, tag Xin Zhao, 3 + [order]", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 3, isChampion: true, might: 4, powerCost: ["order"], tags: ["Xin Zhao"] });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toMatchObject({ keyword: "Tank", type: "keyword" });
    expect(abilities[1]).toMatchObject({ effect: { target: "self", type: "enter-ready" }, type: "static" });
    const condition = abilities[1]?.condition as Record<string, unknown> | undefined;
    expect(condition).toBeDefined(); // the "if" must survive parsing — an unconditional enter-ready would be a misread
    expect(condition).toMatchObject({ location: "base" });
    expect(["two", 2]).toContain(condition?.count as string | number);
  });
});
