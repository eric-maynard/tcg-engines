/**
 * Ruling 03125bd4392886db — The Dreaming Tree (OGN-292 → ogn-292-298) · Battlefield
 *   "When a player chooses a friendly unit here with a spell for the first time each turn, they draw 1."
 *
 * Q: Can the Tree "go off" on my turn AND on my opponent's turn, or once per turn cycle?
 * A: Once per turn (per player) — "each turn" means each player's turn; there is no turn-cycle / half-turn notion. So it
 *    draws for you on your turn and again on your opponent's turn (the first time you choose a friendly unit there).
 * Rules: 383.3.e ("first time each turn"), 103 (a turn is one player's turn).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DREAMING_TREE = "ogn-292-298";

/** [Reaction] "Give a unit +1 [Might] this turn." — a cheap targeted spell playable on either turn. */
const NUDGE = {
  abilities: [
    { effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "reaction", type: "spell" },
  ],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  name: "Test Nudge",
  rulesText: "[Reaction] Give a unit +1 [Might] this turn.",
  timing: "reaction",
} as const;

/**
 * P1's turn 2. bf1 = The Dreaming Tree (live text), held by P1's Dreamer. P1 holds three Nudges; P2 holds two and has a
 * unit in its base (not at the Tree) so P2 can open chains on its own turn.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1, def: DREAMING_TREE, inert: false })
    .unit(P1, "bf1", { might: 2, name: "Dreamer" }, "dreamer")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "p2u")
    .hand(P1, NUDGE, "n1")
    .hand(P1, NUDGE, "n2")
    .hand(P1, NUDGE, "n3")
    .hand(P2, NUDGE, "p2n")
    .hand(P2, NUDGE, "p2n2");
}

describe("Ruling 03125bd4392886db — The Dreaming Tree draws once per PLAYER TURN, so on your turn and again on the opponent's", () => {
  test("P1's turn: the first spell choosing P1's unit at the Tree draws P1 a card; a second one the same turn does not", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length; // 3
    await game.p1.cast("n1", { targets: "dreamer" });
    await game.settle();
    expect(game.state("dreamer").might).toBe(3);
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1); // n1 gone, drew 1
    await game.p1.cast("n2", { targets: "dreamer" });
    await game.settle();
    expect(game.state("dreamer").might).toBe(4);
    expect(game.p1.hand()).toHaveLength(hand0 - 2 + 1); // no second draw this turn
  });

  test("then on P2's turn (a NEW turn) P1 chooses the Dreamer with a Reaction and draws AGAIN — and again only the first time that turn", async () => {
    const game = await board().build();
    await game.p1.cast("n1", { targets: "dreamer" });
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("dreamer").might).toBe(2); // last turn's +1 lapsed
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    // P2 (turn player) casts a spell on its own unit in base (NOT at the Tree) — that hands P1 priority to react.
    await game.p2.cast("p2n", { targets: "p2u" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "n2")).toBe(true);
    await game.p1.cast("n2", { targets: "dreamer" });
    await game.settle();
    expect(game.state("dreamer").might).toBe(3);
    expect(game.p1.hand()).toHaveLength(p1Hand - 1 + 1); // drew again, on the opponent's turn
    expect(game.p2.hand()).toHaveLength(p2Hand - 1); // P2's choice was not "here": no draw for P2
    // Second time this (P2's) turn: no draw.
    await game.p2.cast("p2n2", { targets: "p2u" });
    await game.p2.passPriority();
    await game.p1.cast("n3", { targets: "dreamer" });
    await game.settle();
    expect(game.state("dreamer").might).toBe(4);
    expect(game.p1.hand()).toHaveLength(p1Hand - 2 + 1);
    expect(game.violations()).toEqual([]);
  });
});
