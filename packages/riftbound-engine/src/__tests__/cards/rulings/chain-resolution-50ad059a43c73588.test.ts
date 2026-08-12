/**
 * Ruling 50ad059a43c73588 — (no specific card) how the chain resolves
 *
 * Q: How does the chain resolve in Riftbound?
 * A: Last in, first out — items resolve in the reverse of the order they were put on the chain.
 * Rules: 336–340 (the Chain is resolved from the newest item; after each item resolves priority is
 *        re-offered), 310.2 (Neutral Closed while a chain exists).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** Both players pass in succession (rule 340.4: priority sits with the newest item's controller) ⇒ the TOP item resolves. */
async function passUntilOneResolves(game: Game): Promise<void> {
  await game.acting().passPriority();
  await game.acting().passPriority();
}

/** [Action] "Give a unit +1 [Might] this turn." — a marker whose effect is visible per item. */
const NUDGE = {
  abilities: [
    { effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "action", type: "spell" },
  ],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Nudge",
  rulesText: "[Action] Give a unit +1 [Might] this turn.",
  timing: "action",
} as const;

/** [Reaction] "Deal 1 to a unit." — playable while the chain is not empty. */
const PRICK = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Prick",
  rulesText: "[Reaction] Deal 1 to a unit.",
  timing: "reaction",
} as const;

describe("Ruling 50ad059a43c73588 — the chain resolves last-in-first-out", () => {
  test("three items placed A → B → C resolve C, then B, then A", async () => {
    const game = await scenario()
      .unit(P1, "base", { might: 9, name: "Dummy" }, "dummy")
      .hand(P1, NUDGE, "a")
      .hand(P2, PRICK, "b")
      .hand(P1, PRICK, "c")
      .build();

    await game.p1.cast("a", { targets: "dummy" }); // bottom of the chain
    await game.p1.passPriority();
    await game.p2.cast("b", { targets: "dummy" });
    await game.p2.passPriority();
    await game.p1.cast("c", { targets: "dummy" }); // top of the chain
    expect(game.chain().map((i) => i.cardId)).toEqual(["a", "b", "c"]); // listed bottom → top

    // Everybody passes: only the NEWEST item (c) resolves.
    await passUntilOneResolves(game);
    expect(game.zoneOf("c")).toBe("trash");
    expect(game.zoneOf("b")).toBe("chain");
    expect(game.zoneOf("a")).toBe("chain");
    expect(game.state("dummy").damage).toBe(1);
    expect(game.state("dummy").might).toBe(9); // a (the +1) has NOT resolved

    // Next: b, the item placed second.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // b's controller acts first
    await passUntilOneResolves(game);
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.state("dummy").damage).toBe(2);
    expect(game.state("dummy").might).toBe(9);
    expect(game.chain().map((i) => i.cardId)).toEqual(["a"]);

    // Last: a, the item placed first.
    await passUntilOneResolves(game);
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.state("dummy").might).toBe(10);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("the newest item wins the race: a Reaction played on top of a spell resolves BEFORE it", async () => {
    // P1's Nudge would raise the Dummy to 3 Might; P2's Prick, played later, is dealt first and
    // kills the 2-Might Dummy while it is still a 2-Might unit.
    const game = await scenario()
      .unit(P1, "base", { might: 2, name: "Dummy" }, "dummy")
      .hand(P1, NUDGE, "nudge")
      .hand(P2, PRICK, "p1")
      .hand(P2, PRICK, "p2")
      .build();
    await game.p1.cast("nudge", { targets: "dummy" });
    await game.p1.passPriority();
    await game.p2.cast("p1", { targets: "dummy" });
    await game.p2.cast("p2", { targets: "dummy" }); // P2 keeps priority after adding an item
    expect(game.chain().map((i) => i.cardId)).toEqual(["nudge", "p1", "p2"]);
    await game.settle();
    // p2 then p1 each dealt 1 to a 2-Might unit ⇒ it dies before the +1 ever resolves.
    expect(game.zoneOf("dummy")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
