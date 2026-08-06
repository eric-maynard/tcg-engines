/**
 * Vanguard Captain — ogn-218-298 · Unit · Order · 3 energy + [order] · 3 Might
 *
 *   [Legion] — When you play me, play two 1 [Might] Recruit unit tokens here.
 *   (Get the effect if you've played another card this turn.)
 *
 * Rules: 812 (Legion — the play trigger is active only if you finalized another card
 * earlier this turn), 187.1 (a Recruit token is a 1-Might unit token), 143.4 (units,
 * tokens included, enter exhausted).
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "ogn-218-298";
const CHEAP = { energyCost: 1, might: 1, name: "Cheap Recruit" }; // the "another card" played first

function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2 }, "holder")
    .hand(P1, CHEAP, "cheap")
    .hand(P1, CARD, "captain");
}

type Built = Awaited<ReturnType<ReturnType<typeof board>["build"]>>;
const tokensAt = (game: Built, loc: "base" | "bf1") => game.p1.units(loc).filter((u) => game.state(u).isToken);

describe("Vanguard Captain (ogn-218-298)", () => {
  test("cost: 3 energy + 1 order for a 3-Might unit; unaffordable short of either", async () => {
    const game = await board().build();
    await game.p1.play("captain", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("captain")).toBe("base");
    expect(game.state("captain").might).toBe(3);
    const noPower = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "captain").build();
    expect(noPower.p1.can("play", "captain")).toBe(false);
    const noEnergy = await scenario().resources(P1, { energy: 2, power: { order: 1 } }).hand(P1, CARD, "captain").build();
    expect(noEnergy.p1.can("play", "captain")).toBe(false);
  });

  test("Legion not met: as the first card you play this turn, no tokens are created", async () => {
    const game = await board().build();
    await game.p1.play("captain", { to: "base" });
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(tokensAt(game, "base")).toHaveLength(0);
    expect(game.p1.units("base")).toEqual(["captain"]);
  });

  test("Legion met: after playing another card this turn, playing me creates two 1-Might Recruit tokens in my location (base)", async () => {
    const game = await board().build();
    await game.p1.play("cheap", { to: "base" });
    await game.settle();
    await game.p1.play("captain", { to: "base" });
    await game.settle();
    const tokens = tokensAt(game, "base");
    expect(tokens).toHaveLength(2);
    for (const t of tokens) {
      expect(game.state(t)).toMatchObject({ cardType: "unit", controller: P1, isToken: true, might: 1, name: "Recruit" });
    }
    expect(tokensAt(game, "bf1")).toHaveLength(0);
  });

  test("'here': played to a battlefield you control, the tokens appear at that battlefield, not in base", async () => {
    const game = await board().build();
    await game.p1.play("cheap", { to: "base" });
    await game.settle();
    await game.p1.play("captain", { to: "bf1" });
    await game.settle();
    expect(game.locationOf("captain")).toBe("bf1");
    expect(tokensAt(game, "bf1")).toHaveLength(2);
    expect(tokensAt(game, "base")).toHaveLength(0);
  });

  test("the Recruit tokens enter exhausted like any unit (143.4)", async () => {
    const game = await board().build();
    await game.p1.play("cheap", { to: "base" });
    await game.settle();
    await game.p1.play("captain", { to: "base" });
    await game.settle();
    const tokens = tokensAt(game, "base");
    expect(tokens).toHaveLength(2);
    expect(tokens.every((t) => game.state(t).isExhausted)).toBe(true);
  });

  test("Legion counts cards played THIS turn only: a card played last turn does not enable it", async () => {
    const game = await board().build();
    await game.p1.play("cheap", { to: "base" });
    await game.settle();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 3, power: { order: 1 } });
    await game.p1.play("captain", { to: "base" });
    await game.settle();
    expect(tokensAt(game, "base")).toHaveLength(0);
  });
});
