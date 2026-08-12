/**
 * Ruling 520385c20beaa591 — (no specific card) Action spells throughout a showdown.
 *   Exercised with inline [Action] "Deal 1 to a unit" and [Reaction] "Give a unit +1 [Might] this turn" spells.
 *
 * Q: Can Action spells be cast several times during a showdown, or only once at the start before
 *    any Reaction is played?
 * A: Several times. Each time Focus comes back to you and the chain is empty you may start a new
 *    chain with an Action; having used a Reaction earlier does not lock you out. You just cannot
 *    play two Actions on the SAME chain. The showdown ends when both players pass Focus in order.
 * Rules: 345–347 (Focus starts a chain), 340.4 (Focus rotates when the chain empties), 348.2.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** [Action] "Deal 1 to a unit." */
const JAB = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Jab",
  rulesText: "[Action] Deal 1 to a unit.",
  timing: "action",
} as const;

/** [Reaction] "Give a unit +1 [Might] this turn." */
const BRACE = {
  abilities: [
    {
      effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" },
      timing: "reaction",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "order",
  energyCost: 0,
  name: "Test Brace",
  rulesText: "[Reaction] Give a unit +1 [Might] this turn.",
  timing: "reaction",
} as const;

function focus(game: Game): string | undefined {
  return (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active).at(-1)?.focusPlayer;
}

/** P1's 2-Might Scout attacks P2's 9-Might Wall. P1 holds two Actions + a Reaction; P2 holds one of each. */
async function showdown(): Promise<Game> {
  const game = await scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .hand(P1, JAB, "p1a1")
    .hand(P1, JAB, "p1a2")
    .hand(P1, BRACE, "p1r")
    .hand(P2, JAB, "p2a")
    .hand(P2, BRACE, "p2r")
    .build();
  await game.p1.move("scout", "bf1");
  expect(focus(game)).toBe(P1);
  return game;
}

/** Everyone passes until the chain is empty again. */
async function drainChain(game: Game): Promise<void> {
  while (game.chain().length > 0) {
    await game.acting().passPriority();
  }
}

describe("Ruling 520385c20beaa591 — a player may cast Action spells repeatedly across a showdown", () => {
  test("P1 casts an Action, uses a Reaction on P2's chain, and still casts a SECOND Action when Focus returns", async () => {
    const game = await showdown();
    // Chain 1 — P1's first Action.
    await game.p1.cast("p1a1", { targets: "wall" });
    await drainChain(game);
    expect(game.state("wall").damage).toBe(1);
    // Chain 2 — P2 has Focus and starts it; P1 answers with a Reaction (this must not spend P1's Action rights).
    expect(focus(game)).toBe(P2);
    await game.p2.cast("p2a", { targets: "scout" });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "p1r")).toBe(true);
    await game.p1.cast("p1r", { targets: "scout" });
    await drainChain(game);
    expect(game.state("scout").damage).toBe(1);
    expect(game.state("scout").might).toBe(3);
    // Chain 3 — Focus is P1's again and the second Action is legal.
    expect(focus(game)).toBe(P1);
    expect(game.p1.can("cast", "p1a2")).toBe(true);
    await game.p1.cast("p1a2", { targets: "wall" });
    await drainChain(game);
    expect(game.state("wall").damage).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("two Actions cannot ride the SAME chain — the second is illegal while the first is unresolved", async () => {
    const game = await showdown();
    await game.p1.cast("p1a1", { targets: "wall" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["p1a1"]);
    const second = await game.p1.try((p) => p.cast("p1a2", { targets: "wall" }));
    expect(second.ok).toBe(false);
    await game.p1.passPriority();
    expect(game.p2.can("cast", "p2a")).toBe(false); // P2's Action is barred too while the chain is live
    expect(game.p2.can("cast", "p2r")).toBe(true); // …only Reactions may be added
  });

  test("the showdown only ends once BOTH players pass Focus in succession — a chain in between restarts the count", async () => {
    const game = await showdown();
    await game.p1.passFocus();
    expect(focus(game)).toBe(P2);
    await game.p2.cast("p2a", { targets: "scout" }); // not a Focus pass: the showdown goes on
    await drainChain(game);
    expect(game.gameState.interaction?.showdownStack?.some((s) => s.active)).toBe(true);
    expect(focus(game)).toBe(P1);
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(game.gameState.interaction?.showdownStack?.some((s) => s.active)).toBeFalsy();
    expect(game.zoneOf("scout")).toBe("trash"); // combat resolved: 9 Might beats 2
    expect(game.violations()).toEqual([]);
  });
});
