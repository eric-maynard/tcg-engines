/**
 * Ruling 73e3bf0997e7e4fa — Fight or Flight (OGN-168 → ogn-168-298) · Spell · Chaos · [2] · [Action] / [Hidden]
 *     "Move a unit from a battlefield to its base."
 *
 * Q: If Fight or Flight removes a unit before it fights, does the already-damaged defender still get healed?
 * A: It depends. Combat only happens if BOTH players control a unit there when combat would begin: pull the lone
 *    attacker out first and the staged combat is removed before it starts — no combat, no Combat Cleanup, so the
 *    defender keeps its marked damage. Pull one of two attackers and combat still happens, and its cleanup clears all
 *    marked damage from every surviving unit.
 * Rules: 460.1 (combat occurs only where both players control units), 461.1.a.1 (Combat Cleanup clears marked damage),
 *        355.1.b ([Action] playable in showdowns).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";

const showdowns = (game: Game) => game.gameState.interaction?.showdownStack ?? [];

/**
 * P1's turn. P2 holds bf1 with an 8-Might Splitter already carrying 2 marked damage. P1 sends `attackers` 3-Might
 * Raiders in. P2 has Fight or Flight + [2] to pull one of them home mid-showdown.
 */
function board(attackers: number) {
  let b = scenario()
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 8, name: "Splitter" }, "splitter", { damage: 2 })
    .hand(P2, FIGHT_OR_FLIGHT, "fof");
  for (let i = 0; i < attackers; i++) {
    b = b.unit(P1, "base", { might: 3, name: `Raider ${i + 1}` }, `raider${i + 1}`);
  }
  return b;
}

/** P1 attacks with every Raider; P1 passes Focus so P2 may act before combat resolves. */
async function attack(attackers: number): Promise<Game> {
  const game = await board(attackers).build();
  const ids = Array.from({ length: attackers }, (_, i) => `raider${i + 1}`);
  await game.p1.move(ids, "bf1");
  expect(game.state("splitter")).toMatchObject({ combatRole: "defender", damage: 2 });
  if (game.decision()?.seat === P1) {
    await game.p1.passFocus();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 73e3bf0997e7e4fa — whether the damaged defender is healed depends on whether combat actually happens", () => {
  // Expected: with the only attacker gone the staged combat is removed before it begins (460.1), so no Combat
  // Cleanup runs and the Splitter's 2 marked damage stays on it.
  // Actual: the engine heals the defender anyway when the showdown closes — the Splitter ends on 0 damage.
  test.failing("BUG: ruling 73e3bf0997e7e4fa — defender is healed even though the combat never occurred (lone attacker pulled out first)", async () => {
    const game = await attack(1);
    await game.p2.cast("fof", { targets: "raider1" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.locationOf("raider1")).toBe("base");
    expect(game.state("raider1").combatRole).toBeNull();
    await game.settle();
    expect(showdowns(game)).toEqual([]);
    expect(game.state("splitter").damage).toBe(2); // NOT healed — no combat took place
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("one of two attackers sent home: combat still occurs (a unit of each player remains), so cleanup clears ALL marked damage — the Splitter ends on 0", async () => {
    const game = await attack(2);
    await game.p2.cast("fof", { targets: "raider1" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.locationOf("raider1")).toBe("base");
    expect(game.state("raider2").combatRole).toBe("attacker");
    await game.settle();
    expect(showdowns(game)).toEqual([]);
    expect(game.zoneOf("raider2")).toBe("trash"); // 8 Might of Splitter kills it
    expect(game.zoneOf("splitter")).toBe("battlefield-bf1"); // 2 + 3 = 5 < 8
    expect(game.state("splitter").damage).toBe(0); // healed by Combat Cleanup
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("control — nobody interferes: the combat runs and 2 marked + 3 + 3 is exactly lethal, so the Splitter dies rather than being healed", async () => {
    const game = await attack(2);
    await game.settle();
    expect(showdowns(game)).toEqual([]);
    expect(game.zoneOf("splitter")).toBe("trash"); // 2 marked + 6 combat = 8 ≥ 8
    expect(game.zoneOf("raider1")).toBe("trash"); // the Splitter's 8 kills the attackers too
    expect(game.zoneOf("raider2")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull(); // nobody remains — Uncontrolled (466.5.b)
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
