/**
 * Primal Strength — ogn-154-298 · Spell · Body · 4 energy + 1 [body]
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Give a unit +7 [Might] this turn.
 *
 * Rules: 806 (Action: playable in showdowns on any player's turn, otherwise your
 * own turn in an Open state), 359 (spell resolves from the chain, then goes to trash).
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-154-298";

function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
    .hand(P1, CARD, "ps");
}

describe("Primal Strength (ogn-154-298)", () => {
  test("costs 4 energy + 1 body; unaffordable without the body power or with 3 energy", async () => {
    const game = await board().build();
    await game.p1.cast("ps", { targets: "ally" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.zoneOf("ps")).toBe("chain");
    const noPower = await scenario().resources(P1, { energy: 4 }).unit(P1, "base", { might: 2 }, "a").hand(P1, CARD, "ps").build();
    expect(noPower.p1.can("cast", "ps")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 3, power: { body: 1 } }).unit(P1, "base", { might: 2 }, "a").hand(P1, CARD, "ps").build();
    expect(lowEnergy.p1.can("cast", "ps")).toBe(false);
  });

  test("gives the chosen unit +7 Might (2 → 9) and goes to trash; any unit (friendly or enemy) is a legal target", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "ps")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(2);
    expect(targets).toEqual(expect.arrayContaining([["ally"], ["foe"]]));
    await game.p1.cast("ps", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").might).toBe(9);
    expect(game.state("foe").might).toBe(3);
    expect(game.zoneOf("ps")).toBe("trash");
  });

  test("works on an enemy unit too (3 → 10)", async () => {
    const game = await board().build();
    await game.p1.cast("ps", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").might).toBe(10);
  });

  test("'this turn': the bonus is gone after the turn ends", async () => {
    const game = await board().build();
    await game.p1.cast("ps", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").might).toBe(9);
    await game.advanceTurn();
    expect(game.state("ally").might).toBe(2);
  });

  test("[Action] timing: legal for the non-turn player once they hold Focus in a showdown; the boosted defender wins combat", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 4, power: { body: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Defender" }, "def")
      .unit(P2, "base", { might: 5, name: "Attacker" }, "atk")
      .hand(P1, CARD, "ps")
      .build();
    expect(game.p1.can("cast", "ps")).toBe(false); // opponent's turn, Open state
    await game.p2.move("atk", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "ps")).toBe(true);
    await game.p1.cast("ps", { targets: "def" });
    await game.settle(); // resolves, then combat: 9 vs 5
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
  });
});
