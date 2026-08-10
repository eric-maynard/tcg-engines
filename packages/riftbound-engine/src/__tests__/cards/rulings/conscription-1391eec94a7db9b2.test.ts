/**
 * Ruling 1391eec94a7db9b2 — Conscription (UNL-140 → unl-140-219) · Spell · Chaos · [5][chaos][chaos]
 *   "You may spend 5 XP as an additional cost to play this. Choose an enemy unit at a battlefield with 3 [Might] or
 *    less. … Take control of it, exhaust it, and recall it."
 *
 * Q: The opponent controls a battlefield with a single unit and I have nothing there. If I Conscription that unit,
 *    do I get a (Conquer) point? And afterwards it just goes back to a hand?
 * A: No and no. Taking control of the UNIT is not taking control of the BATTLEFIELD: the unit is recalled to your
 *    base, the battlefield is left empty, you never establish control there, so no Conquer and no point. Recall
 *    relocates the permanent to its (new controller's) Base — it is not returned to anyone's hand; it stays on your
 *    board under your control and can be Standard-Moved later.
 * Rules: 464.1 (Conquer = gaining control of a battlefield), 187.4 (control needs units present), 450 (Recall =
 *        relocate to Base, not a move), 144.4.a (Standard Move later).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CONSCRIPTION = "unl-140-219";

/** P1's turn. P2 holds bf1 with a lone 3-Might Guard; P1 has no unit there (only a Homebody in base). */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 2, name: "Reserve" }, "reserve")
    .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
    .hand(P1, CONSCRIPTION, "con");
}

describe("Ruling 1391eec94a7db9b2 — Conscription steals the unit, not the battlefield: no conquer point, and the unit is recalled to base (not to hand)", () => {
  test("the spell goes on the chain first; nothing changes hands until it resolves", async () => {
    const game = await board().build();
    await game.p1.cast("con", { targets: "guard" });
    expect(game.zoneOf("con")).toBe("chain");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "con", controller: P1 })]);
    expect(game.state("guard")).toMatchObject({ controller: P2, location: "bf1" });
    expect(game.p1.points()).toBe(0);
  });

  test("on resolution P1 controls the Guard, it is exhausted and sits in P1's BASE — not in either player's hand; P2 still owns it", async () => {
    const game = await board().build();
    await game.p1.cast("con", { targets: "guard" });
    await game.settle();
    expect(game.zoneOf("con")).toBe("trash");
    expect(game.state("guard")).toMatchObject({ controller: P1, isExhausted: true, location: "base", owner: P2, zone: "base" });
    expect(game.p1.units("base")).toContain("guard");
    expect(game.p1.hand()).not.toContain("guard");
    expect(game.p2.hand()).not.toContain("guard");
    expect(game.p2.hand()).toEqual([]);
  });

  test("bf1 is now EMPTY and P1 never established control there: no Conquer, P1 scores nothing (and P2's control lapses — nobody holds it)", async () => {
    const game = await board().build();
    await game.p1.cast("con", { targets: "guard" });
    await game.settle();
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("it stays on P1's board: after a turn cycle it readies in P1's base and P1 can Standard-Move it onto the empty bf1 — THAT conquers and scores", async () => {
    const game = await board().build();
    await game.p1.cast("con", { targets: "guard" });
    await game.settle();
    await game.advanceTurn(); // → P2
    expect(game.state("guard")).toMatchObject({ controller: P1, location: "base" });
    await game.advanceTurn(); // → P1: Awaken readies it
    expect(game.state("guard")).toMatchObject({ controller: P1, isReady: true, location: "base" });
    await game.p1.move("guard", "bf1"); // throws if the Standard Move were illegal
    await game.settle();
    expect(game.locationOf("guard")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
