/**
 * Cithria of Cloudfield — ogn-139-298 · Unit · Body · 2 energy · 1 might
 *
 *   When you play another unit, buff me. (If I don't have a buff, I get a +1 [Might] buff.)
 *
 * Rules: 426/702 (Buff = one buff counter, +1 Might; a buffed unit does not get a second one),
 * "another" excludes Cithria's own play; "you play" = only her controller's unit plays.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-139-298";
const CHEAP = { energyCost: 1, might: 1, name: "Cheap Recruit" };

describe("Cithria of Cloudfield (ogn-139-298)", () => {
  test("cost: 2 energy for a 1-might unit; not playable with 1 energy", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "cith").build();
    await game.p1.play("cith");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("cith")).toBe("base");
    expect(game.state("cith").might).toBe(1);
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "cith").build();
    expect(poor.p1.can("play", "cith")).toBe(false);
  });

  test("playing Cithria herself does not buff her ('another unit')", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "cith").build();
    await game.p1.play("cith");
    await game.settle();
    expect(game.state("cith").isBuffed).toBe(false);
    expect(game.state("cith").might).toBe(1);
  });

  test("playing another friendly unit should buff Cithria (+1 Might); the parsed `play-unit` trigger event never fires", async () => {
    // Expected: after u1 is played, Cithria carries a buff counter and reads 2 Might.
    // Actual: the engine emits play-card/play-self only; the `play-unit` trigger never matches.
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P1, "base", CARD, "cith")
      .hand(P1, CHEAP, "u1")
      .build();
    expect(game.state("cith").isBuffed).toBe(false);
    await game.p1.play("u1");
    await game.settle();
    expect(game.zoneOf("u1")).toBe("base");
    expect(game.state("cith").isBuffed).toBe(true);
    expect(game.state("cith").might).toBe(2);
    expect(game.state("u1").isBuffed).toBe(false); // only Cithria is buffed
  });

  test("already buffed — a second unit play leaves Cithria at exactly one buff (2 Might); trigger never fires today", async () => {
    // Expected: buffed once after u1, still a single buff (2 Might) after u2 (rule 426.1.b.1).
    // Actual: never buffed at all because the play-unit trigger does not fire.
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", CARD, "cith")
      .hand(P1, CHEAP, "u1")
      .hand(P1, CHEAP, "u2")
      .build();
    await game.p1.play("u1");
    await game.settle();
    await game.p1.play("u2");
    await game.settle();
    expect(game.state("cith").isBuffed).toBe(true);
    expect(game.state("cith").might).toBe(2);
  });

  test("only YOUR unit plays count: an opponent playing a unit does not buff Cithria", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P1, "base", CARD, "cith")
      .hand(P2, CHEAP, "theirs")
      .build();
    await game.p2.play("theirs");
    await game.settle();
    expect(game.zoneOf("theirs")).toBe("base");
    expect(game.state("cith").isBuffed).toBe(false);
    expect(game.state("cith").might).toBe(1);
  });

  test("playing a spell or gear does not trigger it (units only)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0 })
      .unit(P1, "base", CARD, "cith")
      .hand(P1, { cardType: "gear", energyCost: 0, name: "Trinket" }, "gear")
      .build();
    await game.p1.play("gear");
    await game.settle();
    expect(game.zoneOf("gear")).toBe("base");
    expect(game.state("cith").isBuffed).toBe(false);
  });
});
