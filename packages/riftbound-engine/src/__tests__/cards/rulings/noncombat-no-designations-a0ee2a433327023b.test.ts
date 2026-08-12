/**
 * Ruling a0ee2a433327023b — (no specific card) are there attackers in a non-combat showdown?
 *   Stand-ins: plain inline units, plus Wielder of Water (OGN-055 → ogn-055-298, "While I'm attacking or
 *   defending alone, I have +2 [Might]") as a card that can only notice a designation.
 *
 * Q: Are there attacking units in a non-combat showdown?
 * A: No. "Attacker" and "Defender" only exist where a showdown involves units of two different players —
 *    that is, a combat. In a non-combat showdown nobody carries those designations, so nothing that keys
 *    off them applies.
 * Rules: 464.2.c.3 (the designations are stamped when the showdown becomes a Combat Showdown),
 *        460 / 461 (a Combat needs units of opposing players at the battlefield), 348.2 (a non-combat
 *        showdown closes with Establish Control), 807 / 811 (keywords that key off the designations).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WIELDER_OF_WATER = "ogn-055-298";

function showdown(game: Game) {
  return (game.gameState.interaction?.showdownStack ?? []).at(-1);
}

/** bfEmpty is uncontrolled and empty; bfEnemy is P2's with a 1-Might Chaff on it. */
function board() {
  return scenario()
    .battlefield("bfEmpty", { controller: null })
    .battlefield("bfEnemy", { controller: P2 })
    .unit(P2, "bfEnemy", { might: 1, name: "Chaff" }, "chaff")
    .unit(P1, "base", WIELDER_OF_WATER, "wielder")
    .unit(P1, "base", { might: 3, name: "Scout" }, "scout");
}

describe("Ruling a0ee2a433327023b — a non-combat showdown has no Attacker and no Defender", () => {
  test("a lone walk onto an empty battlefield opens a showdown that is flagged non-combat, and the mover carries no designation", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bfEmpty");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bfEmpty", isCombatShowdown: false });
    expect(game.state("scout").combatRole).toBeNull();
  });

  test("a card that keys off 'attacking … alone' therefore gets nothing there — the Wielder stays at its printed 2 Might", async () => {
    const game = await board().build();
    expect(game.state("wielder").might).toBe(2);
    await game.p1.move("wielder", "bfEmpty");
    expect(showdown(game)).toMatchObject({ isCombatShowdown: false });
    expect(game.state("wielder").combatRole).toBeNull();
    expect(game.state("wielder").might).toBe(2);
    await game.settle();
    expect(game.state("wielder").might).toBe(2);
    expect(game.gameState.battlefields.bfEmpty?.controller).toBe(P1);
  });

  test("contrast — the very same unit walking into an enemy-occupied battlefield IS an attacker, alone, and gets its +2", async () => {
    const game = await board().build();
    await game.p1.move("wielder", "bfEnemy");
    expect(showdown(game)).toMatchObject({ isCombatShowdown: true });
    expect(game.state("wielder").combatRole).toBe("attacker");
    expect(game.state("chaff").combatRole).toBe("defender");
    expect(game.state("wielder").might).toBe(4);
  });

  test("and after the combat ends the designations are gone again", async () => {
    const game = await board().build();
    await game.p1.move("wielder", "bfEnemy");
    await game.settle();
    expect(game.zoneOf("chaff")).toBe("trash");
    expect(game.state("wielder").combatRole).toBeNull();
    expect(game.state("wielder").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
