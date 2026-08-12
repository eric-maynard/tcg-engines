/**
 * Ruling 9f2434a4be5d588d — (no specific card) is a showdown one action each, or a loop?
 *   Exercised with vanilla units, an inline [Action] "Give a unit +2 [Might] this turn." and an
 *   inline [Reaction] "Deal 1 to a unit."
 *
 * Q: In showdowns, do you keep passing until nobody has anything left, or is it one action each?
 * A: It is a loop. After each chain empties, Focus passes to the next player, who may play another
 *    Action or Pass; players can trade Actions back and forth as long as they like. The showdown
 *    closes only when every player Passes in sequence on an empty chain. Actions require an EMPTY
 *    chain — with something on it only Reactions are legal — and passing priority during a chain
 *    is not the same as Passing Focus.
 * Rules: 347.2/347.2.a (all players pass in sequence ⇒ the showdown ends), 347.2.b (otherwise
 *        Focus passes on), 346 (Focus moves when the chain empties), 343 (Actions need Focus and
 *        an empty chain; Reactions may be played onto a chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RALLY = {
  abilities: [
    {
      effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Rally",
  rulesText: "[Action] Give a unit +1 [Might] this turn.",
  timing: "action",
} as const;

const STING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Sting",
  rulesText: "[Reaction] Deal 1 to a unit.",
  timing: "reaction",
} as const;

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P1 attacks P2's bf1 (9-Might Wall). Each side holds two Actions and a Reaction. */
const board = () =>
  scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, RALLY, "a1")
    .hand(P1, RALLY, "a2")
    .hand(P1, STING, "r1")
    .hand(P2, RALLY, "b1")
    .hand(P2, RALLY, "b2")
    .hand(P2, STING, "s1");

describe("Ruling 9f2434a4be5d588d — a showdown is a loop, not one action per player", () => {
  test("four Actions in a row (P1, P2, P1, P2) — the showdown is still open the whole time", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    for (const [caster, other, card] of [
      [game.p1, game.p2, "a1"],
      [game.p2, game.p1, "b1"],
      [game.p1, game.p2, "a2"],
      [game.p2, game.p1, "b2"],
    ] as const) {
      expect(showdown(game)?.active).toBe(true);
      await caster.cast(card, { targets: "raider" });
      await caster.passPriority(); // the caster keeps priority after adding (340.1)
      await other.passPriority();
      expect(game.chain()).toEqual([]);
    }
    expect(showdown(game)?.active).toBe(true);
    expect(game.state("raider").might).toBe(8); // 4 + four +1s
  });

  test("Actions need an EMPTY chain — with a chain live only Reactions are legal", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.cast("a1", { targets: "raider" });
    expect(game.chain().length).toBe(1);
    expect(game.p1.can("cast", "a2")).toBe(false); // a second Action cannot be stacked
    expect(game.p1.can("cast", "r1")).toBe(true); // a Reaction can
    await game.p1.passPriority();
    expect(game.p2.can("cast", "b1")).toBe(false);
    expect(game.p2.can("cast", "s1")).toBe(true);
  });

  test("passing PRIORITY inside a chain is not Passing Focus: the pass ledger stays empty", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.cast("a1", { targets: "raider" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P2, passedPlayers: [] });
  });

  test("one player Passing Focus does not close it; the other playing instead of passing resets the sequence", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P2, passedPlayers: [P1] });
    await game.p2.cast("b1", { targets: "wall" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(showdown(game)).toMatchObject({ active: true, passedPlayers: [] });
  });

  test("only both players passing in succession on an empty chain closes the showdown", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(showdown(game)?.active).toBeFalsy();
    expect(game.gameState.battlefields.bf1?.showdownComplete).toBe(true);
    await game.settle();
    expect(game.violations()).toEqual([]);
  });
});
