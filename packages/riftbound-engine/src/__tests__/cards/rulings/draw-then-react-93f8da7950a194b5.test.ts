/**
 * Ruling 93f8da7950a194b5 — (no specific card) playing a card you drew off the chain, before the chain finishes.
 *   Stand-ins: inline "Test Rally" ([Action] +1 [Might] this turn) as P2's bottom item, "Test Foresight"
 *   ([Reaction] Draw 1) as P1's answer, and "Test Reflex" ([Reaction] +2 [Might] this turn) sitting on top
 *   of P1's deck as the card that gets drawn.
 *
 * Q: When an item resolves off the chain and draws me a card, can I play that card before the next item
 *    resolves?
 * A: Yes. Resolving an item does not need fresh passes: as soon as it is done, the controller of the NEXT
 *    item on the chain gets priority, and priority then goes round as usual — so the freshly drawn Reaction
 *    is playable before the item below it resolves. Only two consecutive passes resolve the next link.
 * Rules: 340.4 (chain not empty → the controller of the newest item gains priority), 337 (priority round
 *        trips before each resolution), 340.1 (LIFO), 813 (Reaction timing while the chain is live).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RALLY = {
  abilities: [{ effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Rally",
  rulesText: "[Action] Give a unit +1 [Might] this turn.",
  timing: "action",
} as const;

const FORESIGHT = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 0,
  name: "Test Foresight",
  rulesText: "[Reaction] Draw 1.",
  timing: "reaction",
} as const;

const REFLEX = {
  abilities: [{ effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Reflex",
  rulesText: "[Reaction] Give a unit +2 [Might] this turn.",
  timing: "reaction",
} as const;

/** P2's turn. P2 opens a chain; P1 holds only Foresight, with Reflex on top of their deck. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
    .hand(P2, RALLY, "rally")
    .hand(P1, FORESIGHT, "foresight")
    .deck(P1, [REFLEX], ["reflex"]);
}

/** Chain = [rally (P2), foresight (P1)]; both pass so only the Foresight resolves. */
async function afterTheDraw(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("rally", { targets: "foe" });
  await game.p2.passPriority();
  expect(game.p1.hand()).toEqual(["foresight"]);
  await game.p1.cast("foresight");
  expect(game.chain().map((c) => c.cardId)).toEqual(["rally", "foresight"]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

describe("Ruling 93f8da7950a194b5 — a card drawn as the chain resolves can be played before the next item does", () => {
  test("the top item resolved and drew the card; the Rally underneath has NOT resolved, and priority went to its controller", async () => {
    const game = await afterTheDraw();
    expect(game.chain().map((c) => c.cardId)).toEqual(["rally"]);
    expect(game.p1.hand()).toEqual(["reflex"]); // the drawn card
    expect(game.state("foe").might).toBe(2); // the Rally is still waiting
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // 340.4
    expect(game.p1.can("cast", "reflex")).toBe(false); // not P1's priority yet
  });

  test("when priority comes round, the just-drawn Reaction IS playable — it goes on top of the un-resolved Rally", async () => {
    const game = await afterTheDraw();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "reflex")).toBe(true);
    await game.p1.cast("reflex", { targets: "ally" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["rally", "reflex"]);
    expect(game.state("foe").might).toBe(2); // still nothing resolved underneath
  });

  test("it then resolves first, and the Rally underneath resolves last — no extra passes were needed to get here", async () => {
    const game = await afterTheDraw();
    await game.p2.passPriority();
    await game.p1.cast("reflex", { targets: "ally" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("ally").might).toBe(4);
    expect(game.chain().map((c) => c.cardId)).toEqual(["rally"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("foe").might).toBe(3);
    expect(game.zoneOf("reflex")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
