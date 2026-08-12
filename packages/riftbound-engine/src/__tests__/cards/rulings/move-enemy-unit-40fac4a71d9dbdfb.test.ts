/**
 * Ruling 40fac4a71d9dbdfb — Void Assault (UNL-202 → unl-202-219) · 2 energy + [rainbow] ·
 *   "Move a friendly unit, then move an enemy unit. (If they both move to a battlefield you don't
 *   control, you're the attacker.)"
 *
 * Q: Can you move an ENEMY unit from one battlefield to another (e.g. to gang up)?
 * A: Yes — an effect that moves an enemy unit may send it battlefield-to-battlefield, not only home to
 *    its base. It stays its controller's unit; only its location changes.
 * Rules: 355.4 / 429 (a move effect's destination is chosen at finalization from the legal arrivals),
 *        453 (moves between battlefields), 477.1 (control is unaffected by a move).
 */
import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_ASSAULT = "unl-202-219";

/** P1's turn: bf1 is P2's (a 1-Might Foe there), bf2 is P1's (a 5-Might Holder). P1 has an Ally in base. */
const board = () =>
  scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 1, name: "Foe" }, "foe")
    .unit(P1, "bf2", { might: 5, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .hand(P1, VOID_ASSAULT, "va");

describe("Ruling 40fac4a71d9dbdfb — an effect may move an enemy unit from one battlefield to another", () => {
  test("the enemy unit's destination prompt offers the OTHER battlefield, not just its base", async () => {
    const game = await board().build();
    await game.p1.cast("va", { targets: ["ally", "foe"] });
    await game.p1.pick("battlefield-bf2"); // the friendly mover's destination first
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", source: { cardId: "foe" } });
    expect(d.options.map((o) => o.key)).toContain("battlefield-bf2");
  });

  test("it really moves: the Foe leaves bf1 for bf2 and stays P2's unit", async () => {
    const game = await board().build();
    await game.p1.cast("va", { targets: ["ally", "foe"], answers: ["battlefield-bf2", "battlefield-bf2"] });
    await game.p1.passPriority();
    await game.p2.passPriority(); // the spell resolves
    expect(game.locationOf("foe")).toBe("bf2");
    expect(game.locationOf("ally")).toBe("bf2");
    expect(game.state("foe").controller).toBe(P2);
    expect(game.state("foe").owner).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("dragging it onto a battlefield P1 controls makes that battlefield contested — a showdown P1 defends", async () => {
    const game = await board().build();
    await game.p1.cast("va", { targets: ["ally", "foe"], answers: ["battlefield-bf2", "battlefield-bf2"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.gameState.battlefields.bf2?.contested).toBeTruthy();
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash"); // 1 Might against the 5-Might Holder
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });
});
