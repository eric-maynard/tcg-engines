/**
 * Ruling 9e694ff515263d52 — (no specific card) does beating off an attack score a point?
 *   Exercised with vanilla units on a battlefield P1 already controls.
 *
 * Q: My unit is already on a battlefield and the opponent attacks it but fails — do I gain a point?
 * A: No. Successfully defending scores nothing: you never Conquered (you already controlled the
 *    battlefield, so control does not change hands). Points come from Conquering a battlefield or
 *    from HOLDING one at the start of your own turn.
 * Rules: 466.5 / 469 (control is established after combat; the defender keeps what they had — no
 *        Conquer), 471.2.a (Conquer abilities trigger only where a Conquer happened), 315.2 /
 *        470 (the Hold score happens in your own Beginning Phase).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

/** P2's turn. P1 holds bf1 with a 6-Might Guard; P2 attacks with a 3-Might Raider and loses. */
const board = () =>
  scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 6, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider");

describe("Ruling 9e694ff515263d52 — defending successfully awards nothing", () => {
  test("the attack is beaten off: the attacker dies, control never moves, and the defender scores 0", async () => {
    const game = await board().build();
    expect(game.p1.points()).toBe(0);
    await game.p2.move("raider", "bf1");
    expect(game.state("guard").combatRole).toBe("defender");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(0); // no Conquer happened — P1 already controlled it
    expect(game.p2.points()).toBe(0);
  });

  test("even a surviving-but-repelled attacker leaves the defender at zero", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 6, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 1, name: "Scout" }, "scout")
      .build();
    await game.p2.move("scout", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(0);
  });

  test("the point comes from HOLDING at the start of P1's own turn, not from the defence", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(0);
    await game.advanceTurn(); // P2 ends → P1's Beginning Phase
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1); // the hold score, once, at the start of P1's turn
    expect(game.violations()).toEqual([]);
  });

  test("contrast — taking a battlefield you did NOT control IS a Conquer and does score right away", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Chaff" }, "chaff")
      .unit(P2, "base", { might: 6, name: "Bruiser" }, "bruiser")
      .build();
    await game.p2.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("chaff")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
  });
});
