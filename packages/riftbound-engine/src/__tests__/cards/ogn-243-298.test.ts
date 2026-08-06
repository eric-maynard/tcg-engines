/**
 * Darius, Executioner — ogn-243-298 · Champion Unit · Order · 6 energy + [order] · 6 might
 *
 *   [Legion] — When you play me, ready me. (Get the effect if you've played another card this turn)
 *   Other friendly units have +1 [Might] here.
 *
 * Rules: 812 Legion (dependent ability is active once you have finalized a DIFFERENT card this
 * turn); units enter exhausted (143.4) so the Legion play-trigger readies him; the second line is a
 * static +1 Might for OTHER friendly units at Darius's current location only.
 *
 * Engine note: static Might bonuses are only recomputed when a chain resolves, so the static tests
 * cast a 0-cost "Draw 1" spell first as a nudge; the always-on expectation is its own BUG test.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-243-298";
const CHEAP = { energyCost: 1, might: 1, name: "Cheap Recruit" };
const NUDGE = { abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }], cardType: "spell", energyCost: 0, name: "Nudge", timing: "action" };

async function nudge(game: Game) {
  await game.p1.cast("nudge");
  await game.settle();
}

function staticBoard(dariusAt: "base" | "bf1") {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .unit(P1, dariusAt, CARD, "darius")
    .unit(P1, "bf1", { might: 2, name: "Ally Field" }, "field")
    .unit(P2, "bf1", { might: 2, name: "Enemy Field" }, "foe")
    .unit(P1, "base", { might: 2, name: "Ally Home" }, "home")
    .hand(P1, NUDGE, "nudge");
}

describe("Darius, Executioner (ogn-243-298)", () => {
  test("cost: 6 energy + 1 order for a 6-might unit; unaffordable without the order power or with 5 energy", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { order: 1 } }).hand(P1, CARD, "darius").build();
    await game.p1.play("darius");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("darius")).toBe("base");
    expect(game.state("darius").might).toBe(6);
    const noPower = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "darius").build();
    expect(noPower.p1.can("play", "darius")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 5, power: { order: 1 } }).hand(P1, CARD, "darius").build();
    expect(lowEnergy.p1.can("play", "darius")).toBe(false);
  });

  test("Legion NOT met (first card you play this turn): Darius enters and stays exhausted", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { order: 1 } }).hand(P1, CARD, "darius").build();
    await game.p1.play("darius");
    await game.settle();
    expect(game.state("darius").isExhausted).toBe(true);
  });

  test("Legion met (another card played earlier this turn) — 'When you play me, ready me' leaves Darius ready (rule 812)", async () => {
    // Expected: after Cheap Recruit was played this turn, playing Darius fires the Legion play
    // trigger and he ends ready. Actual: the keyword ability's effect is never triggered.
    const game = await scenario()
      .resources(P1, { energy: 7, power: { order: 1 } })
      .hand(P1, CHEAP, "cheap")
      .hand(P1, CARD, "darius")
      .build();
    await game.p1.play("cheap");
    await game.settle();
    expect(game.state("cheap").isExhausted).toBe(true); // baseline: units enter exhausted
    await game.p1.play("darius");
    await game.settle();
    expect(game.zoneOf("darius")).toBe("base");
    expect(game.state("darius").isReady).toBe(true);
    expect(game.state("cheap").isExhausted).toBe(true); // only "me" is readied
  });

  test("Legion needs another card THIS turn: a card played on a previous turn does not count", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).hand(P1, CHEAP, "cheap").hand(P1, CARD, "darius").build();
    await game.p1.play("cheap");
    await game.settle();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 6 - game.p1.energy(), power: { order: 1 } });
    await game.p1.play("darius");
    await game.settle();
    expect(game.state("darius").isExhausted).toBe(true);
  });

  test("static: OTHER friendly units at Darius's battlefield get +1 Might — not Darius, not enemies, not allies in base", async () => {
    const game = await staticBoard("bf1").build();
    await nudge(game);
    expect(game.state("field").might).toBe(3);
    expect(game.state("field").staticMightBonus).toBe(1);
    expect(game.state("darius").might).toBe(6);
    expect(game.state("foe").might).toBe(2);
    expect(game.state("home").might).toBe(2);
  });

  test("static: 'here' also works in base — with Darius in base, base allies get +1 and battlefield allies do not", async () => {
    const game = await staticBoard("base").build();
    await nudge(game);
    expect(game.state("home").might).toBe(3);
    expect(game.state("field").might).toBe(2);
    expect(game.state("darius").might).toBe(6);
  });

  test.failing("BUG: the static is continuous — the bonus shows on the scenario position without any chain resolving", async () => {
    // Expected: statics are always-on, so Ally Field already reads 3. Actual: 2 until a chain resolves.
    const game = await staticBoard("bf1").build();
    expect(game.state("field").might).toBe(3);
  });

  test("the static follows Darius — a Standard Move base → bf1 shifts the bonus immediately", async () => {
    // Expected: right after the move, home drops to 2 and field rises to 3.
    // Actual: no static recalculation after a standard move; stale values remain.
    const game = await staticBoard("base").build();
    await nudge(game);
    expect(game.state("home").might).toBe(3);
    await game.p1.move("darius", "bf1");
    expect(game.locationOf("darius")).toBe("bf1");
    expect(game.state("home").might).toBe(2);
    expect(game.state("field").might).toBe(3);
  });
});
