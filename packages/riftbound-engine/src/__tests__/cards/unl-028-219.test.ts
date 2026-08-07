/**
 * Pyke, Dockside Butcher — unl-028-219 · Unit · Fury · 3 energy · 2 Might · Champion
 *
 *   [Hidden]
 *   [Ganking]
 *   You may pay [fury] as an additional cost to play me.
 *   When you play me, if you paid the additional cost, ready me and give me +2 [Might] this turn.
 *
 * Rules: 356.2 / 560 (an optional additional cost is offered and paid as the card is played),
 * 428 (the "if you paid" payoff only fires when the cost was actually paid).
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "unl-028-219";

function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .hand(P1, CARD, "pyke");
}

describe("Pyke, Dockside Butcher (unl-028-219)", () => {
  test("the optional [fury] additional cost is offered when playing him", async () => {
    const game = await board().build();
    const fields = game.p1.option("play", "pyke")?.fields;
    expect(fields?.some((f) => f.arg === "payOptional")).toBe(true);
  });

  test("paying [fury] fires the payoff — Pyke is readied and gets +2 Might this turn", async () => {
    const game = await board().build();
    await game.p1.play("pyke", { payOptional: true, to: "base" });
    await game.settle();
    expect(game.zoneOf("pyke")).toBe("base");
    expect(game.p1.power("fury")).toBe(0);
    expect(game.state("pyke").might).toBe(4);
    expect(game.state("pyke").isReady).toBe(true);
  });

  test("declining the additional cost plays Pyke at 2 Might with the [fury] unspent", async () => {
    const game = await board().build();
    await game.p1.play("pyke", { to: "base" });
    await game.settle();
    expect(game.zoneOf("pyke")).toBe("base");
    expect(game.p1.power("fury")).toBe(1);
    expect(game.state("pyke").might).toBe(2);
  });
});
