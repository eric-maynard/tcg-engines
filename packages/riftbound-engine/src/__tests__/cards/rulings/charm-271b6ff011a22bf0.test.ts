/**
 * Ruling 271b6ff011a22bf0 — Charm (OGN-043 → ogn-043-298) · [1][calm] · "Move an enemy unit."
 *
 * Q: Can Charm send an enemy unit back to its owner's base, or only from battlefield to battlefield?
 * A: To any legal location — the unit's own base included — just never to YOUR base: a unit can only
 *    ever be in the base of the player who controls it.
 *   Nuance: if a "can't move to base" effect applies, aiming Charm at the base whiffs ("can't" beats
 *   "can") but the unit is still a legal choice for the spell.
 * Rules: 355.4 / 190.5 (a unit's base is its controller's base), 359.3.e (an instruction that cannot
 *        be carried out simply does nothing), 302.2 ("can't" beats "can").
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";

/**
 * P1's turn with exactly [1][calm]. P2's 3-Might Pawn stands at bf1 (P2's battlefield); bf2 is open;
 * P1 keeps a unit of their own in base so "P1's base" is a real place that Charm still may not use.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Pawn" }, "pawn")
    .unit(P1, "base", { might: 1, name: "Homebody" }, "home")
    .hand(P1, CHARM, "charm");
}

describe("Ruling 271b6ff011a22bf0 — Charm may send an enemy unit to its own base, and never to yours", () => {
  test("Charm's only play-time choice is the enemy unit; the destination is asked when it resolves", async () => {
    const game = await board().build();
    const fields = game.p1.option("cast", "charm")?.fields ?? [];
    expect(fields.map((f) => f.name)).toEqual(["targets"]);
    expect((fields[0]?.options ?? []).flat()).toEqual(["pawn"]); // only the enemy unit
    await game.p1.cast("charm", { targets: "pawn" });
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  });

  test("ruling: the offered destinations are the Pawn's OWN base and the other battlefield — P1's base is not among them", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "pawn" });
    await game.settle();
    const d = game.decision();
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key).toSorted() : [];
    expect(keys).toEqual(["base", "battlefield-bf2"]);
    // Exactly one "base" entry exists: the unit can only go to its own controller's base.
    expect(keys.filter((k) => k.includes("base"))).toHaveLength(1);
  });

  test("…and choosing it works: the Pawn ends up in P2's base, not P1's", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "pawn" });
    await game.settle();
    await game.p1.pick("base");
    await game.settle();
    expect(game.zoneOf("pawn")).toBe("base");
    expect(game.locationOf("pawn")).toBe("base");
    expect(game.p2.base()).toContain("pawn");
    expect(game.p1.base()).not.toContain("pawn");
    expect(game.state("pawn")).toMatchObject({ controller: P2, owner: P2 });
    // Side-effect, not part of the ruling: with its last unit gone P2's hold on bf1 lapses (323.6).
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("the battlefield-to-battlefield use is equally available: the same Charm can send the Pawn to bf2 instead", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "pawn" });
    await game.settle();
    await game.p1.pick("battlefield-bf2");
    await game.settle();
    expect(game.locationOf("pawn")).toBe("bf2");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.violations()).toEqual([]);
  });
});
