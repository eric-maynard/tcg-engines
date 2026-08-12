/**
 * Ruling a2931dd39f40091b — (the "+2 while alone" shape the question calls Master Yi)
 *   Stand-in: Wielder of Water (OGN-055 → ogn-055-298) · 2 Might · "While I'm attacking or defending alone,
 *   I have +2 [Might]" — the printed card in this set with exactly that continuous bonus.
 *
 * Q: In a showdown, when two units die simultaneously to combat damage, does the survivor-to-be pick up the
 *    "+2 while alone" bonus as the other one dies during damage calculation?
 * A: No — neither of them gets it. Combat damage is dealt simultaneously, so there is no instant at which
 *    one of them is alone while damage is being worked out. (If a unit had ended up alone BEFORE combat
 *    damage was dealt, it would have the +2 then.)
 * Rules: 465.2 (combat damage is assigned and dealt as one simultaneous event), 142.4 (lethal damage),
 *        371 (a continuous effect is re-evaluated from the current game state), 466.1 (deaths are settled
 *        in the Cleanup after the damage step, not between assignments).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WIELDER_OF_WATER = "ogn-055-298";

/** P1's turn: a 4-Might Raider attacks bf1, defended by the 2-Might Wielder and a 2-Might Chaff. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", WIELDER_OF_WATER, "wielder")
    .unit(P2, "bf1", { might: 2, name: "Chaff" }, "chaff")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider");
}

async function inCombat(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  return game;
}

describe("Ruling a2931dd39f40091b — simultaneous deaths never make anybody 'alone' during damage", () => {
  test("with two defenders standing, the Wielder is not alone and is at its printed 2 Might", async () => {
    const game = await inCombat();
    expect(game.state("wielder").combatRole).toBe("defender");
    expect(game.state("wielder").might).toBe(2);
    expect(game.state("chaff").might).toBe(2);
  });

  test("4 damage is exactly lethal on 2 + 2: both defenders die together and the Wielder never gets the +2 that would have saved it", async () => {
    const game = await inCombat();
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(game.zoneOf("chaff")).toBe("trash");
    expect(game.zoneOf("wielder")).toBe("trash"); // 2 damage was lethal to a 2-Might unit
    // and the two defenders' own 2 + 2 was lethal to the 4-Might Raider, so nobody is left to conquer
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });

  test("the ruling's own contrast: alone BEFORE damage, the bonus is real — a lone Wielder is a 4-Might defender and shrugs off 3", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", WIELDER_OF_WATER, "wielder")
      .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    expect(game.state("wielder").might).toBe(2); // out of combat
    await game.p1.move("raider", "bf1");
    expect(game.state("wielder").might).toBe(4); // defending alone
    await game.settle();
    expect(game.zoneOf("wielder")).toBe("battlefield-bf1"); // 3 < 4, it lives
    expect(game.zoneOf("raider")).toBe("trash"); // and its 4 was lethal to the 3-Might attacker
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("and with the partner removed before damage, the SAME board is survivable — proving the difference is timing, not the card", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", WIELDER_OF_WATER, "wielder")
      .unit(P2, "base", { might: 2, name: "Chaff" }, "chaff") // never joins the defence
      .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p1.move("raider", "bf1");
    expect(game.state("wielder").might).toBe(4);
    await game.settle();
    expect(game.zoneOf("wielder")).toBe("battlefield-bf1");
  });
});
