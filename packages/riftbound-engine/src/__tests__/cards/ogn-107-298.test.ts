/**
 * Ava Achiever — ogn-107-298 · Unit · Mind · 5 energy · 4 Might
 *
 *   When I attack, you may pay [mind] to play a card with [Hidden] from your
 *   hand, ignoring its cost. If it's a unit, play it here.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-107-298";
const PAKAA_CUB = "ogn-135-298"; // [Hidden] unit, 3 energy, 3 Might
const FILLER = "ogn-175-298"; // no [Hidden]

function board(mind = 1) {
  return scenario()
    .resources(P1, { energy: 0, power: { mind } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", CARD, "ava")
    .unit(P2, "bf1", { might: 1, name: "Wall" }, "wall")
    .hand(P1, PAKAA_CUB, "cub")
    .hand(P1, FILLER, "plain");
}

/** Ava attacks bf1; both pass on the trigger → the optional prompt is up. */
async function attack(mind = 1) {
  const game = await board(mind).build();
  await game.p1.move("ava", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ava", triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

describe("Ava Achiever (ogn-107-298)", () => {
  test("When I attack: an optional 'pay [mind]' trigger is offered to the attacker", async () => {
    const game = await attack();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "ava", pendingChoiceType: "opt-in" } });
  });

  test("declining pays nothing and plays nothing", async () => {
    const game = await attack();
    await game.p1.no();
    expect(game.p1.power("mind")).toBe(1);
    expect(game.zoneOf("cub")).toBe("hand");
    expect(game.zoneOf("plain")).toBe("hand");
  });

  test("accepting pays [mind] and plays the [Hidden] unit from hand HERE (at bf1), ignoring its cost", async () => {
    // Expected: mind 1 → 0, Pakaa Cub (3 energy) enters bf1 with 0 energy spent; the non-Hidden
    // card is not eligible and stays in hand. Actual: the power is deducted but the play effect
    // does nothing — the Cub stays in hand.
    const game = await attack();
    await game.p1.yes();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("cub");
    }
    expect(game.p1.power("mind")).toBe(0);
    expect(game.p1.energy()).toBe(0);
    expect(game.locationOf("cub")).toBe("bf1");
    expect(game.zoneOf("plain")).toBe("hand");
  });

  test("without [mind] power the cost cannot be paid: nothing is played", async () => {
    const game = await attack(0);
    if (game.decision()?.kind === "yes-no") {
      const r = await game.p1.try((p) => p.yes()); // paying is not a legal answer
      expect(r.ok).toBe(false);
      await game.p1.no();
    }
    await game.settle();
    expect(game.p1.power("mind")).toBe(0);
    expect(game.zoneOf("cub")).toBe("hand");
  });

  test("only when I ATTACK: defending does not trigger", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { power: { mind: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ava")
      .unit(P2, "base", { might: 1 }, "poke")
      .hand(P1, PAKAA_CUB, "cub")
      .build();
    await game.p2.move("poke", "bf1");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.zoneOf("cub")).toBe("hand");
    expect(game.p1.power("mind")).toBe(1);
  });

  test("costs 5 energy to play (4 Might); unaffordable at 4", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "ava").build();
    await game.p1.play("ava");
    expect(game.p1.energy()).toBe(0);
    expect(game.state("ava").might).toBe(4);
    const poor = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "ava").build();
    expect(poor.p1.can("play", "ava")).toBe(false);
  });
});
