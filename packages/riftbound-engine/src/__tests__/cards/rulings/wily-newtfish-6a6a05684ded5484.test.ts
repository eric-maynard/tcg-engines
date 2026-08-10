/**
 * Ruling 6a6a05684ded5484 — Wily Newtfish (UNL-108 → unl-108-219) · Unit · Body · 4 · 4 Might
 *   "If you've gained XP this turn, I have +1 [Might] and [Ganking]."
 *   (+ an inline spell "Insight — Gain 1 XP." as the turn's XP gain.)
 *
 * Q: I gain XP on my turn and then play Wily Newtfish. Do the +1 Might and Ganking stay, or only for this turn?
 * A: They do not persist. It is a conditional static ability continuously checking "gained XP THIS turn"; once the turn
 *    ends the condition is no longer met, so both the +1 Might and Ganking are gone (until you gain XP again that turn).
 * Rules: 700–706 (static abilities apply only while their condition holds), 317.2 (turn-scoped state resets at end of turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WILY_NEWTFISH = "unl-108-219";

const INSIGHT = {
  abilities: [{ effect: { amount: 1, type: "gain-xp" }, type: "spell" }],
  cardType: "spell",
  energyCost: 0,
  name: "Insight",
  rulesText: "Gain 1 XP.",
};

/** P1's turn with the Newtfish's [4]; two Insights in hand (one for a later turn). */
function board() {
  return scenario().resources(P1, { energy: 4 }).hand(P1, INSIGHT, "insight1").hand(P1, INSIGHT, "insight2").hand(P1, WILY_NEWTFISH, "newt");
}

const hasGanking = (game: Game) => game.state("newt").keywords.includes("Ganking");

/** P1 gains 1 XP (Insight), then plays the Newtfish. */
async function xpThenNewtfish(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("insight1");
  await game.settle();
  expect(game.p1.xp()).toBe(1);
  await game.p1.play("newt");
  await game.settle();
  expect(game.zoneOf("newt")).toBe("base");
  return game;
}

describe("Ruling 6a6a05684ded5484 — Wily Newtfish's bonus only lasts while 'you've gained XP this turn' is true", () => {
  test("control: played WITHOUT having gained XP this turn it is a plain 4 with no Ganking", async () => {
    const game = await board().build();
    await game.p1.play("newt");
    await game.settle();
    expect(game.state("newt").might).toBe(4);
    expect(hasGanking(game)).toBe(false);
  });

  test("gain XP, then play it: the condition is already true this turn, so it is immediately 5 Might with Ganking", async () => {
    const game = await xpThenNewtfish();
    expect(game.state("newt")).toMatchObject({ baseMight: 4, might: 5 });
    expect(hasGanking(game)).toBe(true);
  });

  test("the bonus does NOT stay: once the turn ends (opponent's turn) the Newtfish is back to 4 Might without Ganking — XP total unchanged, only 'this turn' lapsed", async () => {
    const game = await xpThenNewtfish();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.xp()).toBe(1);
    expect(game.state("newt").might).toBe(4);
    expect(hasGanking(game)).toBe(false);
  });

  test("still off on P1's NEXT turn until XP is gained again that turn — then it switches back on (continuous check, not a one-shot)", async () => {
    const game = await xpThenNewtfish();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("newt").might).toBe(4);
    expect(hasGanking(game)).toBe(false);
    await game.p1.cast("insight2");
    await game.settle();
    expect(game.p1.xp()).toBe(2);
    expect(game.state("newt").might).toBe(5);
    expect(hasGanking(game)).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
