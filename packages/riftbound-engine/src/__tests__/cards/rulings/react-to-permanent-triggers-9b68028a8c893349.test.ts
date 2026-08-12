/**
 * Ruling 9b68028a8c893349 — (no specific card) reacting to a permanent's triggered ability.
 *
 * Q: Can a Reaction answer a triggered ability that a permanent (e.g. a unit) put on the chain, or does
 *    the "no priority before it resolves" rule for played cards block that too?
 * A: You can react to it. The no-window rule is about the CARD itself being played onto the chain (a
 *    permanent is Pending, then Finalized straight off the chain). A triggered ability of a permanent
 *    is an ordinary Finalized chain item: players get priority, may add reactions, and after each item
 *    resolves they get another window (starting with the controller of the next item) until everyone
 *    passes on an empty chain.
 *    (The ruling cites a "rule 538"; the current Comprehensive Rules number these 337/340 — see refs.)
 * Rules: 337.1 / 337.1.a (playing/finalizing passes no Priority), 337.4 (the controller of the newest
 *        item gets Priority), 340.1 (LIFO resolution), 342 (a chain closes only when it is empty).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

/** "When you play me, draw 1." — a permanent's triggered ability. */
const SCRYER = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "play-self" }, type: "triggered" }],
  cardType: "unit",
  domain: "fury",
  energyCost: 1,
  might: 3,
  name: "Test Scryer",
  rulesText: "When you play me, draw 1.",
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

function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { fury: 2 } })
    .resources(P2, { energy: 4 })
    .unit(P1, "base", { might: 5, name: "Ally" }, "ally")
    .hand(P1, SCRYER, "scryer")
    .hand(P2, STING, "sting1")
    .hand(P2, STING, "sting2");
}

describe("Ruling 9b68028a8c893349 — a permanent's triggered ability is answerable; the permanent's play is not", () => {
  test("the trigger is a normal finalized chain item and P2 may add a Reaction on top of it", async () => {
    const game = await board().build();
    await game.p1.play("scryer");
    expect(game.zoneOf("scryer")).toBe("base"); // the unit itself never lingered
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "scryer", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    expect(game.p2.can("cast", "sting1")).toBe(true);
    await game.p2.cast("sting1", { targets: "ally" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["scryer", "sting1"]);
    expect(game.violations()).toEqual([]);
  });

  test("after the top item resolves, players get ANOTHER window while the chain still has items", async () => {
    const game = await board().build();
    await game.p1.play("scryer");
    await game.p1.passPriority();
    await game.p2.cast("sting1", { targets: "ally" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // sting1 resolves
    expect(game.state("ally").damage).toBe(1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["scryer"]); // the trigger is still pending
    // 337.4 — the new window opens with the controller of the NEXT item on the chain (P1),
    // exactly as the ruling describes ("starting with the owner of the next item").
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p2.can("cast", "sting2")).toBe(false);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "sting2")).toBe(true);
    await game.p2.cast("sting2", { targets: "ally" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["scryer", "sting2"]);
    expect(game.violations()).toEqual([]);
  });

  test("when everything has resolved the chain is empty and nothing more can be added to it", async () => {
    const game = await board().build();
    const before = game.p1.hand().length;
    await game.p1.play("scryer");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand().length).toBe(before); // -1 Scryer, +1 drawn
    expect(game.p2.can("cast", "sting1")).toBe(false); // back to P1's Open State
    expect(game.violations()).toEqual([]);
  });
});
