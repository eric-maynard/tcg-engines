/**
 * Salvage — ogn-224-298 · Spell · Order · 2 energy + [order]
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   You may kill up to one gear. Draw 1.
 *
 * "Up to one" + "you may": zero gear is a legal choice, so the spell is
 * castable with no gear anywhere and always draws 1. Any gear (yours or the
 * opponent's) may be chosen.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-224-298";
const FILLER = "ogn-175-298";

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .gear(P2, { name: "Enemy Trinket" }, "trinket")
    .gear(P1, { name: "My Gadget" }, "gadget")
    .deckTop(P1, FILLER, "topdeck")
    .hand(P1, CARD, "salvage");
}

describe("Salvage (ogn-224-298)", () => {
  test("kills the chosen enemy gear and draws 1; pays 2 energy + 1 order; spell to trash", async () => {
    const game = await board().build();
    await game.p1.cast("salvage", { targets: "trinket" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("trinket")).toBe("trash");
    expect(game.zoneOf("gadget")).toBe("base");
    expect(game.p1.hand()).toEqual(["topdeck"]);
    expect(game.zoneOf("salvage")).toBe("trash");
  });

  test("'a gear': your own gear is also a legal choice", async () => {
    const game = await board().build();
    const offered = game.p1.option("cast", "salvage")?.fields.find((f) => f.arg === "targets")?.options;
    expect(offered).toEqual(expect.arrayContaining([[], ["gadget"], ["trinket"]]));
    await game.p1.cast("salvage", { targets: "gadget" });
    await game.settle();
    expect(game.zoneOf("gadget")).toBe("trash");
    expect(game.zoneOf("trinket")).toBe("base");
    expect(game.p1.hand()).toEqual(["topdeck"]);
  });

  test("'up to one': you may kill nothing and still draw 1", async () => {
    const game = await board().build();
    await game.p1.cast("salvage", { targets: [] });
    await game.settle();
    expect(game.zoneOf("trinket")).toBe("base");
    expect(game.zoneOf("gadget")).toBe("base");
    expect(game.p1.hand()).toEqual(["topdeck"]);
    expect(game.zoneOf("salvage")).toBe("trash");
  });

  test("castable with no gear on the board at all — just draws 1", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { order: 1 } }).deckTop(P1, FILLER, "topdeck").hand(P1, CARD, "salvage").build();
    expect(game.p1.can("cast", "salvage")).toBe(true);
    await game.p1.cast("salvage");
    await game.settle();
    expect(game.p1.hand()).toEqual(["topdeck"]);
  });

  test("units are not gear: a unit is never offered as the kill choice", async () => {
    const game = await board().unit(P2, "base", { might: 1 }, "grunt").build();
    const offered = (game.p1.option("cast", "salvage")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];
    expect(offered.flat()).not.toContain("grunt");
    const r = await game.p1.try((p) => p.cast("salvage", { targets: "grunt" }));
    expect(r.ok).toBe(false);
  });

  test("[Action] timing: not playable in the opponent's Neutral Open state; playable once a showdown opens", async () => {
    const game = await board().active(P2).battlefield("bf1").unit(P2, "base", { might: 1 }, "walker").build();
    expect(game.p1.can("cast", "salvage")).toBe(false);
    await game.p2.move("walker", "bf1");
    await game.p2.passFocus();
    expect(game.p1.can("cast", "salvage")).toBe(true);
  });

  test("cost: unaffordable without the order power or with 1 energy", async () => {
    const noOrder = await board().resources(P1, { energy: 2, power: { order: 0 } }).build();
    expect(noOrder.p1.can("cast", "salvage")).toBe(false);
    const low = await board().resources(P1, { energy: 1, power: { order: 1 } }).build();
    expect(low.p1.can("cast", "salvage")).toBe(false);
  });
});
