/**
 * Blast of Power — ogs-012-024 · Spell · Order · 6 energy + [order]
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Kill a unit at a battlefield.
 *
 * Rule 806 — Action timing (your turn in an open state, or with Focus in a showdown; cannot be
 * added to an existing chain). Killed units go to their owner's trash.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogs-012-024";

function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 8, name: "Giant" }, "giant")
    .unit(P1, "bf2", { might: 2, name: "Mine" }, "mine")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
    .hand(P1, CARD, "blast");
}

describe("Blast of Power (ogs-012-024)", () => {
  test("costs 6 energy + 1 order; kills the chosen unit at a battlefield regardless of its Might; goes to trash", async () => {
    const game = await board().build();
    await game.p1.cast("blast", { targets: "giant" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("blast")).toBe("chain");
    await game.settle();
    expect(game.zoneOf("giant")).toBe("trash");
    expect(game.state("giant").owner).toBe(P2);
    expect(game.p2.trash()).toContain("giant");
    expect(game.zoneOf("blast")).toBe("trash");
    expect(game.zoneOf("mine")).toBe("battlefield-bf2");
  });

  test("may also kill your own unit at a battlefield", async () => {
    const game = await board().build();
    await game.p1.cast("blast", { targets: "mine" });
    await game.settle();
    expect(game.zoneOf("mine")).toBe("trash");
    expect(game.p1.trash()).toContain("mine");
  });

  test("targets only units AT A BATTLEFIELD — a unit in a base is never offered; no battlefield unit → not castable", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "blast")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(2);
    expect(targets).toEqual(expect.arrayContaining([["giant"], ["mine"]]));
    const t = await game.p1.try((p) => p.cast("blast", { targets: "home" }));
    expect(t.ok).toBe(false);
    const none = await scenario().resources(P1, { energy: 6, power: { order: 1 } }).unit(P2, "base", { might: 1 }, "home").hand(P1, CARD, "blast").build();
    expect(none.p1.can("cast", "blast")).toBe(false);
  });

  test("not affordable with 5 energy, or without the order power", async () => {
    const lowEnergy = await board().resources(P1, { energy: 5 }).build();
    expect(lowEnergy.p1.can("cast", "blast")).toBe(false);
    const noPower = await scenario().resources(P1, { energy: 6 }).battlefield("bf1").unit(P2, "bf1", { might: 1 }, "u").hand(P1, CARD, "blast").build();
    expect(noPower.p1.can("cast", "blast")).toBe(false);
    const wrongPower = await scenario().resources(P1, { energy: 6, power: { fury: 1 } }).battlefield("bf1").unit(P2, "bf1", { might: 1 }, "u").hand(P1, CARD, "blast").build();
    expect(wrongPower.p1.can("cast", "blast")).toBe(false);
  });

  test("[Action] timing: castable with Focus during a showdown (kills the defender before combat); not onto an open chain", async () => {
    const game = await scenario()
      .resources(P1, { energy: 12, power: { order: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 1 }, "scout")
      .unit(P2, "bf1", { might: 9 }, "wall")
      .hand(P1, CARD, "b1")
      .hand(P1, CARD, "b2")
      .build();
    await game.p1.move("scout", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("cast", "b1")).toBe(true);
    await game.p1.cast("b1", { targets: "wall" });
    expect((game.decision() as ActionDecision).context).toBe("chain");
    expect(game.p1.can("cast", "b2")).toBe(false); // an Action cannot join an existing chain
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
  });

  test.failing("BUG: killing the lone defender during the combat showdown leaves the attacker to win and conquer (466.1.a.2, 466.3.a, 466.5)", async () => {
    // Expected: with the 9-Might wall killed before damage, only P1 has units at bf1 → P1 wins the
    // combat, is NOT recalled (recall happens only if defenders remain), establishes control and scores.
    // Actual: resolveFullCombat recalls the scout to base and bf1 stays with P2.
    const game = await scenario()
      .resources(P1, { energy: 6, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 1 }, "scout")
      .unit(P2, "bf1", { might: 9 }, "wall")
      .hand(P1, CARD, "b1")
      .build();
    await game.p1.move("scout", "bf1");
    await game.p1.cast("b1", { targets: "wall" });
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.locationOf("scout")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("[Action] timing: not castable on the opponent's turn in an open state", async () => {
    const game = await board().active(P2).build();
    expect(game.p1.can("cast", "blast")).toBe(false);
    const r = await game.p1.try((p) => p.cast("blast", { targets: "giant" }));
    expect(r.ok).toBe(false);
  });
});
