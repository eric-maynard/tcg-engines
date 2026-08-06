/**
 * Fight or Flight — ogn-168-298 · Spell · Chaos · 2 energy
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   [Action] (Play on your turn or in showdowns.)
 *   Move a unit from a battlefield to its base.
 *
 * Rules: 811 (Hidden: hide for [rainbow] at a battlefield you control; from the
 * next turn play it for 0 as a Reaction, targets restricted to that battlefield),
 * 806 (Action timing). "Its base" = the unit's owner's base.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-168-298";

function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 3, name: "Invader" }, "invader")
    .unit(P1, "bf2", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
    .hand(P1, CARD, "fof");
}

describe("Fight or Flight (ogn-168-298)", () => {
  test("costs 2 energy; moves an ENEMY unit from a battlefield to ITS OWNER's base; goes to trash", async () => {
    const game = await board().build();
    await game.p1.cast("fof", { targets: "invader" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.locationOf("invader")).toBe("base");
    expect(game.state("invader").owner).toBe(P2);
    expect(game.p2.units("base")).toContain("invader");
    expect(game.p1.units("base")).not.toContain("invader");
    expect(game.zoneOf("fof")).toBe("trash");
  });

  test("can also send a friendly unit home", async () => {
    const game = await board().build();
    await game.p1.cast("fof", { targets: "scout" });
    await game.settle();
    expect(game.locationOf("scout")).toBe("base");
    expect(game.p1.units("base")).toContain("scout");
  });

  test.failing("BUG: targets only units AT A BATTLEFIELD — a unit in a base is never a legal choice", async () => {
    // Expected: "a unit from a battlefield" restricts the choice to invader/scout; the base-bound
    // Homebody is not offered. Actual: the parsed target is a bare `unit` (the `from: battlefield`
    // sits on the move effect only), so units in a base are offered too.
    const game = await board().build();
    const targets = game.p1.option("cast", "fof")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(2);
    expect(targets).toEqual(expect.arrayContaining([["invader"], ["scout"]]));
    const t = await game.p1.try((p) => p.cast("fof", { targets: "home" }));
    expect(t.ok).toBe(false);
  });

  test("not castable with only 1 energy", async () => {
    const poor = await board().resources(P1, { energy: 1 }).build();
    expect(poor.p1.can("cast", "fof")).toBe(false);
  });

  test("[Action] timing: castable during a showdown; not on the opponent's turn in an open state", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 1 }, "scout")
      .unit(P2, "bf1", { might: 9 }, "wall")
      .hand(P1, CARD, "fof")
      .build();
    await game.p1.move("scout", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("cast", "fof")).toBe(true);
    await game.p1.cast("fof", { targets: "wall" });
    await game.settle();
    expect(game.locationOf("wall")).toBe("base");

    const oppTurn = await board().active(P2).build();
    expect(oppTurn.p1.can("cast", "fof")).toBe(false);
  });

  test("Hidden: hide for [rainbow] at a battlefield you control; no chain opens; not at an enemy battlefield", async () => {
    const game = await board().resources(P1, { energy: 0, power: { rainbow: 1 } }).build();
    expect(game.p1.can("hide", "fof")).toBe(true);
    const bad = await game.p1.try((p) => p.hide("fof", "bf1"));
    expect(bad.ok).toBe(false);
    await game.p1.hide("fof", "bf2");
    expect(game.zoneOf("fof")).toBe("facedown-bf2");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([]);
  });

  test("from facedown on a later turn: played for 0 energy as a Reaction on the opponent's turn, target restricted to that battlefield (811.1.d.2)", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "bf1", { might: 3 }, "elsewhere")
      .unit(P1, "bf2", { might: 2 }, "guard")
      .unit(P2, "base", { might: 4 }, "raider")
      .hand(P1, CARD, "fof")
      .build();
    await game.p1.hide("fof", "bf2");
    await game.advanceTurn(); // → P2's turn
    expect(game.turnPlayer()).toBe(P2);
    // P2 attacks bf2 with the raider; P1 reacts from facedown during the showdown.
    await game.p2.move("raider", "bf2");
    await game.p2.passFocus();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("reveal", "fof")).toBe(true);
    await game.p1.reveal("fof");
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fof", controller: P1 })]);
    await game.settle(); // both pass → resolves → asks for the target
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const keys = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(keys).toEqual(["guard", "raider"]); // "elsewhere" (bf1) is not offered
    await game.p1.pick("raider");
    await game.settle();
    expect(game.locationOf("raider")).toBe("base");
    expect(game.locationOf("guard")).toBe("bf2");
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });
});
