/**
 * Ruling a024a1b02aa7c555 — (no specific card) Focus keeps alternating inside a showdown.
 *   Exercised with inline filler cards: two vanilla units, an [Action] "Draw 1" for each seat and a
 *   [Reaction] "Give a unit +2 [Might] this turn".
 *
 * Q: In a showdown, after P1 plays an Action and P2's Reactions resolve, may P1 act again or do we
 *    go straight to the damage step?
 * A: Neither side is finished. When the chain empties, Focus passes to the other player, who may
 *    play an Action or pass; Focus keeps alternating and only two passes IN SUCCESSION move on to
 *    combat. Actions need Focus with an empty chain — you can never answer a Reaction with an Action.
 * Rules: 313 (Focus), 343.1.a (only Action/Reaction in a Showdown), 346/347.1 (Focus passes when the
 *    opened chain empties), 347.2 (all-pass ends the showdown), 465 (damage step follows).
 */
import { describe, expect, test } from "bun:test";
import type { Game, InlineCardDef } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const actionDraw = (name: string): InlineCardDef => ({
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  keywords: ["Action"],
  name,
  rulesText: "[Action] Draw 1.",
  timing: "action",
});

const REACTION_BUFF: InlineCardDef = {
  abilities: [
    { effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "reaction", type: "spell" },
  ],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  keywords: ["Reaction"],
  name: "Filler Brace",
  rulesText: "[Reaction] Give a unit +2 [Might] this turn.",
  timing: "reaction",
};

function showdownOf(game: Game) {
  const stack = game.gameState.interaction?.showdownStack ?? [];
  return stack.length > 0 ? stack[stack.length - 1] : undefined;
}

/** P2 holds bf1 with a 2-Might defender; P1 attacks with a 5-Might unit. Both hold an Action. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P1, actionDraw("Filler Action P1"), "act1")
    .hand(P1, actionDraw("Filler Action P1b"), "act1b")
    .hand(P2, actionDraw("Filler Action P2"), "act2")
    .hand(P2, REACTION_BUFF, "brace");
}

/** P1 attacks into bf1 — a combat showdown opens with the attacker holding Focus. */
async function attack(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  expect(showdownOf(game)?.focusPlayer).toBe(P1);
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("Ruling a024a1b02aa7c555 — Focus alternates until both players pass in succession", () => {
  test("the attacker holds Focus once the combat showdown opens and may play an Action", async () => {
    const game = await attack();
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.p1.can("cast", "act1")).toBe(true);
    expect(game.p2.can("cast", "act2")).toBe(false); // no Focus, no Priority
  });

  test("while P1's Action is on the chain P2 may only REACT — an Action cannot answer a Reaction", async () => {
    const game = await attack();
    await game.p1.cast("act1");
    expect(game.chain().map((c) => c.cardId)).toEqual(["act1"]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "act2")).toBe(false); // Actions need Focus AND an empty chain
    expect(game.p2.can("cast", "brace")).toBe(true);
    await game.p2.cast("brace", { targets: "guard" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["act1", "brace"]);
  });

  test("when that chain empties Focus passes to P2, who may now play an Action of their own", async () => {
    const game = await attack();
    await game.p1.cast("act1");
    await game.p1.passPriority();
    await game.p2.cast("brace", { targets: "guard" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // brace resolves
    await game.p1.passPriority();
    await game.p2.passPriority(); // act1 resolves; chain empty
    expect(game.chain()).toEqual([]);
    expect(showdownOf(game)).toBeDefined(); // still in the showdown, no damage yet
    expect(showdownOf(game)?.focusPlayer).toBe(P2);
    expect(game.state("guard").might).toBe(4); // 2 + 2 from the Reaction
    expect(game.state("guard").damage).toBe(0);
    expect(game.p2.can("cast", "act2")).toBe(true);
  });

  test("P2 passing Focus hands it BACK to P1, who may act again — one pass never ends the showdown", async () => {
    const game = await attack();
    await game.p1.cast("act1");
    while (game.chain().length > 0) {
      await game.acting().passPriority();
    }
    expect(showdownOf(game)?.focusPlayer).toBe(P2);
    await game.p2.passFocus();
    expect(showdownOf(game)).toBeDefined();
    expect(showdownOf(game)?.focusPlayer).toBe(P1);
    expect(game.p1.can("cast", "act1b")).toBe(true);
  });

  test("only two passes IN SUCCESSION close the showdown and take the combat to its damage step", async () => {
    const game = await attack();
    await game.p1.passFocus();
    expect(showdownOf(game)).toBeDefined();
    await game.p2.passFocus();
    await game.settle();
    expect(showdownOf(game)).toBeUndefined();
    expect(game.zoneOf("guard")).toBe("trash"); // 5 vs 2 — combat damage happened
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
