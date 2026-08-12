/**
 * Ruling 308c569ed731b0ef — (no specific card) what "Open State" means
 *
 * Q: What does "Open State" mean in Riftbound?
 * A: Open State = the chain is empty. [Action] cards need an Open State (plus your turn, or Focus in a
 *    showdown); [Reaction] cards need only priority, so they are legal while a chain exists (Closed State).
 * Rules: 310.1 Neutral Open / 310.2 Neutral Closed / 310.3 Showdown Open / 310.4 Showdown Closed,
 *        310.1.a (default play permission), 813.1.c.1 (Reaction = playable during Closed States on any
 *        player's turn), 347 (Focus is what lets you start a chain inside a showdown).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

/** [Action] "Give a unit +2 [Might] this turn." */
const ACTION_SPELL = {
  abilities: [
    { effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "action", type: "spell" },
  ],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Action",
  rulesText: "[Action] Give a unit +2 [Might] this turn.",
  timing: "action",
} as const;

/** [Reaction] "Deal 1 to a unit." */
const REACTION_SPELL = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Reaction",
  rulesText: "[Reaction] Deal 1 to a unit.",
  timing: "reaction",
} as const;

function board() {
  return scenario()
    .unit(P1, "base", { might: 9, name: "Dummy" }, "dummy")
    .hand(P1, ACTION_SPELL, "a1")
    .hand(P1, ACTION_SPELL, "a2")
    .hand(P1, REACTION_SPELL, "r1")
    .hand(P2, ACTION_SPELL, "a3")
    .hand(P2, REACTION_SPELL, "r2");
}

describe("Ruling 308c569ed731b0ef — Open State = empty chain; Actions need it, Reactions do not", () => {
  test("Neutral Open (my turn, chain empty): I may play both an Action and a Reaction", async () => {
    const game = await board().build();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "a1")).toBe(true);
    expect(game.p1.can("cast", "r1")).toBe(true);
    // …and the opponent may do neither in MY Neutral Open state (310.1.a): they have no priority at all.
    expect(game.p2.can("cast", "a3")).toBe(false);
    expect(game.p2.can("cast", "r2")).toBe(false);
  });

  test("Neutral Closed (a chain exists): Actions are illegal for BOTH players, Reactions stay legal", async () => {
    const game = await board().build();
    await game.p1.cast("a1", { targets: "dummy" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["a1"]);
    // The chain's own controller keeps priority but cannot start another Action.
    expect(game.p1.can("cast", "a2")).toBe(false);
    expect(game.p1.can("cast", "r1")).toBe(true);
    await game.p1.passPriority();
    // The opponent now has priority in the same Closed State: Reaction yes, Action no.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "a3")).toBe(false);
    expect(game.p2.can("cast", "r2")).toBe(true);
    await game.p2.cast("r2", { targets: "dummy" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["a1", "r2"]);
    // Chain emptied ⇒ Open again ⇒ the turn player's Action is legal once more.
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("dummy")).toMatchObject({ damage: 1, might: 11 });
    expect(game.p1.can("cast", "a2")).toBe(true);
  });

  test("Showdown Open vs Showdown Closed: the Action needs Focus AND an empty chain; the Reaction only needs priority", async () => {
    const game = await board()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .build();
    await game.p1.move("scout", "bf1");
    // Showdown Open: attacker holds Focus, chain empty.
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "a1")).toBe(true);
    expect(game.p2.can("cast", "a3")).toBe(false); // no Focus ⇒ no Action…
    await game.p1.cast("a1", { targets: "scout" });
    // Showdown Closed: the defender may answer with a Reaction, never with an Action.
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // Showdown CLOSED
    expect(game.p2.can("cast", "a3")).toBe(false);
    expect(game.p2.can("cast", "r2")).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
