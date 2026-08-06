/**
 * Last Stand — ogn-069-298 · Spell · Calm · 3 energy + [calm]
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Double a friendly unit's Might this turn. Give it [Temporary].
 *   (Kill it at the start of its controller's Beginning Phase, before scoring.)
 *
 * Double (rule 432.1.a): +N Might this turn where N is its current Might.
 * Temporary (rule 816.1.b): the grant itself has no duration — the unit dies at
 * the start of its controller's next Beginning Phase.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-069-298";

function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
    .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
    .hand(P1, CARD, "ls");
}

describe("Last Stand (ogn-069-298)", () => {
  test("costs 3 energy + 1 calm, gives the friendly unit Temporary, and goes to trash", async () => {
    const game = await board().build();
    await game.p1.cast("ls", { targets: "ally" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.state("ally").keywords).toContain("Temporary");
    expect(game.zoneOf("ls")).toBe("trash");
  });

  test.failing("BUG: doubles the unit's Might this turn (3 → 6) (rule 432.1.a)", async () => {
    // Expected: a 3-Might unit becomes 6 Might until end of turn. Actual: the parsed spell only
    // grants Temporary; no might modification is applied (stays 3).
    const game = await board().build();
    await game.p1.cast("ls", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").might).toBe(6);
    await game.advanceTurn();
    expect(game.state("ally").might).toBe(3); // "this turn" only
  });

  test.failing("BUG: only FRIENDLY units are legal targets", async () => {
    // Expected: only "ally" is offered. Actual: the enemy "foe" is offered too.
    const game = await board().build();
    const targets = game.p1.option("cast", "ls")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual([["ally"]]);
    const t = await game.p1.try((p) => p.cast("ls", { targets: "foe" }));
    expect(t.ok).toBe(false);
  });

  test.failing("BUG: Temporary persists past this turn and kills the unit at the start of its controller's next Beginning Phase (rule 816.1.b)", async () => {
    // Expected: the keyword is still there on the opponent's turn, and when P1's next turn
    // begins the unit is killed. Actual: Temporary is granted with duration "turn", so it
    // expires at end of turn and the unit survives.
    const game = await board().build();
    await game.p1.cast("ls", { targets: "ally" });
    await game.settle();
    await game.advanceTurn(); // → P2's turn
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("ally")).toBe("base"); // not P1's Beginning Phase yet
    expect(game.state("ally").keywords).toContain("Temporary");
    await game.advanceTurn(); // → P1's turn: Beginning Phase kills it
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("ally")).toBe("trash");
  });

  test("[Action] timing: legal with Focus during a showdown, illegal on the opponent's turn", async () => {
    const game = await board().build();
    await game.p1.move("ally", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("cast", "ls")).toBe(true);
    const opp = await board().active(P2).build();
    expect(opp.p1.can("cast", "ls")).toBe(false);
  });

  test("not playable without the calm power or with only 2 energy", async () => {
    const noPower = await scenario().resources(P1, { energy: 5 }).unit(P1, "base", { might: 3 }, "a").hand(P1, CARD, "ls").build();
    expect(noPower.p1.can("cast", "ls")).toBe(false);
    const noEnergy = await scenario().resources(P1, { energy: 2, power: { calm: 1 } }).unit(P1, "base", { might: 3 }, "a").hand(P1, CARD, "ls").build();
    expect(noEnergy.p1.can("cast", "ls")).toBe(false);
  });
});
