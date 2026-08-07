/**
 * Needlessly Large Yordle — sfd-055-221 · Unit · Calm · 10 energy + [calm][calm][calm] · 5 might
 *
 *   [Shield 5] (+5 [Might] while I'm a defender.)
 *   [Tank] (I must be assigned combat damage first.)
 *   I cost [2][calm] less for each point you scored from holding this turn.
 *
 * Head-judge notes (the tricky cases covered below):
 *  - The discount counts only points YOU scored FROM HOLDING (315.2.b / 467) THIS turn: a conquer
 *    point this turn, last turn's hold points, or the opponent's hold points must not reduce it.
 *  - It reduces BOTH components per point: 1 hold → 8 + [calm][calm]; 2 holds → 6 + [calm].
 *  - Shield 5 only applies with the Defender designation (814.1.c): 10 might when attacked, plain 5
 *    when the Yordle attacks.
 *  - Tank (815): lethal for a defending Yordle is 10, and ALL enemy combat damage must go there
 *    before a non-Tank ally can be assigned any — checked one-short (9), exactly lethal (10) and
 *    with spill-over (11+).
 *  - Rune pools empty at end of turn, so the "held this turn" position is reached by really
 *    advancing into P1's turn (Beginning Phase scores the hold) and then adding resources.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-055-221";

/** P2 is about to end the turn; P1 controls `held` battlefields (a unit on each) and holds the Yordle. */
function aboutToHold(held: 1 | 2) {
  const b = scenario().turn(2).active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 2, name: "Holder1" }, "h1");
  if (held === 2) {
    b.battlefield("bf2", { controller: P1 }).unit(P1, "bf2", { might: 2, name: "Holder2" }, "h2");
  }
  return b.hand(P1, CARD, "yordle");
}

/** P2 attacks P1's bf1 (Yordle + a 1-might ally) with a vanilla unit of the given might. */
function defence(attackerMight: number) {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", CARD, "yordle")
    .unit(P1, "bf1", { might: 1, name: "Squire" }, "squire")
    .unit(P2, "base", { might: attackerMight, name: "Raider" }, "raider");
}

