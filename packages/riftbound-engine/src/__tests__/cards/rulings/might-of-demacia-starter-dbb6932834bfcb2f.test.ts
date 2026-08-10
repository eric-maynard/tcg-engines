/**
 * Ruling dbb6932834bfcb2f — Might of Demacia - Starter (OGS-023 → ogs-023-024) · Legend (Garen) · Body/Order
 *   "When you conquer, if you have 4+ units at that battlefield, draw 2."
 *
 * Q: Must the 4 units conquer together, or can one unit conquer and three more be played there "during the
 *    conquer" to trigger it?
 * A: You need 4 units at that battlefield WHEN you conquer — i.e. after the showdown, 4 of your units surviving
 *    there. Adding units afterwards does not retroactively trigger it.
 * Rules: 383.2.a.1 (intervening "if" is checked when the trigger event happens), 466.5 / 348.2 (conquer is
 *        established at the end of the showdown/combat).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const MIGHT_OF_DEMACIA = "ogs-023-024";
const RECRUIT = { cardType: "unit", energyCost: 1, might: 1, name: "Recruit" } as const;

function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 3 })
    .legend(P1, MIGHT_OF_DEMACIA, "garen")
    .battlefield("open", { controller: null })
    .battlefield("held", { controller: P2 })
    .unit(P2, "held", { might: 3, name: "Sentry" }, "sentry")
    .unit(P1, "base", { might: 2, name: "Soldier A" }, "a")
    .unit(P1, "base", { might: 2, name: "Soldier B" }, "b")
    .unit(P1, "base", { might: 2, name: "Soldier C" }, "c")
    .unit(P1, "base", { might: 2, name: "Soldier D" }, "d")
    .hand(P1, RECRUIT, "r1")
    .hand(P1, RECRUIT, "r2")
    .hand(P1, RECRUIT, "r3");
}

describe("Ruling dbb6932834bfcb2f — Garen's legend needs 4 of your units AT the battlefield at the moment you conquer it", () => {
  test("four units move to the open battlefield together and conquer it: 4+ there at the conquer → the legend triggers and P1 draws 2", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    await game.p1.move(["a", "b", "c", "d"], "open");
    await game.settle();
    expect(game.gameState.battlefields.open?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.units("open").sort()).toEqual(["a", "b", "c", "d"]);
    expect(game.p1.hand()).toHaveLength(hand + 2);
    expect(game.violations()).toEqual([]);
  });

  test("one unit conquers alone (1 < 4: the 'if' fails, nothing triggers), then three more units are played to that battlefield — still no draw: the conquer moment has passed", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    await game.p1.move("a", "open");
    await game.settle();
    expect(game.gameState.battlefields.open?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(hand);
    await game.p1.play("r1", { to: "open" });
    await game.p1.play("r2", { to: "open" });
    await game.p1.play("r3", { to: "open" });
    await game.settle();
    expect(game.p1.units("open")).toHaveLength(4);
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(hand - 3); // three played, none drawn
  });

  test("it is the SURVIVORS after the showdown that count: four attack the held battlefield but the 3-Might Sentry takes one down — P1 conquers with 3 there → no draw", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    await game.p1.move(["a", "b", "c", "d"], "held");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.gameState.battlefields.held?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.units("held")).toHaveLength(3);
    expect(game.p1.hand()).toHaveLength(hand);
  });

  test("(and five attackers losing one still leaves 4 survivors → draw 2)", async () => {
    const game = await board().unit(P1, "base", { might: 2, name: "Soldier E" }, "e").build();
    const hand = game.p1.hand().length;
    await game.p1.move(["a", "b", "c", "d", "e"], "held");
    await game.settle();
    expect(game.gameState.battlefields.held?.controller).toBe(P1);
    expect(game.p1.units("held")).toHaveLength(4);
    expect(game.p1.hand()).toHaveLength(hand + 2);
  });
});
