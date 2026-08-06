/**
 * Kinkou Monk — ogn-141-298 · Unit · Body · 4 energy + [body] · 4 Might
 *
 *   When you play me, buff up to two other friendly units.
 *   (Each one that doesn't have a buff gets a +1 [Might] buff.)
 *
 * Rules 702–703: a buff is a +1 Might marker, at most one per unit.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-141-298";

function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { body: 1 } })
    .unit(P1, "base", { might: 2, name: "A" }, "a")
    .unit(P1, "base", { might: 2, name: "B" }, "b")
    .unit(P1, "base", { might: 2, name: "C" }, "c")
    .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
    .hand(P1, CARD, "monk");
}

/** Play the Monk and land on the trigger's target prompt. */
async function playToPrompt() {
  const game = await board().build();
  await game.p1.play("monk");
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "monk" } });
  return game;
}

describe("Kinkou Monk (ogn-141-298)", () => {
  test("cost: 4 energy + 1 body for a 4-Might unit in base; unaffordable short of either", async () => {
    const game = await board().build();
    await game.p1.play("monk");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("monk")).toBe("base");
    expect(game.state("monk").baseMight).toBe(4);
    const noPower = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "monk").build();
    expect(noPower.p1.can("play", "monk")).toBe(false);
    const noEnergy = await scenario().resources(P1, { energy: 3, power: { body: 1 } }).hand(P1, CARD, "monk").build();
    expect(noEnergy.p1.can("play", "monk")).toBe(false);
  });

  test("When you play me: only OTHER FRIENDLY units are offered; picking one buffs it (+1 Might)", async () => {
    const game = await playToPrompt();
    const d = game.decision();
    const keys = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(keys.sort()).toEqual(["a", "b", "c"]); // not monk, not foe
    await game.p1.pick("b");
    await game.settle();
    expect(game.state("b").isBuffed).toBe(true);
    expect(game.state("b").might).toBe(3);
    expect(game.state("a").isBuffed).toBe(false);
    expect(game.state("monk").isBuffed).toBe(false);
    expect(game.state("monk").might).toBe(4);
    expect(game.state("foe").isBuffed).toBe(false);
  });

  test.failing("BUG: 'up to two' — two other friendly units can be chosen and both get buffed", async () => {
    // Expected: the target prompt allows 0..2 picks; choosing a+b buffs both.
    // Actual: the engine prompt is min 1 / max 1 ("accepts exactly one pick"), so only one unit can be buffed.
    const game = await playToPrompt();
    const d = game.decision();
    expect(d?.kind === "pick" && d.max).toBe(2);
    await game.p1.pick("a", "b");
    await game.settle();
    expect(game.state("a").isBuffed).toBe(true);
    expect(game.state("b").isBuffed).toBe(true);
    expect(game.state("a").might).toBe(3);
    expect(game.state("b").might).toBe(3);
    expect(game.state("c").isBuffed).toBe(false);
  });

  test.failing("BUG: 'up to two' — choosing no unit at all is allowed", async () => {
    // Expected: min 0 / decline allowed; declining buffs nobody and returns to the open main phase.
    // Actual: the prompt is mandatory (min 1, allowDecline false) so decline is rejected.
    const game = await playToPrompt();
    const d = game.decision();
    expect(d?.kind === "pick" && (d.min === 0 || d.allowDecline)).toBe(true);
    await game.p1.decline();
    await game.settle();
    expect(game.state("a").isBuffed || game.state("b").isBuffed || game.state("c").isBuffed).toBe(false);
    expect(game.decision()?.kind).toBe("action");
  });

  test("a unit that already has a buff does not get a second one (703)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { body: 1 } })
      .unit(P1, "base", { might: 2 }, "vet", { buffed: true })
      .unit(P1, "base", { might: 2 }, "fresh")
      .hand(P1, CARD, "monk")
      .build();
    expect(game.state("vet").might).toBe(3);
    await game.p1.play("monk");
    await game.settle();
    await game.p1.pick("vet");
    await game.settle();
    expect(game.state("vet").isBuffed).toBe(true);
    expect(game.state("vet").might).toBe(3);
    expect(game.state("fresh").might).toBe(2);
  });

  test("with no other friendly units the Monk simply lands and nothing is asked", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { body: 1 } }).unit(P2, "base", { might: 2 }, "foe").hand(P1, CARD, "monk").build();
    await game.p1.play("monk");
    await game.settle();
    expect(game.zoneOf("monk")).toBe("base");
    expect(game.decision()?.kind).toBe("action");
    expect(game.state("foe").isBuffed).toBe(false);
  });
});
