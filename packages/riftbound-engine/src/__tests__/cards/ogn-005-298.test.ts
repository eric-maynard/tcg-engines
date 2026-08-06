/**
 * Disintegrate — ogn-005-298 · Spell · Fury · 4 energy
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Deal 3 to a unit at a battlefield. If this kills it, do this: draw 1.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-005-298";

function board(energy = 4) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Small" }, "small")
    .unit(P2, "bf1", { might: 5, name: "Big" }, "big")
    .unit(P1, "bf1", { might: 2, name: "Mine" }, "mine")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
    .hand(P1, CARD, "dis");
}

describe("Disintegrate (ogn-005-298)", () => {
  test("costs 4 energy; deals 3 to a unit at a battlefield; a survivor keeps the damage and no card is drawn", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("dis", { targets: "big" });
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("dis")).toBe("chain");
    await game.settle();
    expect(game.state("big").damage).toBe(3);
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
    expect(game.zoneOf("dis")).toBe("trash");
    // "If this kills it" is false → no draw. Hand lost only Disintegrate itself.
    expect(game.p1.hand()).toHaveLength(handBefore - 1);
  });

  test("if the 3 damage kills the unit, the caster draws 1", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    const deckBefore = game.p1.deck().length;
    await game.p1.cast("dis", { targets: "small" });
    await game.settle();
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 1);
    expect(game.p1.deck()).toHaveLength(deckBefore - 1);
    expect(game.p2.hand()).toHaveLength(0); // the caster draws, not the victim's controller
  });

  test("targets only units at a battlefield (friendly or enemy) — base units are not offered", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "dis")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(3);
    expect(targets).toEqual(expect.arrayContaining([["small"], ["big"], ["mine"]]));
    const t = await game.p1.try((p) => p.cast("dis", { targets: "home" }));
    expect(!t.ok && t.error.code).toBe("ILLEGAL_ARGS");
  });

  test("[Action] timing: legal with Focus in a showdown, illegal on the opponent's turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2 }, "runner")
      .unit(P2, "bf1", { might: 9 }, "wall")
      .hand(P1, CARD, "dis")
      .build();
    await game.p1.move("runner", "bf1");
    const d = game.decision() as ActionDecision;
    expect(d.context).toBe("showdown");
    expect(game.p1.can("cast", "dis")).toBe(true);

    const opp = await board().active(P2).build();
    expect(opp.p1.can("cast", "dis")).toBe(false);
  });

  test("not playable with fewer than 4 energy or with no unit at any battlefield", async () => {
    const poor = await board(3).build();
    expect(poor.p1.can("cast", "dis")).toBe(false);
    const noTarget = await scenario().resources(P1, { energy: 4 }).unit(P2, "base", { might: 1 }, "home").hand(P1, CARD, "dis").build();
    expect(noTarget.p1.can("cast", "dis")).toBe(false);
  });
});
