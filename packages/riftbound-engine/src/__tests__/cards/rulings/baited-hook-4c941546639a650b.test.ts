/**
 * Ruling 4c941546639a650b — Baited Hook (OGN-242 → ogn-242-298)
 *   "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may
 *    banish a unit from among them that has Might up to 1 more than the killed unit and play it,
 *    ignoring its cost. Then recycle the rest."
 *   × Gust (ogn-169-298) "[Reaction] Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: What if the targeted friendly unit is removed before Baited Hook's ability resolves?
 * A: The unit is no longer a legal target, so it is not killed. Its Might reads as null, so "Might up to
 *    1 more than the killed unit" can never be satisfied — you still look at the top 5 but may not
 *    banish/play any of them (not even a 0-Might unit). "Then recycle the rest" still happens: all
 *    five looked-at cards are recycled.
 * Rules: 359.3.e.2, 359.3.e.5, 359.3.e.12 (null information ⇒ comparisons fail).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const GUST = "ogn-169-298";
const SKULKER = "ogn-175-298"; // vanilla 3-Might unit
const THREE = { cardType: "unit", energyCost: 3, might: 3, name: "Three" };
const ONE = { cardType: "unit", energyCost: 1, might: 1, name: "One" };
const ZERO = { cardType: "unit", energyCost: 1, might: 0, name: "Zero" };

const LOOKED_AT = ["three", "one", "sk1", "zero", "sk2"];

/**
 * P1's turn. Baited Hook in base with exactly [1][order]; P1's ONLY friendly unit is the 2-Might Bait at
 * bf1 (so Gust can reach it). P1's deck, top first: Three(3), One(1), Skulker(3), Zero(0), Skulker(3),
 * then "sixth". P2 holds Gust with [1].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "bf1", { might: 2, name: "Bait" }, "bait")
    .deck(P1, [THREE, ONE, SKULKER, ZERO, SKULKER, SKULKER], [...LOOKED_AT, "sixth"])
    .hand(P2, GUST, "gust");
}

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1 activates the Hook; P2 responds with Gust on the Bait; Gust resolves first (LIFO). */
async function hookThenGust(game: Game): Promise<void> {
  await game.p1.activate("hook");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  expect(game.state("hook").isExhausted).toBe(true);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hook", controller: P1 })]);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  expect(game.p2.can("cast", "gust")).toBe(true);
  await game.p2.cast("gust", { targets: "bait" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["hook", "gust"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Gust resolves
  expect(game.zoneOf("bait")).toBe("hand");
  expect(game.chain().map((c) => c.cardId)).toEqual(["hook"]);
}

describe("Ruling 4c941546639a650b — Baited Hook whose friendly unit was bounced in response", () => {
  test("Gust returns the Bait to P1's hand while the Hook's ability is still on the chain", async () => {
    const game = await board().build();
    await hookThenGust(game);
    expect(game.p1.hand()).toEqual(["bait"]);
    expect(game.zoneOf("gust")).toBe("trash");
  });

  test("on resolution the bounced Bait is an illegal target: it is NOT killed (stays in hand, never hits the trash) (359.3.e.2/.5)", async () => {
    const game = await board().build();
    await hookThenGust(game);
    await game.settle({ policy: "first" }); // take whatever the engine forces so the ability finishes
    expect(game.zoneOf("bait")).toBe("hand");
    expect(game.p1.trash()).not.toContain("bait");
    expect(game.chain()).toEqual([]);
  });

  // Expected: killed-unit Might is null → NO unit among the top 5 may be banished/played (not Three, not
  // One, not even the 0-Might Zero); at most an empty/declinable prompt. All five looked-at cards are
  // recycled to the bottom, "sixth" becomes the top card, nothing is banished, nothing enters the board,
  // and P1's hand is just the bounced Bait.
  // Actual: the engine shows a MANDATORY "pick a revealed card to draw" over all five cards and puts the
  // pick into P1's hand.
  test.failing("BUG: ruling 4c941546639a650b — engine forces a pick-to-draw from the top 5; expected: null Might ⇒ no unit may be chosen, all 5 recycled (359.3.e.12)", async () => {
    const game = await board().build();
    await hookThenGust(game);
    const stop = await game.settle();
    if (stop.reason === "unanswered") {
      // If the engine surfaces the look-at-5 step at all, it must be skippable and offer no unit.
      const d = game.decision();
      expect(d).toMatchObject({ kind: "pick", seat: P1, allowDecline: true });
      const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
      for (const c of LOOKED_AT) {
        expect(offered).not.toContain(c);
      }
      await game.p1.decline();
      await game.settle();
    }
    expect(game.chain()).toEqual([]);
    // Nothing banished, nothing played, nothing drawn.
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.units()).toEqual([]);
    expect(game.p1.hand()).toEqual(["bait"]);
    // "Then recycle the rest": all five looked-at cards went to the bottom; "sixth" is now on top.
    const deck = game.p1.deck();
    expect(deck[0]).toBe("sixth");
    expect(deck.slice(-5).sort()).toEqual([...LOOKED_AT].sort());
  });
});
