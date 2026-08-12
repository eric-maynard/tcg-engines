/**
 * Ruling 8600a75030b697db — (no specific card) a showdown does not end just because the battlefield
 *   emptied. Exercised with inline filler cards: two vanilla units, an [Action] "Recall a unit",
 *   a [Reaction] "Recall a unit" and an [Action] "Draw 1".
 *
 * Q: If units are removed from a battlefield during a showdown, does priority keep going and can
 *    players still cast actions with nobody standing there?
 * A: Yes. Priority passes normally so the removal can be reacted to; when both pass, the chain
 *    resolves; Focus then shifts, players may still play Actions, and only when both pass Focus in
 *    succession does the showdown end.
 * Rules: 313 (Focus), 343.1.a (Action/Reaction inside a Showdown), 339.1/340 (chain resolution),
 *    347.2 (all-pass ends it), 466.5.b (no units left ⇒ the battlefield ends up Uncontrolled).
 */
import { describe, expect, test } from "bun:test";
import type { Game, InlineCardDef } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ACTION_RECALL: InlineCardDef = {
  abilities: [{ effect: { target: { type: "unit" }, type: "recall" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  keywords: ["Action"],
  name: "Filler Withdraw",
  rulesText: "[Action] Recall a unit.",
  timing: "action",
};

const REACTION_RECALL: InlineCardDef = {
  ...ACTION_RECALL,
  abilities: [{ effect: { target: { type: "unit" }, type: "recall" }, timing: "reaction", type: "spell" }],
  keywords: ["Reaction"],
  name: "Filler Snap Withdraw",
  rulesText: "[Reaction] Recall a unit.",
  timing: "reaction",
};

const ACTION_DRAW: InlineCardDef = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 0,
  keywords: ["Action"],
  name: "Filler Action Draw",
  rulesText: "[Action] Draw 1.",
  timing: "action",
};

function showdownOf(game: Game) {
  const stack = game.gameState.interaction?.showdownStack ?? [];
  return stack.length > 0 ? stack[stack.length - 1] : undefined;
}

/** P2 holds bf1 with a lone defender; P1 attacks with one unit. Each side can recall a unit. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, ACTION_RECALL, "pull")
    .hand(P2, REACTION_RECALL, "snapPull")
    .hand(P2, ACTION_DRAW, "oppAction")
    .hand(P1, ACTION_DRAW, "myAction");
}

/** P1 attacks; with Focus P1 plays the recall on the defender; P2 answers by recalling the attacker. */
async function bothRecalled(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  expect(showdownOf(game)?.isCombatShowdown).toBe(true);
  await game.p1.cast("pull", { targets: "guard" });
  await game.p1.passPriority();
  // Priority reaches the other player so the removal can be answered (359.3.c).
  expect(game.actingSeat()).toBe(P2);
  await game.p2.cast("snapPull", { targets: "raider" });
  return game;
}

describe("Ruling 8600a75030b697db — the showdown runs on after every unit leaves the battlefield", () => {
  test("both passes resolve the chain and the battlefield is left with no units — the showdown is still open", async () => {
    const game = await bothRecalled();
    await game.p2.passPriority();
    await game.p1.passPriority(); // snapPull resolves — attacker leaves
    expect(game.locationOf("raider")).toBe("base");
    await game.p1.passPriority();
    await game.p2.passPriority(); // pull resolves — defender leaves
    expect(game.locationOf("guard")).toBe("base");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p2.units("bf1")).toEqual([]);
    expect(showdownOf(game)?.battlefieldId).toBe("bf1");
    expect(game.chain()).toEqual([]);
  });

  test("Focus shifts once the chain P1 opened empties, and Actions are still playable with nobody there", async () => {
    const game = await bothRecalled();
    while (game.chain().length > 0) {
      await game.acting().passPriority();
    }
    expect(showdownOf(game)?.focusPlayer).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    const handBefore = game.p2.hand().length;
    await game.p2.cast("oppAction");
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.p2.hand().length).toBe(handBefore - 1 + 1);
    expect(showdownOf(game)).toBeDefined(); // still a showdown, still no units at bf1
    expect(game.p1.units("bf1")).toEqual([]);
  });

  test("the other player may act too — Focus rotates back to P1, who plays an Action at the empty battlefield", async () => {
    const game = await bothRecalled();
    while (game.chain().length > 0) {
      await game.acting().passPriority();
    }
    await game.p2.passFocus();
    expect(showdownOf(game)?.focusPlayer).toBe(P1);
    expect(game.p1.can("cast", "myAction")).toBe(true);
    await game.p1.cast("myAction");
    while (game.chain().length > 0) {
      await game.acting().passPriority();
    }
    expect(showdownOf(game)).toBeDefined();
  });

  test("only two Focus passes in succession end it; with nobody standing there bf1 ends up Uncontrolled", async () => {
    const game = await bothRecalled();
    while (game.chain().length > 0) {
      await game.acting().passPriority();
    }
    await game.p2.passFocus();
    expect(showdownOf(game)).toBeDefined(); // one pass is not enough
    await game.p1.passFocus();
    await game.settle();
    expect(showdownOf(game)).toBeUndefined();
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBe(null); // 466.5.b
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
