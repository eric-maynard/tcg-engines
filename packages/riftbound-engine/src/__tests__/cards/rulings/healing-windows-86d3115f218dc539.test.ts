/**
 * Ruling 86d3115f218dc539 — (no specific card) when and where units heal.
 *   Stand-ins: Hextech Ray (OGN-009 → ogn-009-298) · [1][fury] "Deal 3 to a unit at a battlefield" for
 *   out-of-combat damage; plain inline units for the board.
 *
 * Q: When and where do units heal damage during a turn?
 * A: Exactly twice. (1) In the Combat Cleanup after a combat showdown resolves — and that heals EVERY unit
 *    on the board, wherever it stands and whether or not it fought. (2) At the end of each player's turn,
 *    in the Ending Phase. Damage from spells outside a showdown is not healed on the spot; it sits on the
 *    unit until whichever of those two windows comes first. A non-combat showdown heals nothing.
 * Rules: 466.1.a.1 (the Combat Cleanup inserts "3c. Heal all Units"), 317.2.b (the same insert at the end
 *        of the turn), 348.2 (a non-combat showdown closes with Establish Control and nothing else),
 *        405.1 / 142 (damage stays marked until it is healed).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEXTECH_RAY = "ogn-009-298";

/** P1's turn. bf1 is P2's with a 1-Might Chaff; bf2 is empty and uncontrolled. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 1, name: "Chaff" }, "chaff")
    .unit(P1, "base", { might: 6, name: "Raider" }, "raider")
    .unit(P1, "base", { might: 6, name: "Watchman" }, "watchman")
    .unit(P1, "base", { might: 6, name: "Scout" }, "scout")
    .hand(P1, HEXTECH_RAY, "ray");
}

/** Ray the Watchman while it stands at bf2 (a spell, no showdown running). */
async function damagedOutOfCombat(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("watchman", "bf2");
  await game.settle();
  await game.p1.cast("ray", { targets: "watchman" });
  await game.settle();
  expect(game.state("watchman").damage).toBe(3);
  return game;
}

describe("Ruling 86d3115f218dc539 — damage heals in the Combat Cleanup and at the end of the turn, nowhere else", () => {
  test("spell damage outside a showdown is not healed on the spot — it stays marked", async () => {
    const game = await damagedOutOfCombat();
    expect(game.phase()).toBe("main");
    expect(game.state("watchman")).toMatchObject({ damage: 3, zone: "battlefield-bf2" });
  });

  test("a COMBAT showdown heals every unit on the board — including the damaged one that never fought and the one parked in base", async () => {
    const game = await damagedOutOfCombat();
    await game.p1.move("raider", "bf1"); // Chaff is there → a combat showdown
    await game.settle();
    expect(game.zoneOf("chaff")).toBe("trash");
    expect(game.state("watchman").damage).toBe(0); // healed at bf2, far from the combat (466.1.a.1)
    expect(game.state("raider").damage).toBe(0);
    expect(game.state("scout")).toMatchObject({ damage: 0, zone: "base" });
  });

  test("a NON-combat showdown heals nobody — a walk onto an empty uncontrolled battlefield leaves the 3 marked", async () => {
    const game = await scenario()
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", { might: 6, name: "Watchman" }, "watchman", { damage: 3 })
      .unit(P1, "base", { might: 6, name: "Scout" }, "scout")
      .build();
    await game.p1.move("scout", "bf2");
    expect((game.gameState.interaction?.showdownStack ?? []).at(-1)).toMatchObject({ isCombatShowdown: false });
    await game.settle();
    expect(game.state("watchman").damage).toBe(3);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });

  test("the second window: with no combat at all, the damage survives to the Ending Phase and heals there (317.2)", async () => {
    const game = await damagedOutOfCombat();
    expect(game.state("watchman").damage).toBe(3);
    await game.advanceTurn();
    expect(game.state("watchman").damage).toBe(0);
    expect(game.trace().expiration.at(-1)?.steps).toContain("heal");
    expect(game.violations()).toEqual([]);
  });
});
