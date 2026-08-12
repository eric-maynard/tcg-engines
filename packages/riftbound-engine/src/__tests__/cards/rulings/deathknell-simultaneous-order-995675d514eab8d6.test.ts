/**
 * Ruling 995675d514eab8d6 — (no specific card) two [Deathknell] units die at once: what order?
 *   Exercised with inline units whose "when I die" abilities are distinguishable (P1's gains XP,
 *   P2's draws) and an inline [Action] "Kill all units at a battlefield."
 *
 * Q: If my unit and an enemy unit die simultaneously and both have Deathknell, what is the order
 *    for the triggers?
 * A: They trigger simultaneously, then go on the Chain starting with the Turn Player and
 *    proceeding in turn order — each player ordering their own. They resolve LIFO, so the LAST
 *    trigger placed (the non-turn player's) resolves FIRST. When one player controls two of them,
 *    that player chooses the order among their own.
 * Rules: 376.3.b.1 / 383.3.c (simultaneous triggers go on the chain in turn order),
 *        383.3.d (a player orders their own simultaneous triggers), 336–340 (LIFO resolution).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

/** "When I die, gain 1 XP." */
const ASH_KEEPER = {
  abilities: [
    { effect: { amount: 1, type: "gain-xp" }, trigger: { event: "die", on: "self" }, type: "triggered" },
  ],
  cardType: "unit",
  might: 3,
  name: "Test Ash Keeper",
  rulesText: "[Deathknell] Gain 1 XP.",
} as const;

/** "When I die, draw 1." */
const LAST_WORD = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "die", on: "self" }, type: "triggered" }],
  cardType: "unit",
  might: 3,
  name: "Test Last Word",
  rulesText: "[Deathknell] Draw 1.",
} as const;

/** [Action] "Kill all units at a battlefield." — one effect, so the deaths are simultaneous. */
const CATACLYSM = {
  abilities: [
    {
      effect: { target: { location: "battlefield", quantity: "all", type: "unit" }, type: "kill" },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Cataclysm",
  rulesText: "[Action] Kill all units at a battlefield.",
  timing: "action",
} as const;

/** P1's turn. bf1 holds one Deathknell unit of each player; P1 holds the sweeper. */
const board = () =>
  scenario()
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", ASH_KEEPER, "mine")
    .unit(P2, "bf1", LAST_WORD, "theirs")
    .hand(P1, CATACLYSM, "cataclysm");

describe("Ruling 995675d514eab8d6 — simultaneous Deathknells: turn player first onto the chain, LIFO out", () => {
  test("one effect kills both: two triggered items sit on the chain, the turn player's placed FIRST", async () => {
    const game = await board().build();
    await game.p1.cast("cataclysm");
    await game.p1.passPriority();
    await game.p2.passPriority(); // the sweeper resolves; both units die at once
    expect(game.zoneOf("mine")).toBe("trash");
    expect(game.zoneOf("theirs")).toBe("trash");
    const chain = game.chain();
    expect(chain.map((i) => i.cardId)).toEqual(["mine", "theirs"]);
    expect(chain.every((i) => i.triggered)).toBe(true);
    expect(chain.map((i) => i.controller)).toEqual([P1, P2]); // turn player at the bottom
  });

  test("LIFO: the non-turn player's Deathknell (placed last) resolves FIRST", async () => {
    const game = await board().build();
    const p2HandBefore = game.p2.hand().length;
    await game.p1.cast("cataclysm");
    await game.p1.passPriority();
    await game.p2.passPriority(); // the sweeper resolves; both Deathknells queue
    expect(game.chain().length).toBe(2);
    // the top item is P2's, so P2 holds priority (340.4); drain exactly one item
    expect(game.decision()).toMatchObject({ context: "chain", seat: P2 });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.p2.hand().length).toBe(p2HandBefore + 1); // P2's "draw 1" went first
    expect(game.p1.xp()).toBe(0); // P1's is still on the chain
    expect(game.chain().map((i) => i.cardId)).toEqual(["mine"]);
    await game.settle();
    expect(game.p1.xp()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("two Deathknells under ONE controller: that player is offered the order among their own", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", ASH_KEEPER, "mine")
      .unit(P1, "bf1", LAST_WORD, "alsoMine")
      .hand(P1, CATACLYSM, "cataclysm")
      .build();
    await game.p1.cast("cataclysm");
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ defaultable: true, kind: "order", seat: P1 });
    expect(d?.kind === "order" ? d.items.length : 0).toBe(2);
    await game.settle();
    expect(game.p1.xp()).toBe(1); // both resolved, whatever the order
    expect(game.violations()).toEqual([]);
  });
});
