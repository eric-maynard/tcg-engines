/**
 * Ruling 9ee7e509bee7c220 — (general priority etiquette / mechanics; no specific card)
 *   Stand-ins: an inline [Action] spell, an inline [Reaction] spell and a gear with an activated ability
 *   (Pack of Wonders, OGN-181 → ogn-181-298 · "[Exhaust]: Return another friendly gear, unit, or facedown card
 *   to its owner's hand.").
 *
 * Q: Must players explicitly pass priority during a chain, or may they assume the opponent passed?
 * A: Passing is an action a player takes; nothing passes on its own. After you put something on the chain you
 *    KEEP priority (so you may chain another card immediately); once your opponent passes, your item resolves
 *    at once. Skipping the passes is only a players' agreement, never the rules default.
 * Rules: 336 (a player with priority acts or passes), 337.4 (the item's controller receives priority after it is
 *        added), 340 (all players passing in succession resolves the top item).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PACK_OF_WONDERS = "ogn-181-298";

const BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  rulesText: "[Action] Deal 2 to a unit.",
  timing: "action",
} as const;

const SHIELD = {
  abilities: [
    { effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "reaction", type: "spell" },
  ],
  cardType: "spell",
  domain: "order",
  energyCost: 1,
  name: "Test Shield",
  rulesText: "[Reaction] Give a unit +2 [Might] this turn.",
  timing: "reaction",
} as const;

/** P1's turn: P1 has a Bolt, a Shield and Pack of Wonders; P2 has a Dummy and a Gold-less board. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { fury: 3, order: 3, chaos: 3 } })
    .unit(P1, "base", { might: 3, name: "Mine" }, "mine")
    .unit(P2, "base", { might: 3, name: "Theirs" }, "theirs")
    .gear(P1, PACK_OF_WONDERS, "pack")
    .hand(P1, BOLT, "bolt")
    .hand(P1, SHIELD, "shield");
}

async function afterCast(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("bolt", { targets: "theirs" });
  return game;
}

describe("Ruling 9ee7e509bee7c220 — priority is passed by an action, never assumed", () => {
  test("after I cast, I still hold priority and nothing has resolved", async () => {
    const game = await afterCast();
    expect(game.actingSeat()).toBe(P1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["bolt"]);
    expect(game.state("theirs").damage).toBe(0);
  });

  test("holding priority means I may chain something of my own instead of passing", async () => {
    const game = await afterCast();
    await game.p1.cast("shield", { targets: "mine" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["bolt", "shield"]);
    expect(game.actingSeat()).toBe(P1);
  });

  test("I pass → the opponent gets priority; the moment they pass too, the top item resolves", async () => {
    const game = await afterCast();
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.state("theirs").damage).toBe(0); // still nothing
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("theirs").damage).toBe(2);
  });

  test("an activated ability behaves the same way: activating it hands me priority back, and it resolves only once both seats pass", async () => {
    const game = await board().build();
    await game.p1.activate("pack", 0, { targets: "mine" });
    expect(game.actingSeat()).toBe(P1); // I hold priority after activating
    expect(game.chain()).toHaveLength(1);
    expect(game.zoneOf("mine")).toBe("base"); // nothing has happened yet
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.passPriority(); // their pass is what resolves it
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("mine")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });
});
