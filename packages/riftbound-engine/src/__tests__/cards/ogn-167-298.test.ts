/**
 * Ember Monk — ogn-167-298 · Unit · Chaos · 4 energy · 4 Might
 *
 *   When you play a card from [Hidden], give me +2 [Might] this turn.
 *
 * Rules: 811.1.b (a hidden card may be played from facedown beginning on the next
 * turn, ignoring its base cost), 811.1.c.3 (playing from facedown IS playing a card),
 * 811.1.d.1 (a hidden permanent is played to that battlefield).
 * Helper cards: Pakaa Cub (ogn-135-298) — a vanilla [Hidden] unit.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "ogn-167-298";
const PAKAA_CUB = "ogn-135-298"; // [Hidden] unit, no other text
const SKULKER = "ogn-175-298"; // vanilla 3-cost unit

/** Monk on board, Pakaa Cub hidden at bf1 two turns ago → it is P1's turn again and the Cub may be played. */
async function hiddenCubReady() {
  const game = await scenario()
    .resources(P1, { power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", CARD, "monk")
    .hand(P1, PAKAA_CUB, "cub")
    .build();
  await game.p1.hide("cub", "bf1");
  expect(game.zoneOf("cub")).toBe("facedown-bf1");
  await game.advanceTurn();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  return game;
}

describe("Ember Monk (ogn-167-298)", () => {
  test("costs 4 energy and is a 4-Might unit; unaffordable with 3", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "monk").build();
    await game.p1.play("monk");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("monk")).toBe("base");
    expect(game.state("monk").might).toBe(4);
    const poor = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "monk").build();
    expect(poor.p1.can("play", "monk")).toBe(false);
  });

  test("playing a card normally (not from Hidden) does not trigger the bonus", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).unit(P1, "base", CARD, "monk").hand(P1, SKULKER, "sk").build();
    await game.p1.play("sk");
    await game.settle();
    expect(game.zoneOf("sk")).toBe("base");
    expect(game.state("monk").might).toBe(4);
    expect(game.chain()).toHaveLength(0);
  });

  test("hiding a card is not playing it — no bonus when the card goes facedown (rule 811.1.c.1)", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "monk")
      .hand(P1, PAKAA_CUB, "cub")
      .build();
    await game.p1.hide("cub", "bf1");
    expect(game.state("monk").might).toBe(4);
  });

  test("playing a card from Hidden gives Ember Monk +2 Might this turn (4 → 6), gone next turn", async () => {
    const game = await hiddenCubReady();
    await game.p1.reveal("cub");
    await game.settle();
    expect(game.zoneOf("cub")).toBe("battlefield-bf1"); // played to the battlefield it was hidden at
    expect(game.p1.energy()).toBe(0); // base cost ignored
    expect(game.state("monk").might).toBe(6);
    await game.advanceTurn();
    expect(game.state("monk").might).toBe(4);
  });
});
