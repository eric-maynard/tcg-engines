/**
 * Ruling 8a33a83910d4a269 — (no specific card) the Chain resolves ONE item at a time, like a stack.
 *   Exercised with inline filler spells: a base-speed "Draw 2" and three [Reaction] "Draw 1"s.
 *
 * Q: Once both players pass, does the whole chain resolve, or can you respond after each item?
 * A: One item at a time — after an item fully resolves you may add a new reaction to what is left.
 *    Unlike MTG, priority after a resolution goes to the CONTROLLER OF THE NEXT ITEM first, not to
 *    the turn player. (The alternating Focus of a showdown is about STARTING chains, not adding to one.)
 * Rules: 340.1 (newest item resolves), 340.2 (empty ⇒ Open State), 340.4 (controller of the newest
 *    remaining item gains Priority), 339.1 (pass-pass-in-sequence resolves), 347 (Focus).
 */
import { describe, expect, test } from "bun:test";
import type { Game, InlineCardDef } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DRAW2: InlineCardDef = {
  abilities: [{ effect: { amount: 2, type: "draw" }, type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Filler Deep Insight",
  rulesText: "Draw 2.",
  timing: "standard",
};

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

function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .resources(P2, { energy: 4 })
    .hand(P1, DRAW2, "a")
    .hand(P1, reactionDraw("Filler Snap C"), "c")
    .hand(P1, reactionDraw("Filler Snap D"), "d")
    .hand(P2, reactionDraw("Filler Opp Snap B"), "b");
}

/** Build the chain a (P1) → b (P2) → c (P1); nothing has resolved yet. */
async function abc(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("a");
  await game.p1.passPriority();
  await game.p2.cast("b");
  await game.p2.passPriority();
  await game.p1.cast("c");
  expect(game.chain().map((x) => x.cardId)).toEqual(["a", "b", "c"]);
  return game;
}

/** One pass each, in sequence. */
async function passPass(game: Game): Promise<void> {
  await game.acting().passPriority();
  await game.acting().passPriority();
}

describe("Ruling 8a33a83910d4a269 — a→b→c: only c resolves, then the chain can be added to again", () => {
  test("both players passing resolves ONLY the top item; a and b stay on the chain", async () => {
    const game = await abc();
    await passPass(game);
    expect(game.zoneOf("c")).toBe("trash");
    expect(game.chain().map((x) => x.cardId)).toEqual(["a", "b"]);
    expect(game.zoneOf("a")).toBe("chain");
    expect(game.zoneOf("b")).toBe("chain");
  });

  test("priority after that resolution goes to the CONTROLLER OF THE NEXT ITEM (P2), not to the turn player (P1)", async () => {
    const game = await abc();
    expect(game.turnPlayer()).toBe(P1);
    await passPass(game);
    expect(game.chain()[1]).toMatchObject({ cardId: "b", controller: P2 });
    expect(game.actingSeat()).toBe(P2); // 340.4 — not the turn player
  });

  test("a NEW reaction may be added to the chain after an item resolved", async () => {
    const game = await abc();
    await passPass(game); // c resolves
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("d");
    expect(game.chain().map((x) => x.cardId)).toEqual(["a", "b", "d"]);
    // …and the freshly added item is the one that resolves next.
    await passPass(game);
    expect(game.zoneOf("d")).toBe("trash");
    expect(game.chain().map((x) => x.cardId)).toEqual(["a", "b"]);
  });

  test("draining the rest peels b then a, each on its own pass-pass", async () => {
    const game = await abc();
    await passPass(game); // c
    await passPass(game); // b
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.chain().map((x) => x.cardId)).toEqual(["a"]);
    await passPass(game); // a
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.phase()).toBe("main"); // 340.2 — empty chain ⇒ Open State
    expect(game.violations()).toEqual([]);
  });
});
