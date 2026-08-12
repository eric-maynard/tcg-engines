/**
 * Ruling 9f0f51591ea32a7a — (no specific card) where an attacker goes when combat ends without a conquer.
 *   Exercised with inline units: a [Ganking] attacker, a fat STUNNED defender (so nobody dies) and
 *   a second battlefield to attack from.
 *
 * Q: I attacked from one battlefield and neither unit died — do I go back where I came from?
 * A: No. Surviving Attackers are RECALLED at the Combat Cleanup, and a Recall always sends a permanent
 *    to its controller's BASE. A recall is not a move, so the origin battlefield is irrelevant.
 * Rules: 466.1.a.2 (Combat Cleanup step 3d — recall the Attackers if Defenders are still present),
 *    190 (Recall = relocate to the controller's base; not a Move).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/**
 * P1 holds bf1 with a [Ganking] 6-Might raider; P2 holds bf2 with an 8-Might defender that is STUNNED
 * (a stunned unit deals no combat damage), so the combat ends with neither unit dying.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { keywords: ["Ganking"], might: 6, name: "Raider" }, "raider")
    .unit(P1, "bf1", { might: 1, name: "Anchor" }, "anchor")
    .unit(P2, "bf2", { might: 8, name: "Bulwark" }, "bulwark", { stunned: true });
}

async function gankAndFight(): Promise<Game> {
  const game = await board().build();
  expect(game.locationOf("raider")).toBe("bf1");
  await game.p1.gank("raider", "bf2");
  expect(game.state("raider").combatRole).toBe("attacker");
  await game.settle();
  return game;
}

describe("Ruling 9f0f51591ea32a7a — a surviving attacker is recalled to BASE, never back to its origin", () => {
  test("neither unit dies: the defender survives at 8 Might, the raider survives the stunned defender", async () => {
    const game = await gankAndFight();
    expect(game.zoneOf("bulwark")).toBe("battlefield-bf2");
    expect(game.zoneOf("raider")).not.toBe("trash");
  });

  test("the raider ends up in BASE — not back at bf1 where it came from", async () => {
    const game = await gankAndFight();
    expect(game.locationOf("raider")).toBe("base");
    expect(game.zoneOf("raider")).toBe("base");
    expect(game.p1.units("bf1")).toEqual(["anchor"]); // only the unit that never attacked is still there
    expect(game.p1.units("bf2")).toEqual([]);
  });

  test("no conquer happened — bf2 stays with its defender and nobody scored", async () => {
    const game = await gankAndFight();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("same answer when the attack came from BASE — the recall is to base either way", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", { might: 6, name: "Raider" }, "raider")
      .unit(P2, "bf2", { might: 8, name: "Bulwark" }, "bulwark", { stunned: true })
      .build();
    await game.p1.move("raider", "bf2");
    await game.settle();
    expect(game.locationOf("raider")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});
