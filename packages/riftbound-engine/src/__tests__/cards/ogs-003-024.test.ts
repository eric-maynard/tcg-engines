/**
 * Incinerate — ogs-003-024 · Spell · Fury · 2 energy
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Deal 2 to a unit at a battlefield.
 *
 * Rules: Action timing (your turn in an open state, or during a showdown while you hold Focus —
 * 313.1.a / 347), 142.4 (damage ≥ Might is lethal), targeting restricted to units at a
 * battlefield (either player's), never units in a base.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogs-003-024";

function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Tough" }, "tough")
    .unit(P2, "bf1", { might: 2, name: "Soft" }, "soft")
    .unit(P1, "bf1", { might: 2, name: "Mine" }, "mine")
    .unit(P2, "base", { might: 1, name: "Home" }, "home")
    .hand(P1, CARD, "inc");
}

describe("Incinerate (ogs-003-024)", () => {
  test("cost: 2 energy, no power; deals 2 to the chosen battlefield unit (3 Might survives damaged); spell → trash", async () => {
    const game = await board().build();
    await game.p1.cast("inc", { targets: "tough" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("tough").damage).toBe(2);
    expect(game.locationOf("tough")).toBe("bf1");
    expect(game.state("soft").damage).toBe(0);
    expect(game.zoneOf("inc")).toBe("trash");
    const poor = await scenario().resources(P1, { energy: 1 }).battlefield("bf1").unit(P2, "bf1", { might: 1 }, "u").hand(P1, CARD, "inc").build();
    expect(poor.p1.can("cast", "inc")).toBe(false);
  });

  test("2 damage is lethal to a 2-Might unit (either side's — your own unit is a legal target too)", async () => {
    const game = await board().build();
    await game.p1.cast("inc", { targets: "soft" });
    await game.settle();
    expect(game.zoneOf("soft")).toBe("trash");
    const own = await board().build();
    await own.p1.cast("inc", { targets: "mine" });
    await own.settle();
    expect(own.zoneOf("mine")).toBe("trash");
  });

  test("targets only units AT A BATTLEFIELD: base units are not offered; with none there it is not castable", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "inc")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(3);
    expect(targets).toEqual(expect.arrayContaining([["tough"], ["soft"], ["mine"]]));
    const t = await game.p1.try((p) => p.cast("inc", { targets: "home" }));
    expect(t.ok).toBe(false);
    const none = await scenario().resources(P1, { energy: 2 }).unit(P2, "base", { might: 1 }, "home").hand(P1, CARD, "inc").build();
    expect(none.p1.can("cast", "inc")).toBe(false);
  });

  test("[Action]: not castable on the opponent's turn outside a showdown", async () => {
    const game = await board().active(P2).build();
    expect(game.p1.can("cast", "inc")).toBe(false);
  });

  test("[Action]: castable during a showdown on the opponent's turn once P1 holds Focus", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 4, name: "Wall" }, "wall")
      .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
      .hand(P1, CARD, "inc")
      .build();
    await game.p2.move("raider", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.p2.passFocus();
    expect(game.p1.can("cast", "inc")).toBe(true);
    await game.p1.cast("inc", { targets: "raider" });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // burned before combat damage is dealt
    expect(game.state("wall").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
