/**
 * Ruling 3b17386d9ad31cde — (no specific card) how many chains a showdown contains.
 *   Exercised with inline [Action] "Give a unit +2 [Might] this turn" and [Reaction] "Deal 1 to a unit" spells.
 *
 * Q: In a showdown, are all Actions/Reactions played first and then everything resolves, or can an
 *    Action be played, resolve, and then more Actions be played?
 * A: A showdown is made of SEVERAL chains. An Action can only be started when nothing is waiting to
 *    resolve; players add Reactions while they hold priority, the chain resolves item by item, and
 *    only when it is empty does Focus pass so the next player may start a NEW chain. The showdown
 *    ends when both players pass Focus in succession without starting a chain.
 * Rules: 336–340 (chain, LIFO, priority after each item), 345–347 (Focus starts a chain), 348.2.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** [Action] "Give a unit +2 [Might] this turn." */
const RALLY = {
  abilities: [
    {
      effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Rally",
  rulesText: "[Action] Give a unit +2 [Might] this turn.",
  timing: "action",
} as const;

/** [Reaction] "Deal 1 to a unit." */
const STING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Sting",
  rulesText: "[Reaction] Deal 1 to a unit.",
  timing: "reaction",
} as const;

function focus(game: Game): string | undefined {
  return (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active).at(-1)?.focusPlayer;
}

/** P1 attacks P2's 9-Might Wall at bf1 with a 2-Might Scout; both hold an Action and a Reaction. */
async function showdown(): Promise<Game> {
  const game = await scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .hand(P1, RALLY, "p1act")
    .hand(P1, STING, "p1rea")
    .hand(P2, RALLY, "p2act")
    .hand(P2, STING, "p2rea")
    .build();
  await game.p1.move("scout", "bf1");
  expect(game.chain()).toEqual([]); // no attack/defend triggers on this board
  expect(focus(game)).toBe(P1); // the attacker holds Focus first
  return game;
}

describe("Ruling 3b17386d9ad31cde — a showdown is a sequence of separate chains, each fully resolved before the next", () => {
  test("an Action starts a chain; Reactions stack on it; the chain resolves LIFO with priority between items — nobody may start a second Action inside it", async () => {
    const game = await showdown();
    await game.p1.cast("p1act", { targets: "scout" }); // chain 1 opens
    expect(game.chain().map((i) => i.cardId)).toEqual(["p1act"]);
    // Nothing has resolved yet: the Action's effect is not applied while it sits on the chain.
    expect(game.state("scout").might).toBe(2);
    // The state is Closed — P2 may only ADD to the chain (Reaction), not start a new Action chain.
    await game.p1.passPriority();
    expect(game.p2.can("cast", "p2act")).toBe(false);
    expect(game.p2.can("cast", "p2rea")).toBe(true);
    await game.p2.cast("p2rea", { targets: "scout" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["p1act", "p2rea"]);
    // Both pass → the TOP item resolves, and only it; priority is offered again (340.4).
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.state("scout").damage).toBe(1);
    expect(game.chain().map((i) => i.cardId)).toEqual(["p1act"]);
    expect(game.state("scout").might).toBe(2); // the Action still has not resolved
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    // Both pass again → the Action resolves and chain 1 is over.
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("scout").might).toBe(4);
  });

  test("when the chain empties Focus passes: the DEFENDER may now start chain 2 with their own Action, and the attacker may not", async () => {
    const game = await showdown();
    await game.p1.cast("p1act", { targets: "scout" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(focus(game)).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.can("cast", "p1rea")).toBe(false); // no priority: the chain is empty and Focus is P2's
    await game.p2.cast("p2act", { targets: "wall" }); // chain 2
    expect(game.chain().map((i) => i.cardId)).toEqual(["p2act"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("wall").might).toBe(11);
    expect(focus(game)).toBe(P1); // …and Focus comes back for a possible chain 3
  });

  test("the showdown ends only when both players pass Focus in succession without starting a chain", async () => {
    const game = await showdown();
    await game.p1.passFocus();
    expect(game.gameState.interaction?.showdownStack?.some((s) => s.active)).toBe(true); // one pass is not enough
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    await game.settle();
    // Both passed → combat resolves: the 9-Might Wall kills the 2-Might Scout and P2 keeps bf1.
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
