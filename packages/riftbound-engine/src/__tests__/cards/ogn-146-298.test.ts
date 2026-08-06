/**
 * Wallop — ogn-146-298 · Spell · Body · 2 energy
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   As you play this, you may spend a buff as an additional cost. If you do,
 *   ignore this spell's cost.
 *   Ready a unit.
 *
 * Spending a buff removes one buff counter from a unit YOU control (it is an
 * optional additional cost, rule 356.2.b); doing so makes the play free.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-146-298";
const EXHAUSTED = { __flags: { exhausted: true } } as const;

function board(energy = 2) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Tired" }, "tired", EXHAUSTED)
    .unit(P1, "base", { might: 3, name: "Buffed" }, "buffed", { buffed: true })
    .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe", EXHAUSTED)
    .hand(P1, CARD, "wallop");
}

describe("Wallop (ogn-146-298)", () => {
  test("readies the chosen exhausted unit; costs 2 energy; goes to trash", async () => {
    const game = await board().build();
    await game.p1.cast("wallop", { targets: "tired" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("tired").isReady).toBe(true);
    expect(game.state("foe").isExhausted).toBe(true);
    expect(game.zoneOf("wallop")).toBe("trash");
  });

  test("'a unit': any unit is a legal target, including an enemy unit at a battlefield", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "wallop")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual(expect.arrayContaining([["tired"], ["buffed"], ["foe"]]));
    await game.p1.cast("wallop", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").isReady).toBe(true);
  });

  test("may spend a buff as an additional cost — then the 2 energy is ignored (free with 0 energy)", async () => {
    // Expected: with 0 energy but a buffed unit you control, Wallop is playable by spending the
    // buff (payOptional); the buff is removed and no energy is paid. Actual: the optional
    // buff cost is not parsed, so Wallop is simply unaffordable at 0 energy.
    const game = await board(0).build();
    expect(game.p1.can("cast", "wallop")).toBe(true);
    await game.p1.cast("wallop", { payOptional: true, targets: "tired" });
    expect(game.p1.energy()).toBe(0);
    expect(game.state("buffed").isBuffed).toBe(false);
    await game.settle();
    expect(game.state("tired").isReady).toBe(true);
  });

  test("spending the buff with energy available leaves the energy untouched", async () => {
    // Expected: pay by spending the buff → still 2 energy afterwards, buff gone.
    // Actual: no optional-cost path exists; 2 energy is always deducted and the buff stays.
    const game = await board(2).build();
    await game.p1.cast("wallop", { payOptional: true, targets: "tired" });
    expect(game.state("buffed").isBuffed).toBe(false);
    expect(game.p1.energy()).toBe(2);
  });

  test("declining the optional cost: pays 2 energy and the buff stays", async () => {
    const game = await board(2).build();
    await game.p1.cast("wallop", { targets: "tired" });
    expect(game.p1.energy()).toBe(0);
    expect(game.state("buffed").isBuffed).toBe(true);
  });

  test("[Action] timing: not playable during the opponent's Neutral Open state, playable in a showdown", async () => {
    const game = await board().active(P2).battlefield("bf2").unit(P2, "base", { might: 1 }, "walker").build();
    expect(game.p1.can("cast", "wallop")).toBe(false);
    await game.p2.move("walker", "bf2"); // uncontrolled empty battlefield → showdown
    await game.p2.passFocus();
    expect(game.p1.can("cast", "wallop")).toBe(true);
  });

  test("cost: not castable with 1 energy and no buff to spend", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", { might: 2 }, "u", EXHAUSTED).hand(P1, CARD, "wallop").build();
    expect(game.p1.can("cast", "wallop")).toBe(false);
  });
});
