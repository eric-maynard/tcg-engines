/**
 * Falling Comet — ogn-085-298 · Spell · Mind · 5 energy
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Deal 6 to a unit at a battlefield.
 *
 * Rule 142/437 — non-combat damage stays marked; lethal (≥ Might) kills at
 * the next cleanup. "at a battlefield" excludes units in either base.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-085-298";

function board(energy = 5) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Six" }, "six")
    .unit(P2, "bf1", { might: 7, name: "Seven" }, "seven")
    .unit(P1, "bf1", { might: 2, name: "Mine" }, "mine")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
    .hand(P1, CARD, "comet");
}

describe("Falling Comet (ogn-085-298)", () => {
  test("costs 5 energy; deals 6 to the chosen battlefield unit — a 6-might unit dies; spell goes to trash", async () => {
    const game = await board().build();
    await game.p1.cast("comet", { targets: "six" });
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("comet")).toBe("chain");
    await game.settle();
    expect(game.zoneOf("six")).toBe("trash");
    expect(game.zoneOf("seven")).toBe("battlefield-bf1");
    expect(game.zoneOf("comet")).toBe("trash");
  });

  test("6 damage on a 7-might unit is not lethal: it stays with 6 damage marked", async () => {
    const game = await board().build();
    await game.p1.cast("comet", { targets: "seven" });
    await game.settle();
    expect(game.zoneOf("seven")).toBe("battlefield-bf1");
    expect(game.state("seven").damage).toBe(6);
  });

  test("targets: any unit AT A BATTLEFIELD (friendly included); units in a base are not offered", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "comet")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(3);
    expect(targets).toEqual(expect.arrayContaining([["six"], ["seven"], ["mine"]]));
    const t = await game.p1.try((p) => p.cast("comet", { targets: "home" }));
    expect(!t.ok && t.error.code).toBe("ILLEGAL_ARGS");
    const noBfUnits = await scenario().resources(P1, { energy: 5 }).unit(P2, "base", { might: 1 }, "home").hand(P1, CARD, "comet").build();
    expect(noBfUnits.p1.can("cast", "comet")).toBe(false);
  });

  test("[Action] timing: castable with Focus in a showdown; not on the opponent's turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P2, "bf1", { might: 6 }, "six")
      .hand(P1, CARD, "comet")
      .build();
    await game.p1.move("ally", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("cast", "comet")).toBe(true);
    await game.p1.cast("comet", { targets: "six" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["comet"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    // Resolved inside the showdown: the defender is gone before combat damage.
    expect(game.zoneOf("six")).toBe("trash");
    expect((game.decision() as ActionDecision).context).toBe("showdown");

    const oppTurn = await board().active(P2).build();
    expect(oppTurn.p1.can("cast", "comet")).toBe(false);
  });

  test("killing the lone defender during the showdown leaves the attacker to win the combat and conquer (466.3.a, 466.5)", async () => {
    // Expected: with no defender left, P1 is the only player with units at bf1 → wins, keeps
    // "ally" there and conquers (1 point). Actual: resolveFullCombat recalls the attacker to base
    // and bf1 stays with P2.
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P2, "bf1", { might: 6 }, "six")
      .hand(P1, CARD, "comet")
      .build();
    await game.p1.move("ally", "bf1");
    await game.p1.cast("comet", { targets: "six" });
    await game.settle();
    expect(game.zoneOf("six")).toBe("trash");
    expect(game.locationOf("ally")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("not affordable with 4 energy", async () => {
    const game = await board(4).build();
    expect(game.p1.can("cast", "comet")).toBe(false);
    const r = await game.p1.try((p) => p.cast("comet", { targets: "six" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("comet")).toBe("hand");
  });
});
