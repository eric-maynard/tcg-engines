/**
 * Ruling 1bf8934f55305f54 — Charm (OGN-043 → ogn-043-298) · [1][calm] spell · "Move an enemy unit."
 *
 * Q: Can Charm move an enemy unit from one battlefield to another if it does not have [Ganking]?
 * A: Yes. [Ganking] only gates a STANDARD MOVE (the move action a player takes on their own turn);
 *    a move caused by a spell or ability is not a Standard Move, so the restriction does not apply.
 *    Charming an enemy unit onto a battlefield you occupy makes it an attacker there.
 * Rules: 330 (Standard Move; battlefield→battlefield needs [Ganking]), 630 (effects that move units are
 *        not Standard Moves), 460.1 (the player who applies Contested is the attacker).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";

/** P1's turn. P2 holds bf1 with a vanilla 3-Might unit (NO [Ganking]); P1 holds bf2 with a 6-Might guard. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 3, name: "Wanderer" }, "wanderer")
    .unit(P1, "bf2", { might: 6, name: "Guard" }, "guard")
    .hand(P1, CHARM, "charm");
}

describe("Ruling 1bf8934f55305f54 — Charm moves an enemy unit battlefield→battlefield with no [Ganking] needed", () => {
  test("the charmed unit has no [Ganking] printed or granted", async () => {
    const game = await board().build();
    expect(game.state("wanderer").keywords).not.toContain("Ganking");
    expect(game.state("wanderer").grantedKeywords).toEqual([]);
  });

  test("bf2 (a different battlefield) is a legal destination — the charmed unit walks bf1 → bf2", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "charm")).toBe(true);
    await game.p1.cast("charm", { targets: "wanderer", answers: ["bf2"] });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Charm resolves
    expect(game.zoneOf("wanderer")).toBe("battlefield-bf2");
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("ruling: arriving at P1's occupied bf2 the charmed unit is the ATTACKER there", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "wanderer", answers: ["bf2"] });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Charm resolves; the arrival contests bf2
    expect(game.locationOf("wanderer")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.contested).toBe(true);
    await game.settle();
    expect(game.state("wanderer").combatRole ?? "attacker").toBe("attacker");
    // 3 attacking Might vs the 6-Might Guard: the charmed unit dies, P1 keeps bf2.
    expect(game.zoneOf("wanderer")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });
});
