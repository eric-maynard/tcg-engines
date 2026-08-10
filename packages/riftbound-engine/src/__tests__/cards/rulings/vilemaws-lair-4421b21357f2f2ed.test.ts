/**
 * Ruling 4421b21357f2f2ed — Vilemaw's Lair (OGN-295 → ogn-295-298) · Battlefield · "Units can't move from here to base."
 *   × Vilemaw (UNL-060 → unl-060-219) · 8 Might · [Ambush] · weaker enemies deal it no combat damage.
 *
 * Q: A showdown at Vilemaw's Lair ends with BOTH players still having units there. What happens to the attacker's
 *    units that would normally have to go back to base — the Lair says they can't move to base?
 * A: They are returned to base normally. The post-combat retreat is a RECALL, not a move, so the Lair's "can't move"
 *    restriction does not stop it.
 * Rules: 467.4 (surviving attackers that did not take the battlefield are recalled), 453 (recall is not a move),
 *        446 (move) — the Lair only restricts moves.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VILEMAWS_LAIR = "ogn-295-298";
const VILEMAW = "unl-060-219";

/**
 * P1's turn. P2 holds the Lair (live text) with a STUNNED 9-Might Wall (a stunned unit deals no combat damage,
 * and Vilemaw's own text stops weaker enemies anyway). P1's Vilemaw (8) is ready in base.
 * 8 damage on a 9-Might Wall does not kill it; the Wall deals nothing back → both survive.
 */
function board() {
  return scenario()
    .battlefield("lair", { controller: P2, def: VILEMAWS_LAIR, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "lair", { might: 9, name: "Wall" }, "wall", { stunned: true })
    .unit(P1, "base", VILEMAW, "vilemaw");
}

describe("Ruling 4421b21357f2f2ed — attackers that fail to take Vilemaw's Lair are still recalled to base (recall ≠ move)", () => {
  test("premise: while at the Lair a unit really cannot MOVE to base — the restriction is on the attacker once it arrives", async () => {
    const game = await board().build();
    await game.p1.move("vilemaw", "lair");
    expect(game.locationOf("vilemaw")).toBe("lair");
    expect(game.state("vilemaw").combatRole).toBe("attacker");
    expect(game.state("vilemaw").keywords).toContain("NoMoveToBase");
  });

  test("combat ends with both sides still standing (Wall 9 takes 8; stunned Wall deals 0) → P2 keeps the Lair and the attacking Vilemaw is RECALLED to P1's base despite 'can't move from here to base'", async () => {
    const game = await board().build();
    await game.p1.move("vilemaw", "lair");
    await game.settle();
    await game.settle();
    // Both survived the combat…
    expect(game.zoneOf("wall")).toBe("battlefield-lair");
    expect(game.has("vilemaw")).toBe(true);
    expect(game.zoneOf("vilemaw")).not.toBe("trash");
    // …the defender held, so the attacker was sent home — by recall, which the Lair does not restrict.
    expect(game.gameState.battlefields.lair).toMatchObject({ contested: false, controller: P2 });
    expect(game.zoneOf("vilemaw")).toBe("base");
    expect(game.p1.units("base")).toEqual(["vilemaw"]);
    expect(game.p1.units("lair")).toEqual([]);
    expect(game.p1.points()).toBe(0);
    // A recall is not a move: the per-turn move counter only recorded the attack itself.
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBeLessThanOrEqual(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("the same holds for a plain attacker: a 2-Might Poker into the stunned Wall survives, fails to conquer, and is recalled out of the Lair", async () => {
    const game = await scenario()
      .battlefield("lair", { controller: P2, def: VILEMAWS_LAIR, inert: false })
      .unit(P2, "lair", { might: 9, name: "Wall" }, "wall", { stunned: true })
      .unit(P1, "base", { might: 2, name: "Poker" }, "poker")
      .build();
    await game.p1.move("poker", "lair");
    expect(game.state("poker").keywords).toContain("NoMoveToBase");
    const r = await game.p1.try((p) => p.move("poker", "base")); // a real move home is refused…
    expect(r.ok).toBe(false);
    await game.settle();
    await game.settle();
    expect(game.zoneOf("wall")).toBe("battlefield-lair");
    expect(game.gameState.battlefields.lair?.controller).toBe(P2);
    expect(game.zoneOf("poker")).toBe("base"); // …but the post-combat recall is not
    expect(game.violations()).toEqual([]);
  });
});
