/**
 * Ruling 3b6f73af22efacbc — (no specific card) do units heal after a NON-combat showdown?
 *
 * Q: Do units heal after a non-combat Showdown?
 * A: No. Healing belongs to the Combat Cleanup (and to the end of the turn). A showdown only counts as a
 *    combat when the battlefield is contested AND occupied by units of different players; anything else is
 *    a non-combat showdown and heals nobody.
 * Rules: 466.1.a.1 (the Combat Cleanup — and only it — inserts "3c. Heal all Units"), 348.2 (a non-combat
 *        showdown closes with an Establish-Control step and nothing else), 460 / 464.1 (a Combat needs units
 *        of opposing players at the battlefield), 317.2 (the other heal is the Ending Phase's Expiration Step).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** P1's turn: a damaged Scout in base, an empty uncontrolled bf1, a damaged Watchman parked in base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 5, name: "Scout" }, "scout", { damage: 2 })
    .unit(P1, "base", { might: 5, name: "Watchman" }, "watchman", { damage: 3 });
}

function showdown(game: Game) {
  return game.gameState.interaction?.showdownStack?.at(-1);
}

describe("Ruling 3b6f73af22efacbc — a non-combat showdown does not heal anything", () => {
  test("a damaged unit walks onto an empty uncontrolled battlefield: the showdown that opens is flagged NON-combat", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: false });
    expect(game.state("scout").damage).toBe(2);
    expect(game.state("scout").combatRole).toBeNull(); // no designations without a combat
  });

  test("when that showdown closes, the damage is STILL there — on the unit that was in it and on the one that was not", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    await game.settle();
    expect(showdown(game)?.active).toBeFalsy();
    expect(game.state("scout")).toMatchObject({ damage: 2, zone: "battlefield-bf1" });
    expect(game.state("watchman").damage).toBe(3);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // it did conquer (348.2.a)
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — a COMBAT showdown (units of two players at the battlefield) does heal the survivors", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Chaff" }, "chaff")
      .unit(P1, "base", { might: 5, name: "Scout" }, "scout", { damage: 2 })
      .unit(P1, "base", { might: 5, name: "Watchman" }, "watchman", { damage: 3 })
      .build();
    await game.p1.move("scout", "bf1");
    expect(showdown(game)).toMatchObject({ isCombatShowdown: true });
    await game.settle();
    expect(game.zoneOf("chaff")).toBe("trash");
    expect(game.state("scout")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // healed by 466.1.a.1
    // 466.1.a.1 says "Heal all Units", not "all units here" — the Watchman sitting in base is healed too.
    expect(game.state("watchman").damage).toBe(0);
  });

  test("the healing is not turn-based: the SAME damaged unit is still damaged right up to the Ending Phase, then heals there (317.2)", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    await game.settle();
    expect(game.state("scout").damage).toBe(2);
    await game.advanceTurn();
    expect(game.state("scout").damage).toBe(0);
    expect(game.state("watchman").damage).toBe(0);
  });
});
