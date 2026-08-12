/**
 * Ruling 9eee9c02bc6992fd — (no specific card) does "when I attack" fire on a move with nobody to fight?
 *   Stand-ins: inline "Test Vanguard" (When I attack, draw 1) and Dune Drake (OGN-131 → ogn-131-298,
 *   "When I attack, give me +2 [Might] this turn if there is a ready enemy unit here") as a printed check.
 *
 * Q: Does "when I attack" trigger if there are no enemy units but I still move into a battlefield?
 * A: No. An Attack trigger needs a Combat, and there is no combat when you walk onto an empty battlefield
 *    or onto one you already control — nobody is designated Attacker there, so the trigger never happens.
 * Rules: 383.4.e (Attack triggers), 464.2.c.3 (the Attacker/Defender designations are stamped when the
 *        showdown becomes a Combat Showdown), 460 / 461 (a Combat needs units of opposing players),
 *        348.2 (a non-combat showdown just establishes control).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ATTACK_DRAW = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "attack", on: "self" }, type: "triggered" }],
  cardType: "unit",
  domain: "body",
  energyCost: 2,
  might: 4,
  name: "Test Vanguard",
  rulesText: "When I attack, draw 1.",
} as const;

const DUNE_DRAKE = "ogn-131-298";

/** bfEmpty is empty + uncontrolled, bfMine is P1's with a body on it, bfEnemy is P2's with a 1-Might Chaff. */
function board() {
  return scenario()
    .battlefield("bfEmpty", { controller: null })
    .battlefield("bfMine", { controller: P1 })
    .battlefield("bfEnemy", { controller: P2 })
    .unit(P1, "bfMine", { might: 1, name: "Anchor" }, "anchor")
    .unit(P2, "bfEnemy", { might: 1, name: "Chaff" }, "chaff")
    .unit(P1, "base", ATTACK_DRAW, "van");
}

async function walkTo(where: string): Promise<Game> {
  const game = await board().build();
  await game.p1.move("van", where);
  return game;
}

describe("Ruling 9eee9c02bc6992fd — 'when I attack' needs a combat, not just a move", () => {
  test("moving onto an EMPTY uncontrolled battlefield: no trigger on the chain, no draw, no Attacker designation", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    const game2 = await walkTo("bfEmpty");
    expect(game2.chain()).toEqual([]);
    expect(game2.state("van").combatRole).toBeNull();
    await game2.settle();
    expect(game2.p1.hand()).toHaveLength(handBefore);
    expect(game2.gameState.battlefields.bfEmpty?.controller).toBe(P1); // it did conquer, without a combat
    expect(game.violations()).toEqual([]);
  });

  test("moving onto a battlefield I already control: same answer — no combat, no trigger, no draw", async () => {
    const game = await walkTo("bfMine");
    const handBefore = game.p1.hand().length;
    expect(game.chain()).toEqual([]);
    expect(game.state("van").combatRole).toBeNull();
    await game.settle();
    expect(game.p1.hand()).toHaveLength(handBefore);
    expect(game.locationOf("van")).toBe("bfMine");
  });

  test("control: walking into an ENEMY-occupied battlefield IS a combat — the trigger goes on the chain and draws", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.move("van", "bfEnemy");
    expect(game.state("van").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "van", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
  });

  test("a printed Attack trigger behaves the same: Dune Drake gets nothing walking onto an empty battlefield", async () => {
    const game = await scenario()
      .battlefield("bfEmpty", { controller: null })
      .unit(P1, "base", DUNE_DRAKE, "drake")
      .build();
    expect(game.state("drake").might).toBe(5);
    await game.p1.move("drake", "bfEmpty");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("drake").might).toBe(5); // no +2, because there was no attack at all
    expect(game.violations()).toEqual([]);
  });
});
