/**
 * Ruling 85debd9c107930eb — (no specific card) how Actions and Reactions divide up a showdown.
 *   Stand-ins: inline "Test Rally" ([Action] +1 [Might]) and "Test Reflex" ([Reaction] +2 [Might]) in both hands.
 *
 * Q: How do Actions and Reactions work during a showdown — who may play what, and when?
 * A: An Action needs an empty chain and Focus. The moment anything is on the chain only Reactions may be
 *    played, by whoever holds priority; players pass priority back and forth and each consecutive pair of
 *    passes resolves the top link. When the chain is empty again Focus moves to the other player, who may
 *    then open their own chain with an Action. Both passing Focus on an empty chain closes the showdown.
 * Rules: 309.2 (no chain = Open State), 806.1.b ([Action] plays in showdowns), 813 ([Reaction] plays while
 *        the chain is live), 337 / 340.1 (pass, pass → the newest item resolves), 346 / 347.1.b (chain
 *        empties → Focus passes), 348 (all pass Focus → the showdown closes).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ACTION_SPELL = {
  abilities: [{ effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Rally",
  rulesText: "[Action] Give a unit +1 [Might] this turn.",
  timing: "action",
} as const;

const REACTION_SPELL = {
  abilities: [{ effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Reflex",
  rulesText: "[Reaction] Give a unit +2 [Might] this turn.",
  timing: "reaction",
} as const;

/** P1's turn; P2 holds bf1 with a 9-Might Guard so nobody dies and the showdown can be studied in peace. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 1, name: "Raider" }, "raider")
    .hand(P1, ACTION_SPELL, "act1")
    .hand(P1, REACTION_SPELL, "react1")
    .hand(P2, ACTION_SPELL, "act2")
    .hand(P2, REACTION_SPELL, "react2");
}

function showdown(game: Game) {
  return (game.gameState.interaction?.showdownStack ?? []).at(-1);
}

async function open(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P1 });
  return game;
}

describe("Ruling 85debd9c107930eb — Actions need an empty chain; once a chain exists only Reactions may be played", () => {
  test("with the chain empty the Focus holder may play EITHER speed", async () => {
    const game = await open();
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("cast", "act1")).toBe(true);
    expect(game.p1.can("cast", "react1")).toBe(true);
  });

  test("as soon as an item is on the chain both players are down to Reactions — an Action is refused even with the energy for it", async () => {
    const game = await open();
    await game.p1.cast("act1", { targets: "raider" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["act1"]);
    // the caster keeps priority first, and even they may only add a Reaction now
    expect(game.p1.can("cast", "react1")).toBe(true);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "react2")).toBe(true);
    expect(game.p2.can("cast", "act2")).toBe(false);
    expect((await game.p2.try((p) => p.cast("act2", { targets: "guard" }))).ok).toBe(false);
  });

  test("passing priority in sequence resolves the top link only, and priority comes back for the next one", async () => {
    const game = await open();
    await game.p1.cast("act1", { targets: "raider" });
    await game.p1.passPriority();
    await game.p2.cast("react2", { targets: "guard" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["act1", "react2"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain().map((c) => c.cardId)).toEqual(["act1"]); // only the newest link resolved
    expect(game.state("guard").might).toBe(11);
    expect(game.state("raider").might).toBe(1); // the Action underneath has not resolved yet
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("raider").might).toBe(2);
  });

  test("with the chain empty again Focus has moved to the other player, who may now open a chain with an ACTION", async () => {
    const game = await open();
    await game.p1.cast("act1", { targets: "raider" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toMatchObject({ focusPlayer: P2 });
    expect(game.p2.can("cast", "act2")).toBe(true);
  });

  test("both players passing Focus on an empty chain closes the showdown", async () => {
    const game = await open();
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(showdown(game)?.active).toBeFalsy();
    expect(game.decision()).toMatchObject({ context: "main", seat: P1 });
    expect(game.zoneOf("raider")).toBe("trash"); // 1 Might walked into a 9-Might Guard
    expect(game.violations()).toEqual([]);
  });
});