describe("Needlessly Large Yordle (sfd-055-221)", () => {
  test("full cost with no hold this turn: 10 energy + 3 calm; 5-might Shield/Tank unit enters the base exhausted", async () => {
    const game = await scenario().resources(P1, { energy: 10, power: { calm: 3 } }).hand(P1, CARD, "yordle").build();
    await game.p1.play("yordle");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.zoneOf("yordle")).toBe("base");
    expect(game.state("yordle").might).toBe(5);
    expect(game.state("yordle").keywords).toEqual(["Shield", "Tank"]);
    expect(game.state("yordle").isExhausted).toBe(true);
  });

  test("unaffordable at 9 energy + 3 calm, or 10 energy + 2 calm", async () => {
    const lowEnergy = await scenario().resources(P1, { energy: 9, power: { calm: 3 } }).hand(P1, CARD, "yordle").build();
    expect(lowEnergy.p1.can("play", "yordle")).toBe(false);
    const lowPower = await scenario().resources(P1, { energy: 10, power: { calm: 2 } }).hand(P1, CARD, "yordle").build();
    expect(lowPower.p1.can("play", "yordle")).toBe(false);
  });

  test("after scoring 1 point from holding this turn it costs 8 energy + [calm][calm]", async () => {
    // Expected: the Beginning Phase hold of bf1 scores 1 → discount [2][calm] → playable for exactly 8 + 2 calm.
    // Actual: the "for each point you scored from holding this turn" scope is not evaluated; full price is demanded.
    const game = await aboutToHold(1).build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["bf1"]);
    await game.p1.do("addResources", { energy: 8, power: { calm: 2 } });
    expect(game.p1.can("play", "yordle")).toBe(true);
    await game.p1.play("yordle", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.zoneOf("yordle")).toBe("base");
  });

  test("after holding two battlefields this turn (2 points) it costs 6 energy + [calm]", async () => {
    // Expected: 10 - 2×2 = 6 energy and 3 - 2 = 1 calm. Actual: full price.
    const game = await aboutToHold(2).build();
    await game.advanceTurn();
    expect(game.p1.points()).toBe(2);
    await game.p1.do("addResources", { energy: 6, power: { calm: 1 } });
    await game.p1.play("yordle", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.zoneOf("yordle")).toBe("base");
  });

  test("negative: a point scored by CONQUERING this turn gives no discount", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { calm: 2 } })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .hand(P1, CARD, "yordle")
      .build();
    await game.p1.move("scout", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.can("play", "yordle")).toBe(false); // still 10 + 3 calm
  });

  test("negative: points held on EARLIER turns (score 3, nothing scored this turn) give no discount", async () => {
    const game = await scenario().points(P1, 3).resources(P1, { energy: 8, power: { calm: 2 } }).hand(P1, CARD, "yordle").build();
    expect(game.gameState.scoredThisTurn[P1]).toEqual([]);
    expect(game.p1.can("play", "yordle")).toBe(false);
  });

  test("negative: the OPPONENT holding on their turn does not discount your Yordle (only points 'you scored')", async () => {
    // P1 ends → P2's Beginning Phase holds bf1 for P2 → back to P1, who held nothing this turn.
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Squatter" }, "squatter")
      .hand(P1, CARD, "yordle")
      .build();
    await game.advanceTurn(); // P2 holds bf1
    expect(game.p2.points()).toBe(1);
    await game.advanceTurn(); // back to P1, who held nothing
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 8, power: { calm: 2 } });
    expect(game.p1.can("play", "yordle")).toBe(false);
  });

  test("Shield 5 as defender: 10 might in the showdown; a 9-might attacker (one short of lethal) dies and bf1 stays P1's", async () => {
    const game = await defence(9).build();
    await game.p2.move("raider", "bf1");
    expect(game.state("yordle").combatRole).toBe("defender");
    expect(game.state("yordle").might).toBe(10);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // took 10 + 1
    expect(game.locationOf("yordle")).toBe("bf1");
    expect(game.locationOf("squire")).toBe("bf1"); // Tank soaked all 9
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("yordle").might).toBe(5); // designation gone after combat (814.1.d.1)
  });

  test("Tank, exactly lethal: a 10-might attacker kills the Yordle but has nothing left for the Squire; attacker dies to 11", async () => {
    const game = await defence(10).build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("yordle")).toBe("trash");
    expect(game.locationOf("squire")).toBe("bf1");
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("Tank with spill-over: a 12-might attacker kills Yordle (10) then the Squire (1), survives 11 and conquers", async () => {
    const game = await defence(12).build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("yordle")).toBe("trash");
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.locationOf("raider")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });

  test("Shield does nothing while ATTACKING: a ready Yordle (5) attacking a 6-might defender dies; the defender survives", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
      .unit(P1, "base", CARD, "yordle")
      .build();
    await game.p1.move("yordle", "bf1");
    expect(game.state("yordle").combatRole).toBe("attacker");
    expect(game.state("yordle").might).toBe(5);
    await game.settle();
    expect(game.zoneOf("yordle")).toBe("trash");
    expect(game.locationOf("wall")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("parsed abilities: Shield 5, Tank, and a self cost-reduction of [2][calm] per hold point this turn", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 10, might: 5, powerCost: ["calm", "calm", "calm"] });
    expect(def?.abilities).toHaveLength(3);
    expect(def?.abilities?.[0]).toEqual({ keyword: "Shield", type: "keyword", value: 5 });
    expect(def?.abilities?.[1]).toEqual({ keyword: "Tank", type: "keyword" });
    expect(def?.abilities?.[2]).toMatchObject({
      effect: { scope: "for each point you scored from holding this turn", target: "self", type: "cost-reduction" },
      type: "static",
    });
    // The reduction must encode BOTH 2 energy and 1 calm power per point.
    const reduction = (def?.abilities?.[2] as { effect: { reduction: unknown } }).effect.reduction;
    expect(JSON.stringify(reduction)).toMatch(/2/);
    expect(JSON.stringify(reduction)).toMatch(/calm/);
  });
});
