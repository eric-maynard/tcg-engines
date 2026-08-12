/**
 * Ruling 99e765cf1817138a — (no specific card) does damage heal after a NON-combat showdown?
 *   Plain inline units; damage is pre-seeded so the heal (or its absence) is unambiguous.
 *
 * Q: Does damage heal after a non-combat showdown?
 * A: No. Healing belongs to the Combat Cleanup and to the end of the turn. A showdown only counts as a
 *    combat when the battlefield is Contested and occupied by units of two different players; anything
 *    else closes with an Establish-Control step and heals nobody. When a combat DOES happen, every unit on
 *    the board heals, wherever it stands — and once combat starts all its steps run even if nothing dies.
 * Rules: 466.1.a.1 (the Combat Cleanup inserts "3c. Heal all Units"), 317.2.b (the same insert at the end
 *        of the turn), 348 / 348.2 (all pass → a non-combat showdown closes with Establish Control),
 *        344.1 / 460 / 461 (a Combat needs units of opposing players at a Contested battlefield),
 *        463 (once combat is initiated, its steps are worked through).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** 3-Might defender that damage cannot mark (the "I don't take damage" restriction, rule 465.2.c.10). */
const STATUE = {
  abilities: [{ effect: { restriction: "no-damage", type: "restriction" }, type: "static" }],
  cardType: "unit",
  domain: "calm",
  energyCost: 4,
  might: 3,
  name: "Test Statue",
  rulesText: "I don't take damage.",
} as const;

function showdown(game: Game) {
  return (game.gameState.interaction?.showdownStack ?? []).at(-1);
}

/** P1's turn. bf1 is empty and uncontrolled; bf2 is P2's with a 1-Might Chaff. Two damaged P1 units at home. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 1, name: "Chaff" }, "chaff")
    .unit(P1, "base", { might: 5, name: "Scout" }, "scout", { damage: 2 })
    .unit(P1, "base", { might: 5, name: "Watchman" }, "watchman", { damage: 3 });
}

describe("Ruling 99e765cf1817138a — only a combat showdown (and the end of the turn) heals", () => {
  test("walking onto an empty uncontrolled battlefield opens a NON-combat showdown — no opposing units, no combat", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: false });
    expect(game.state("scout").combatRole).toBeNull();
  });

  test("when that showdown closes nothing is healed — not the unit that was in it, not the one in base", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    await game.settle();
    expect(showdown(game)?.active).toBeFalsy();
    expect(game.state("scout")).toMatchObject({ damage: 2, zone: "battlefield-bf1" });
    expect(game.state("watchman").damage).toBe(3);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // it did conquer (348.2.a)
  });

  test("a battlefield occupied by units of DIFFERENT players is what makes it a combat — and then everyone heals, wherever they stand", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf2");
    expect(showdown(game)).toMatchObject({ isCombatShowdown: true });
    await game.settle();
    expect(game.zoneOf("chaff")).toBe("trash");
    expect(game.state("scout")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.state("watchman").damage).toBe(0); // "Heal all Units" is not "all units here"
  });

  test("all the steps of a combat still run when nothing dies — an immune defender survives, the attacker survives, and the Cleanup heals anyway", async () => {
    const game = await scenario()
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", STATUE, "statue")
      .unit(P1, "base", { might: 7, name: "Raider" }, "raider", { damage: 2 })
      .unit(P1, "base", { might: 4, name: "Watchman" }, "watchman", { damage: 3 })
      .build();
    await game.p1.move("raider", "bf2");
    expect(showdown(game)).toMatchObject({ isCombatShowdown: true });
    await game.settle();
    expect(game.zoneOf("statue")).toBe("battlefield-bf2"); // immune, so nobody died at all
    expect(game.zoneOf("raider")).toBe("base"); // recalled by the Combat Cleanup
    expect(game.state("raider").damage).toBe(0); // and healed by it
    expect(game.state("watchman").damage).toBe(0);
  });

  test("the other window: after the non-combat showdown the damage survives to the Ending Phase and heals there", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    await game.settle();
    expect(game.state("scout").damage).toBe(2);
    await game.advanceTurn();
    expect(game.state("scout").damage).toBe(0);
    expect(game.state("watchman").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
