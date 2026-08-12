/**
 * Ruling 8bc19c17207ef36d — (no specific card) can I react to an opponent playing a unit to base?
 *   Exercised with inline "Test Grunt" (vanilla), "Test Scryer" ("When you play me, draw 1.")
 *   and a [Reaction] "Deal 1 to a unit."
 *
 * Q: Can I react to someone playing a unit from hand to their base?
 * A: No. A unit is put on the chain as a Pending item and removed the moment it Finalizes, so it
 *    resolves immediately and no player ever gains priority in response to the play. If the unit
 *    has a "when you play me" trigger, THAT goes on the chain after the unit has entered and can
 *    be reacted to — but by then the unit is already on the board and cannot be undone.
 * Rules: 359.3 vs 333.1.c / 376.4.a (spells linger, permanents do not), 336–340 (priority is only
 *        offered while something is on the chain), 383 (play triggers are ordinary chain items).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GRUNT = { cardType: "unit", domain: "fury", energyCost: 1, might: 3, name: "Test Grunt" } as const;

const SCRYER = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "play-self" }, type: "triggered" }],
  cardType: "unit",
  domain: "mind",
  energyCost: 1,
  might: 3,
  name: "Test Scryer",
  rulesText: "When you play me, draw 1.",
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

/** It is P2's turn: P2 is the one playing the unit, P1 is the player who would like to react. */
const board = () =>
  scenario()
    .active(P2)
    .resources(P2, { energy: 4, power: { fury: 2, mind: 2 } })
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .unit(P1, "base", { might: 4, name: "Watcher" }, "watcher")
    .hand(P1, STING, "sting");

describe("Ruling 8bc19c17207ef36d — you cannot react to an opponent playing a unit to their base", () => {
  test("before the play, the would-be reactor has no window either (it is not their turn and the chain is empty)", async () => {
    const game = await board().hand(P2, GRUNT, "grunt").build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.can("cast", "sting")).toBe(false);
  });

  test("the unit is simply there afterwards: nothing on the chain and no priority for the opponent", async () => {
    const game = await board().hand(P2, GRUNT, "grunt").build();
    await game.p2.play("grunt");
    expect(game.zoneOf("grunt")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.can("cast", "sting")).toBe(false);
    const denied = await game.p1.try((p) => p.cast("sting", { targets: "grunt" }));
    expect(denied.ok).toBe(false);
    expect(game.zoneOf("sting")).toBe("hand");
    expect(game.state("grunt").damage).toBe(0);
  });

  test("with a 'when you play me' trigger, the opponent DOES get a window — but on the trigger, after the unit entered", async () => {
    const game = await board().hand(P2, SCRYER, "scryer").build();
    await game.p2.play("scryer");
    expect(game.zoneOf("scryer")).toBe("base"); // already on the board
    expect(game.chain().map((i) => i.cardId)).toEqual(["scryer"]);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "sting")).toBe(true);
    await game.p1.cast("sting", { targets: "scryer" });
    await game.settle();
    expect(game.state("scryer").damage).toBe(1);
    expect(game.zoneOf("scryer")).toBe("base"); // the reaction never undid the play
    expect(game.violations()).toEqual([]);
  });
});
