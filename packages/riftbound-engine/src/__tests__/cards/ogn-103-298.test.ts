/**
 * Ravenbloom Student — ogn-103-298 · Unit · Mind · 2 energy · 2 Might
 *
 *   When you play a spell, give me +1 [Might] this turn.
 *
 * Rule 359.3.e.10: a spell is "played" as it resolves — the trigger fires then
 * (even if the spell's instructions do nothing); a countered spell was never played.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-103-298";
const WIND_WALL = "ogn-064-298"; // [Reaction] Counter a spell. (3 energy, 2 calm)

/** Inline 1-energy action spell with no targets: draw 1. */
const STUDY = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Test Study",
  timing: "action",
};

function board(active = P1) {
  return scenario()
    .active(active)
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 3, power: { calm: 2 } })
    .unit(P1, "base", CARD, "student")
    .hand(P1, STUDY, "s1")
    .hand(P1, STUDY, "s2")
    .hand(P2, STUDY, "theirs");
}

describe("Ravenbloom Student (ogn-103-298)", () => {
  test("costs 2 energy and enters the base as a 2-Might unit; 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "student").build();
    await game.p1.play("student");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("student")).toBe("base");
    expect(game.state("student").might).toBe(2);
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "student").build();
    expect(poor.p1.can("play", "student")).toBe(false);
  });

  test("playing a spell gives it +1 Might once that spell resolves; the bonus lasts only this turn", async () => {
    const game = await board().build();
    await game.p1.cast("s1");
    expect(game.zoneOf("s1")).toBe("chain");
    expect(game.state("student").might).toBe(2); // not yet: the spell hasn't resolved
    await game.settle();
    expect(game.zoneOf("s1")).toBe("trash");
    expect(game.state("student").might).toBe(3);
    await game.advanceTurn();
    expect(game.state("student").might).toBe(2);
  });

  test("each spell you play triggers it: two spells = +2 (2 → 4)", async () => {
    const game = await board().build();
    await game.p1.cast("s1");
    await game.settle();
    await game.p1.cast("s2");
    await game.settle();
    expect(game.state("student").might).toBe(4);
  });

  test("'you': an opponent playing a spell does not pump it", async () => {
    const game = await board(P2).build();
    await game.p2.cast("theirs");
    await game.settle();
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.state("student").might).toBe(2);
  });

  test("a countered spell was never played — no +1 (rule 359.3.e.10)", async () => {
    const game = await board().hand(P2, WIND_WALL, "wall").build();
    await game.p1.cast("s1");
    await game.p2.cast("wall");
    await game.settle();
    expect(game.zoneOf("s1")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.p1.hand()).toEqual(["s2"]); // the draw never happened
    expect(game.state("student").might).toBe(2);
  });

  test("playing a unit is not playing a spell", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P1, "base", CARD, "student")
      .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Test Recruit" }, "recruit")
      .build();
    await game.p1.play("recruit");
    await game.settle();
    expect(game.state("student").might).toBe(2);
  });
});
