/**
 * Ruling f2286bc4e5714901 — Anivia, Primal (OGN-148 → ogn-148-298) · 8 Might · "When I attack, deal 3 to all enemy
 *   units here."  × Fight or Flight (OGN-168 → ogn-168-298) · [Hidden] [Action] "Move a unit from a battlefield to its base."
 *
 * Q: Anivia attacks a battlefield where the opponent has a hidden Fight or Flight. Does Anivia's trigger happen before
 *    Fight or Flight can take effect?
 * A: Anivia's trigger goes on the chain first, which gives the opponent a Reaction window to flip Fight or Flight on
 *    Anivia. FoF resolves first (LIFO) and moves Anivia away; Anivia's trigger then still resolves but does nothing,
 *    because "here" no longer has Anivia / the enemy units are not where she is.
 * Rules: 383.4.e (attack triggers), 811 (hidden → played as a Reaction for [0]), 340.1 (LIFO), 359.3.e (resolve as
 *        much as possible / "here" re-evaluated on resolution).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ANIVIA = "ogn-148-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";

/** P1's turn. P2 holds bf1 with a 4-Might Guard and has Fight or Flight face down there; P2 also has a unit at home. */
function board() {
  return scenario()
    .turn(3)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 2, name: "Homebody" }, "home")
    .facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof")
    .unit(P1, "base", ANIVIA, "anivia");
}

describe("Ruling f2286bc4e5714901 — hidden Fight or Flight answers Anivia's attack trigger; the trigger then resolves to no effect", () => {
  test("Anivia attacks: her 'When I attack' trigger is on the chain BEFORE anything is dealt, and P2 gets a Reaction window in which the hidden Fight or Flight is playable on Anivia", async () => {
    const game = await board().build();
    await game.p1.move("anivia", "bf1");
    expect(game.state("anivia").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "anivia", controller: P1, triggered: true })]);
    expect(game.state("guard").damage).toBe(0); // nothing dealt yet
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("reveal", "fof")).toBe(true);
    await game.p2.reveal("fof", { answers: ["anivia"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["anivia", "fof"]);
    expect(game.p2.energy()).toBe(0); // played from hidden for [0]
  });

  test("LIFO: Fight or Flight resolves first and sends Anivia to base; Anivia's trigger then resolves and deals nothing (no enemy unit is 'here' with her) — Guard unhurt, no combat, P2 keeps bf1", async () => {
    const game = await board().build();
    await game.p1.move("anivia", "bf1");
    await game.p1.passPriority();
    await game.p2.reveal("fof", { answers: ["anivia"] });
    // Resolve FoF only.
    for (let i = 0; i < 4 && game.zoneOf("fof") !== "trash"; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.locationOf("anivia")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["anivia"]); // the trigger is still there — it is not removed
    expect(game.state("guard").damage).toBe(0);

    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("guard")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("home")).toMatchObject({ damage: 0, zone: "base" }); // "here" is not "wherever Anivia now is" for enemy bases
    expect(game.state("anivia")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: if P2 does not answer, Anivia's trigger deals 3 to the Guard", async () => {
    const game = await board().build();
    await game.p1.move("anivia", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("guard").damage).toBe(3);
  });
});
