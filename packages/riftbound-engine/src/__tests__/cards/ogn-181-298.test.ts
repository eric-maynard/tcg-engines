/**
 * Pack of Wonders — ogn-181-298 · Gear · Chaos · 2 energy
 *
 *   [Exhaust]: Return another friendly gear, unit, or facedown card to its owner's hand.
 *
 * Gear activated abilities are used from base; the [Exhaust] cost gates reuse.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-181-298";
const SKULKER = "ogn-175-298";
const STAND_UNITED = "ogn-053-298"; // a Hidden spell to sit facedown at bf1

function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .gear(P1, CARD, "pack")
    .gear(P1, { cardType: "gear", name: "Trinket" }, "trinket")
    .unit(P1, "bf1", SKULKER, "ally")
    .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
    .gear(P2, { cardType: "gear", name: "Their Trinket" }, "theirs")
    .facedown(P1, "bf1", STAND_UNITED, "hidden");
}

type Built = Awaited<ReturnType<ReturnType<typeof board>["build"]>>;
function offered(game: Built): string[] {
  const opts = game.p1.option("activate", "pack")?.fields.find((f) => f.arg === "targets")?.options ?? [];
  return (opts as string[][]).map((o) => o[0] as string).sort();
}

describe("Pack of Wonders (ogn-181-298)", () => {
  test("costs 2 energy to play and lands in base as gear; unaffordable with 1", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "pack").build();
    await game.p1.play("pack");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("pack")).toBe("base");
    expect(game.p1.gear()).toContain("pack");
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "pack").build();
    expect(poor.p1.can("play", "pack")).toBe(false);
  });

  test("[Exhaust]: returns a friendly unit to its owner's hand and exhausts the Pack (no energy spent)", async () => {
    const game = await board().build();
    expect(game.state("pack").isReady).toBe(true);
    await game.p1.activate("pack", 0, { targets: "ally" });
    expect(game.state("pack").isExhausted).toBe(true);
    await game.settle();
    expect(game.zoneOf("ally")).toBe("hand");
    expect(game.p1.hand()).toContain("ally");
    expect(game.p1.energy()).toBe(0);
    // Exhausted → cannot go again this turn.
    expect(game.p1.can("activate", "pack")).toBe(false);
  });

  test("can return a friendly gear", async () => {
    const game = await board().build();
    await game.p1.activate("pack", 0, { targets: "trinket" });
    await game.settle();
    expect(game.zoneOf("trinket")).toBe("hand");
    expect(game.p1.hand()).toContain("trinket");
  });

  test("can return a friendly FACEDOWN card to its owner's hand", async () => {
    // Expected: the facedown card at bf1 is a legal choice and goes back to P1's hand.
    // Actual: the parsed target is `permanent` (units/gear on the board) — facedown cards are never offered.
    const game = await board().build();
    expect(offered(game)).toContain("hidden");
    await game.p1.activate("pack", 0, { targets: "hidden" });
    await game.settle();
    expect(game.zoneOf("hidden")).toBe("hand");
    expect(game.p1.facedown("bf1")).toEqual([]);
  });

  test("'another friendly': neither the Pack itself nor enemy permanents are legal choices", async () => {
    const game = await board().build();
    const keys = offered(game);
    expect(keys).toEqual(expect.arrayContaining(["ally", "trinket"]));
    expect(keys).not.toContain("pack");
    expect(keys).not.toContain("foe");
    expect(keys).not.toContain("theirs");
    const r = await game.p1.try((p) => p.activate("pack", 0, { targets: "foe" }));
    expect(r.ok).toBe(false);
  });

  test("readies at your next Awaken and can be used again", async () => {
    const game = await board().build();
    await game.p1.activate("pack", 0, { targets: "trinket" });
    await game.settle();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("pack").isReady).toBe(true);
    expect(game.p1.can("activate", "pack")).toBe(true);
  });
});
