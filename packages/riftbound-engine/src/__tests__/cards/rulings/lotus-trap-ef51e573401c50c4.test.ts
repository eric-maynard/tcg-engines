/**
 * Ruling ef51e573401c50c4 — Lotus Trap (UNL-013 → unl-013-219) · [2] · "[Hidden] [Reaction] Choose a unit. Double all damage that would be
 *     dealt to it this turn."
 *   × Mindsplitter (OGN-192 → ogn-192-298) · 7 Might   × Noxus Hopeful (OGN-012 → ogn-012-298) · 4 Might
 *   (Tryndamere, Barbarian ogn-034-298 is cited only to say ITS "5+ excess" clause is combat-only — Lotus Trap itself is not.)
 *
 * Q: I Lotus Trap the enemy Mindsplitter at a battlefield, then attack it with Noxus Hopeful. Does the Mindsplitter die?
 * A: Yes. Lotus Trap doubles ALL damage to the chosen unit this turn, combat damage included: the Hopeful's 4 becomes 8 ≥ 7, so
 *    the Mindsplitter is killed in combat cleanup.
 * Rules: 372 (replacement: double damage), 465 (combat damage dealt simultaneously), 428.1.a.2 / 323 (lethal damage → killed).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LOTUS_TRAP = "unl-013-219";
const MINDSPLITTER = "ogn-192-298";
const NOXUS_HOPEFUL = "ogn-012-298";

/** P1's turn with [2] for Lotus Trap; Noxus Hopeful (4) ready in base. P2 holds bf1 with Mindsplitter (7). */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", MINDSPLITTER, "mind")
    .unit(P1, "base", NOXUS_HOPEFUL, "hopeful")
    .hand(P1, LOTUS_TRAP, "lotus");
}

describe("Ruling ef51e573401c50c4 — Lotus Trap doubles combat damage too: Noxus Hopeful (4 → 8) kills a 7-Might Mindsplitter", () => {
  test("control (no Lotus Trap): Hopeful 4 into Mindsplitter 7 — the Mindsplitter survives (healed after combat), the Hopeful dies, P2 keeps bf1", async () => {
    const game = await board().build();
    await game.p1.move("hopeful", "bf1");
    await game.settle();
    expect(game.zoneOf("hopeful")).toBe("trash");
    expect(game.state("mind")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("Lotus Trap on the Mindsplitter first: it carries the doubling for the turn (no damage yet)", async () => {
    const game = await board().build();
    expect(game.state("mind").might).toBe(7);
    await game.p1.cast("lotus", { targets: "mind" });
    await game.settle();
    expect(game.zoneOf("lotus")).toBe("trash");
    expect(game.state("mind").keywords).toContain("DoubleIncomingDamage");
    expect(game.state("mind").damage).toBe(0);
  });

  test("then the Hopeful attacks: its 4 combat damage is doubled to 8 ≥ 7 — the Mindsplitter DIES in combat cleanup (the Hopeful, taking 7, dies too; bf1 is left with no controller)", async () => {
    const game = await board().build();
    await game.p1.cast("lotus", { targets: "mind" });
    await game.settle();
    await game.p1.move("hopeful", "bf1");
    expect(game.state("hopeful")).toMatchObject({ combatRole: "attacker", might: 4 });
    expect(game.state("mind").combatRole).toBe("defender");
    await game.settle();
    expect(game.zoneOf("mind")).toBe("trash");
    expect(game.p2.trash()).toContain("mind");
    expect(game.zoneOf("hopeful")).toBe("trash"); // 7 ≥ 4
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: null });
    expect(game.p1.points()).toBe(0); // nobody left to conquer
    expect(game.violations()).toEqual([]);
  });

  test("the doubling is 'this turn' only: trapped this turn but attacked NEXT turn, the Mindsplitter survives a 4-Might attacker again", async () => {
    const game = await board().unit(P1, "base", { might: 4, name: "Second Hopeful" }, "h2").build();
    await game.p1.cast("lotus", { targets: "mind" });
    await game.settle();
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1 again
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("mind").keywords).not.toContain("DoubleIncomingDamage");
    await game.p1.move("h2", "bf1");
    await game.settle();
    expect(game.zoneOf("h2")).toBe("trash");
    expect(game.zoneOf("mind")).toBe("battlefield-bf1");
  });
});
