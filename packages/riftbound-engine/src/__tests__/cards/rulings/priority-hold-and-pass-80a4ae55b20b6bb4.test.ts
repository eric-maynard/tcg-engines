/**
 * Ruling 80a4ae55b20b6bb4 — (no specific card) holding vs. passing Priority after playing a Reaction.
 *   Exercised with inline filler spells: a base-speed "Draw 2" and two [Reaction] "Draw 1"s.
 *
 * Q: After playing a reaction I hold priority — if I pass and my opponent also passes, may I still
 *    add another reaction before the first one resolves?
 * A: No. Two sequential passes resolve the top chain item. You may play any number of reactions
 *    while HOLDING priority (never passing); and after an item resolves priority comes back
 *    (controller of the newest remaining item first), so you may then react to the items still there.
 * Rules: 338.1.a (Execute: play legally-timed cards or pass), 339.1/339.2 (all-pass-in-sequence →
 *    Resolve), 340.1/340.2/340.4 (newest item resolves; controller of the newest gains Priority).
 */
import { describe, expect, test } from "bun:test";
import type { Game, InlineCardDef } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** Base-speed 1-cost spell: "Draw 2." */
const DRAW2: InlineCardDef = {
  abilities: [{ effect: { amount: 2, type: "draw" }, type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Filler Deep Insight",
  rulesText: "Draw 2.",
  timing: "standard",
};

/** [Reaction] 1-cost spell: "Draw 1." */
const reactionDraw = (name: string): InlineCardDef => ({
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  keywords: ["Reaction"],
  name,
  rulesText: "[Reaction] Draw 1.",
  timing: "reaction",
});

/** P1's turn, main phase. P1 holds the base spell and two reactions and has 3 energy. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 3 })
    .hand(P1, DRAW2, "big")
    .hand(P1, reactionDraw("Filler Snap A"), "snapA")
    .hand(P1, reactionDraw("Filler Snap B"), "snapB")
    .hand(P2, reactionDraw("Filler Opp Snap"), "oppSnap");
}

/** P1 casts the base spell, then a reaction on top of it — without ever passing priority. */
async function chainOfTwo(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("big");
  expect(game.actingSeat()).toBe(P1); // playing a card does not pass priority (337.1.a)
  await game.p1.cast("snapA");
  return game;
}

describe("Ruling 80a4ae55b20b6bb4 — passing after a reaction lets it resolve; holding priority lets you stack more", () => {
  test("you may play multiple reactions while HOLDING priority — nothing resolves in between", async () => {
    const game = await chainOfTwo();
    expect(game.chain().map((c) => c.cardId)).toEqual(["big", "snapA"]);
    await game.p1.cast("snapB"); // still P1's priority, still nothing resolved
    expect(game.chain().map((c) => c.cardId)).toEqual(["big", "snapA", "snapB"]);
    expect(game.actingSeat()).toBe(P1);
    expect(game.zoneOf("snapA")).toBe("chain");
    expect(game.zoneOf("snapB")).toBe("chain");
  });

  test("P1 passes, P2 passes ⇒ the TOP item resolves — P1 does not get to insert another reaction first", async () => {
    const game = await chainOfTwo();
    const handBefore = game.p1.hand().length;
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.passPriority();
    // Two sequential passes with nothing added ⇒ Resolve the newest item (339.1 / 340.1).
    expect(game.zoneOf("snapA")).toBe("trash");
    expect(game.p1.hand().length).toBe(handBefore + 1); // Draw 1 resolved
    expect(game.chain().map((c) => c.cardId)).toEqual(["big"]);
  });

  test("after that resolution priority comes back to the controller of the newest remaining item, and the earlier item can still be reacted to", async () => {
    const game = await chainOfTwo();
    await game.p1.passPriority();
    await game.p2.passPriority();
    // 340.4 — "big" is now the newest item and P1 controls it.
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("snapB");
    expect(game.chain().map((c) => c.cardId)).toEqual(["big", "snapB"]);
  });

  test("the opponent may also react in that window, and each pass-pass peels exactly one item", async () => {
    const game = await chainOfTwo();
    await game.p1.passPriority();
    await game.p2.passPriority(); // snapA resolves
    expect(game.chain().map((c) => c.cardId)).toEqual(["big"]);
    await game.p1.passPriority();
    await game.p2.cast("oppSnap"); // P2 reacts to "big" instead of passing
    expect(game.chain().map((c) => c.cardId)).toEqual(["big", "oppSnap"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("oppSnap")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["big"]);
  });

  test("epilogue: draining the chain empties it and returns the game to the open main phase", async () => {
    const game = await chainOfTwo();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.zoneOf("snapA")).toBe("trash");
    expect(game.phase()).toBe("main");
    expect(game.violations()).toEqual([]);
  });
});
