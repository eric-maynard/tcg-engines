/**
 * Ruling 93b53e73486fb76d — Darius, Trifarian (OGN-027 → ogn-027-298) · Champion Unit · 5 Might ·
 *   "When you play your second card in a turn, give me +2 [Might] this turn and ready me."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · "[Hidden] … [Action] Kill a unit at a battlefield."
 *
 * Q: Darius is exhausted in my base. If I hide a card at a battlefield, does he ready and get +2 Might?
 * A: No. Hiding is a Discretionary Action, not a play — it does not open a chain and does not count towards
 *    "your second card in a turn". Darius stays exhausted at 5 Might. Actually PLAYING a second card does it.
 * Rules: 811.1.c.1 (Hide is not a subset of Play), 811.1.c.2 (hiding opens no chain), 408.2 (Discretionary
 *        Actions), 383 (the trigger keys on a play event).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DARIUS = "ogn-027-298";
const HIDDEN_BLADE = "ogn-213-298";

const RECRUIT = { cardType: "unit", energyCost: 1, might: 1, name: "Recruit" } as const;

/** P1's turn: exhausted Darius in base, a Blade and two Recruits in hand, bf1 held so a Hide is legal. */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { fury: 3, order: 3, rainbow: 3 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Sentry" }, "holder")
    .unit(P2, "bf2", { might: 2, name: "Wall" }, "wall")
    .unit(P1, "base", DARIUS, "darius", { exhausted: true })
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P1, RECRUIT, "one")
    .hand(P1, RECRUIT, "two");
}

/** Play one real card so the NEXT thing done would be the "second card" of the turn. */
async function afterFirstPlay(): Promise<Game> {
  const game = await board().build();
  expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 });
  await game.p1.play("one");
  await game.settle();
  expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 }); // one card only
  return game;
}

describe("Ruling 93b53e73486fb76d — hiding a card is not playing one, so Darius does not wake up", () => {
  test("hiding after one play does NOT trigger him: still exhausted, still 5 Might, and no chain was opened", async () => {
    const game = await afterFirstPlay();
    await game.p1.hide("blade", "bf1");
    expect(game.zoneOf("blade")).toBe("facedown-bf1");
    expect(game.chain()).toEqual([]); // 811.1.c.2
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 });
  });

  test("playing a real second card afterwards triggers him: ready and 7 Might", async () => {
    const game = await afterFirstPlay();
    await game.p1.hide("blade", "bf1");
    await game.p1.play("two");
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 7 });
  });

  test("without the hide, the same two plays do exactly the same thing — the hide was never a step", async () => {
    const game = await afterFirstPlay();
    await game.p1.play("two");
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 7 });
    expect(game.violations()).toEqual([]);
  });

  test("the +2 is 'this turn': it wears off, and the readying persists", async () => {
    const game = await afterFirstPlay();
    await game.p1.play("two");
    await game.settle();
    await game.advanceTurn();
    expect(game.state("darius").might).toBe(5);
    expect(game.state("darius").isReady).toBe(true);
  });
});
