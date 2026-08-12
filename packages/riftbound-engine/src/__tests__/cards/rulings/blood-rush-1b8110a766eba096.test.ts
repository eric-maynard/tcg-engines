/**
 * Ruling 1b8110a766eba096 — Blood Rush (SFD-003 → sfd-003-221) · [1] Action
 *   "[Repeat] [1] … Give a unit [Assault 2] this turn. (+2 [Might] while it's an attacker.)"
 *
 * Q: Does Blood Rush's effect stay forever or just for the turn it is played?
 * A: Only for the turn it is played (day-0 errata; the printed text was missing the duration).
 *    The granted [Assault 2] is a "this turn" continuous effect and ends in the Ending Phase.
 * Rules: 317.2 (Expiration Step ends "this turn" effects), 801 (Assault only while an attacker).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BLOOD_RUSH = "sfd-003-221";

/** P1's turn. P2 holds bf1 with a 1-Might watcher; P1 has a 3-Might runner in base and Blood Rush + [1]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Watcher" }, "watcher")
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
    .hand(P1, BLOOD_RUSH, "rush");
}

describe("Ruling 1b8110a766eba096 — Blood Rush grants [Assault 2] for THIS TURN only", () => {
  test("the grant is stamped with duration 'turn', not a permanent keyword", async () => {
    const game = await board().build();
    await game.p1.cast("rush", { targets: "runner" });
    await game.settle();
    expect(game.zoneOf("rush")).toBe("trash");
    expect(game.state("runner").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 2 }]);
    expect(game.state("runner").might).toBe(3); // not an attacker yet — Assault is inert in base
  });

  test("it is live during that turn: attacking into bf1 makes the Runner 3 + 2 = 5", async () => {
    const game = await board().build();
    await game.p1.cast("rush", { targets: "runner" });
    await game.settle();
    await game.p1.move("runner", "bf1");
    expect(game.state("runner").combatRole).toBe("attacker");
    expect(game.state("runner").might).toBe(5);
  });

  test("ruling: the grant is GONE on the following turn — it did not stay forever", async () => {
    const game = await board().build();
    await game.p1.cast("rush", { targets: "runner" });
    await game.settle();
    expect(game.state("runner").grantedKeywords).toHaveLength(1);
    await game.advanceTurn(); // P1 ends; expiration step runs
    expect(game.state("runner").grantedKeywords).toEqual([]);
    expect(game.state("runner").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("and it is still gone when the Runner attacks on a LATER turn — no lingering Assault", async () => {
    const game = await board().build();
    await game.p1.cast("rush", { targets: "runner" });
    await game.settle();
    await game.advanceTurn(); // P1 → P2
    await game.advanceToTurnOf(P1); // P2 → P1 again
    await game.p1.move("runner", "bf1");
    expect(game.state("runner").combatRole).toBe("attacker");
    expect(game.state("runner").might).toBe(3);
  });
});
