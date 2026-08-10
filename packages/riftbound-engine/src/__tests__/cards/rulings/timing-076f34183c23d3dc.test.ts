/**
 * Ruling 076f34183c23d3dc — (general chain/showdown timing; no specific card)
 *   Stand-ins: Primal Strength (ogn-154-298) · [Action] [4][body] "Give a unit +7 [Might] this turn." and Discipline
 *   (ogn-058-298) · [Reaction] [2] "Give a unit +2 [Might] this turn. Draw 1."
 *
 * Q: In a showdown, can I play a Reaction right after my own Action spell, or must my opponent react first? Can Action
 *    spells be used as reactions once a chain has started?
 * A: You keep priority after adding your Action and may put your own Reaction on top before passing; only after you pass
 *    can the opponent respond. Action spells only START a chain — never a response, for either player. After the chain
 *    resolves, the opponent gets Focus (may play an Action or Reaction) before you can act again. Reactions may also be
 *    played "like actions" onto an empty chain.
 * Rules: 332 (the player who adds an item receives priority), 336/341 (Closed State: Reactions only), 812/813 (Action /
 *        Reaction timing), 347.1.b (when the chain closes, Focus passes to the next player), 340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PRIMAL_STRENGTH = "ogn-154-298";
const DISCIPLINE = "ogn-058-298";

/**
 * P1's turn with [6][body] (Primal Strength 4+body, Discipline 2). P1's Scout (2) attacks P2's Guard (5) at bf1.
 * P2 holds its own Primal Strength + Discipline with [6][body].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { body: 1 } })
    .resources(P2, { energy: 6, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .hand(P1, PRIMAL_STRENGTH, "myAction")
    .hand(P1, DISCIPLINE, "myReaction")
    .hand(P2, PRIMAL_STRENGTH, "oppAction")
    .hand(P2, DISCIPLINE, "oppReaction");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

async function attackAndOpenWithAction(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("scout", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, isCombatShowdown: true });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // P1 holds Focus
  await game.p1.cast("myAction", { targets: "scout" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "myAction", controller: P1 })]);
  return game;
}

describe("Ruling 076f34183c23d3dc — hold priority to react to your own Action; Actions never respond; Focus passes after the chain", () => {
  test("after playing my Action I STILL hold priority (the opponent has not been asked yet) and may put my own Reaction on top: chain = [Primal Strength, Discipline]", async () => {
    const game = await attackAndOpenWithAction();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "myReaction")).toBe(true);
    await game.p1.cast("myReaction", { targets: "scout" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["myAction", "myReaction"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    // only now, when I pass, does the opponent get to respond
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "oppReaction")).toBe(true);
  });

  test("Action spells cannot be used as reactions once a chain exists — not by the opponent in response, and not a second Action by me either", async () => {
    const game = await attackAndOpenWithAction();
    expect(game.p1.can("cast", "myReaction")).toBe(true);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "oppAction")).toBe(false);
    expect((await game.p2.try((p) => p.cast("oppAction", { targets: "guard" }))).ok).toBe(false);
    expect(game.p2.can("cast", "oppReaction")).toBe(true);
    // and with a chain open, a P1 Action would be illegal too (checked from a fresh board where P1 kept a second Action)
    const again = await board().hand(P1, PRIMAL_STRENGTH, "secondAction").resources(P1, { energy: 11, power: { body: 2 } }).build();
    await again.p1.move("scout", "bf1");
    await again.p1.cast("myAction", { targets: "scout" });
    expect(again.p1.can("cast", "secondAction")).toBe(false);
    expect(again.p1.can("cast", "myReaction")).toBe(true);
  });

  test("LIFO + Focus: my Reaction resolves before my Action (Scout 2 → 4 → 11); when the chain closes Focus passes to the OPPONENT, who may now play an Action (or Reaction) before I can act again", async () => {
    const game = await attackAndOpenWithAction();
    await game.p1.cast("myReaction", { targets: "scout" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Discipline resolves
    expect(game.state("scout").might).toBe(4);
    expect(game.chain().map((c) => c.cardId)).toEqual(["myAction"]);
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.state("scout").might).toBe(11);
    expect(showdown(game)).toMatchObject({ active: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 }); // 347.1.b
    expect(game.p2.can("cast", "oppAction")).toBe(true); // empty chain + Focus: an Action is fine now
    expect(game.p2.can("cast", "oppReaction")).toBe(true);
    expect(game.p1.can("cast", "myReaction")).toBe(false); // not my window
  });

  test("nuance: a Reaction can also be played 'like an action' onto an EMPTY chain — the Focus holder may open with Discipline", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("cast", "myReaction")).toBe(true);
    await game.p1.cast("myReaction", { targets: "scout" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "myReaction", controller: P1 })]);
    await game.settle();
    expect(game.violations()).toEqual([]);
  });
});
