/**
 * Ruling c1a429c17e1459b0 — Irresistible Faefolk (UNL-112 → unl-112-219) · Unit · [2] · 1 Might
 *   "When I move to a battlefield, you may move an enemy unit to that battlefield."
 *
 * Q: When the Faefolk moves to an empty battlefield and drags an enemy unit along, who is attacker and who
 *    is defender?
 * A: The Faefolk's controller is the ATTACKER — they applied Contested by moving to the uncontrolled
 *    battlefield first. The enemy unit pulled in afterwards joins as the DEFENDER, even though it was your
 *    own ability that moved it.
 * Rules: 190.3.a.1 (arrival at a battlefield you do not control applies Contested), 459.2.b.1 (attacker =
 *        the player who applied Contested), 383.3.a (the "you may" is decided at finalization).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FAEFOLK = "unl-112-219";

/** bf1 is empty and uncontrolled; the Faefolk starts in P1's base, the enemy body in P2's. */
function emptyBattlefield(manual = true) {
  const s = manual ? scenario().autoProcedures(false) : scenario();
  return s
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", FAEFOLK, "fae")
    .unit(P2, "base", { might: 2, name: "Wayfarer" }, "foe");
}

async function bothPass(game: Game): Promise<void> {
  await game.acting().passPriority();
  await game.acting().passPriority();
}

describe("Ruling c1a429c17e1459b0 — the Faefolk's controller attacks, the dragged-in enemy defends", () => {
  test("the move applies Contested for P1 and raises the 'you may' at finalization, bound to the enemy unit", async () => {
    const game = await emptyBattlefield().build();
    await game.p1.move("fae", "bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    expect(game.decision()?.source?.cardId).toBe("fae");
    await game.p1.yes();
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "fae", controller: P1, targets: ["foe"], triggered: true }),
    ]);
    expect(game.locationOf("foe")).toBe("base"); // not moved until the item resolves
  });

  test("once it resolves the enemy is at bf1 as the DEFENDER and the Faefolk is the ATTACKER", async () => {
    const game = await emptyBattlefield().build();
    await game.p1.move("fae", "bf1");
    await game.p1.yes();
    await bothPass(game);
    expect(game.locationOf("foe")).toBe("bf1");
    expect(game.state("fae").combatRole).toBe("attacker");
    expect(game.state("foe").combatRole).toBe("defender");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("and the combat is scored as an attack — the 2-Might defender kills the 1-Might Faefolk and P2 takes bf1", async () => {
    const game = await emptyBattlefield(false).build();
    await game.p1.move("fae", "bf1");
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("fae")).toBe("trash");
    expect(game.locationOf("foe")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("declining the 'you may' leaves nobody to defend, so P1 simply takes the empty battlefield", async () => {
    const game = await emptyBattlefield(false).build();
    await game.p1.move("fae", "bf1");
    await game.p1.no();
    await game.settle();
    expect(game.locationOf("foe")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
