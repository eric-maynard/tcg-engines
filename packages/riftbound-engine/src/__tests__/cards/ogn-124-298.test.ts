/**
 * Arena Bar — ogn-124-298 · Gear · Body · 3 energy
 *
 *   [Exhaust]: Buff an exhausted friendly unit.
 *   (If it doesn't have a buff, it gets a +1 [Might] buff.)
 *
 * Rules: 375–379 (activated abilities: cost before ":"), 700–703 (buffs: +1 Might,
 * at most one buff per unit), 355.8 (a required target must exist to activate).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-124-298";

function board() {
  return scenario()
    .gear(P1, CARD, "bar")
    .unit(P1, "base", { might: 2 }, "tired", { exhausted: true })
    .unit(P1, "base", { might: 2 }, "fresh")
    .unit(P2, "base", { might: 2 }, "foeTired", { exhausted: true });
}

describe("Arena Bar (ogn-124-298)", () => {
  test("playing the gear costs 3 energy (no power) and it enters base ready", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "bar").build();
    await game.p1.play("bar");
    await game.settle();
    expect(game.zoneOf("bar")).toBe("base");
    expect(game.state("bar").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    const poor = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "bar").build();
    expect(poor.p1.can("play", "bar")).toBe(false);
  });

  test("[Exhaust]: exhausts Arena Bar as the cost and buffs the chosen exhausted friendly unit (+1 Might)", async () => {
    const game = await board().build();
    await game.p1.activate("bar", 0, { targets: ["tired"] });
    expect(game.state("bar").isExhausted).toBe(true); // cost paid on activation
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bar", controller: P1, triggered: false })]);
    expect(game.state("tired").isBuffed).toBe(false); // not until it resolves
    await game.settle();
    expect(game.state("tired").isBuffed).toBe(true);
    expect(game.state("tired").might).toBe(3);
    expect(game.state("tired").isExhausted).toBe(true); // buffing does not ready it
    expect(game.state("fresh").isBuffed).toBe(false);
  });

  test("targets: only EXHAUSTED FRIENDLY units — ready friendly units and exhausted enemy units are not offered", async () => {
    const game = await board().build();
    const targets = game.p1.option("activate", "bar")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual([["tired"]]);
    const t1 = await game.p1.try((p) => p.activate("bar", 0, { targets: ["fresh"] }));
    expect(!t1.ok && t1.error.code).toBe("ILLEGAL_ARGS");
    const t2 = await game.p1.try((p) => p.activate("bar", 0, { targets: ["foeTired"] }));
    expect(!t2.ok && t2.error.code).toBe("ILLEGAL_ARGS");
  });

  test("not activatable with no exhausted friendly unit, or when Arena Bar is already exhausted", async () => {
    const none = await scenario().gear(P1, CARD, "bar").unit(P1, "base", { might: 2 }, "fresh").build();
    expect(none.p1.can("activate", "bar")).toBe(false);
    const tapped = await scenario()
      .gear(P1, CARD, "bar", { exhausted: true })
      .unit(P1, "base", { might: 2 }, "tired", { exhausted: true })
      .build();
    expect(tapped.p1.can("activate", "bar")).toBe(false);
  });

  test("a unit that already has a buff gains nothing more (one buff max, still +1 Might)", async () => {
    const game = await scenario()
      .gear(P1, CARD, "bar")
      .unit(P1, "base", { might: 2 }, "tired", { buffed: true, exhausted: true })
      .build();
    expect(game.state("tired").might).toBe(3);
    await game.p1.activate("bar", 0, { targets: ["tired"] });
    await game.settle();
    expect(game.state("tired").isBuffed).toBe(true);
    expect(game.state("tired").might).toBe(3);
  });

  test("Arena Bar readies at the start of your next turn and can be used again", async () => {
    const game = await board().build();
    await game.p1.activate("bar", 0, { targets: ["tired"] });
    await game.settle();
    await game.advanceTurn(); // → P2
    expect(game.state("bar").isExhausted).toBe(true);
    await game.advanceTurn(); // → P1 (awaken readies your permanents)
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("bar").isReady).toBe(true);
  });
});
