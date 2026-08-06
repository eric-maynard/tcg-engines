/**
 * Pit Rookie — ogn-136-298 · Unit · Body · 2 energy · 2 Might
 *
 *   When you play me, buff another friendly unit.
 *   (If it doesn't have a buff, it gets a +1 [Might] buff.)
 *
 * Rules: buff = a +1 Might marker, a unit can hold at most one (the reminder text);
 * "another" excludes Pit Rookie itself; "friendly" excludes enemy units.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-136-298";

function board(energy = 2) {
  return scenario()
    .resources(P1, { energy })
    .unit(P1, "base", { might: 2, name: "Ally A" }, "a")
    .unit(P1, "base", { might: 3, name: "Ally B" }, "b")
    .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
    .hand(P1, CARD, "rookie");
}

describe("Pit Rookie (ogn-136-298)", () => {
  test("costs 2 energy and enters the base exhausted as a 2-Might unit; 1 energy is not enough", async () => {
    const game = await board().build();
    await game.p1.play("rookie");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("rookie")).toBe("base");
    expect(game.state("rookie").might).toBe(2);
    expect(game.state("rookie").isExhausted).toBe(true);
    const poor = await board(1).build();
    expect(poor.p1.can("play", "rookie")).toBe(false);
  });

  test("When you play me: the chosen other friendly unit gets a +1 Might buff", async () => {
    const game = await board().build();
    await game.p1.play("rookie");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("b");
    await game.settle();
    expect(game.state("b").isBuffed).toBe(true);
    expect(game.state("b").might).toBe(4);
    expect(game.state("a").isBuffed).toBe(false);
    expect(game.state("rookie").isBuffed).toBe(false);
  });

  test("'another friendly unit': neither Pit Rookie itself nor an enemy unit is a legal choice", async () => {
    const game = await board().build();
    await game.p1.play("rookie");
    await game.settle();
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["a", "b"]);
  });

  test("a unit that already has a buff does not get a second one (still +1)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", { might: 3 }, "b", { buffed: true })
      .hand(P1, CARD, "rookie")
      .build();
    expect(game.state("b").might).toBe(4);
    await game.p1.play("rookie");
    await game.settle(); // single legal target → auto-picked
    expect(game.state("b").isBuffed).toBe(true);
    expect(game.state("b").might).toBe(4);
  });

  test.failing("BUG: with no other friendly unit the trigger must do nothing — 'another' excludes Pit Rookie itself", async () => {
    // Expected: no legal target → the play trigger fizzles; Rookie is unbuffed at 2 Might.
    // Actual: with no other friendly unit the engine falls back to buffing Pit Rookie itself.
    const game = await scenario().resources(P1, { energy: 2 }).unit(P2, "base", { might: 2 }, "foe").hand(P1, CARD, "rookie").build();
    await game.p1.play("rookie");
    await game.settle();
    expect(game.zoneOf("rookie")).toBe("base");
    expect(game.state("rookie").isBuffed).toBe(false);
    expect(game.state("foe").isBuffed).toBe(false);
    expect(game.decision()?.kind).toBe("action");
  });
});
