/**
 * Ruling 767cfff50c11b834 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [2]
 *   "[Hidden] If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: If a stunned unit would die but is recalled by Zhonya's, does it keep the stunned status?
 * A: Yes — it is still stunned after the recall (Zhonya's heals, exhausts and recalls; it never died and nothing
 *    removes the stun, which only wears off at end of turn).
 * Rules: 366–371 (replacement: the unit never left play), 423.1.a.2 (stun lasts until the end of the turn), 427 (heal).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
/** Inline "[Action] Stun a unit." and "[Action] Deal 3 to a unit." for P1. */
const DAZE = {
  abilities: [{ effect: { target: { type: "unit" }, type: "stun" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 1,
  name: "Daze (inline)",
  rulesText: "[Action] Stun a unit.",
  timing: "action",
} as const;
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Bolt (inline)",
  rulesText: "[Action] Deal 3 to a unit.",
  timing: "action",
} as const;

/** P1's turn with [2]. P2 holds bf1 with a Guard (3) and a Holder (4); Zhonya's face up in P2's base. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "bf1", { might: 4, name: "Holder" }, "holder")
    .gear(P2, ZHONYAS, "zhonyas")
    .hand(P1, DAZE, "daze")
    .hand(P1, BOLT, "bolt");
}

describe("Ruling 767cfff50c11b834 — a stunned unit saved by Zhonya's is still stunned", () => {
  test("P1 stuns the Guard, then Bolts it for lethal: Zhonya's is killed instead and the Guard lands in P2's base healed, exhausted — and STILL stunned", async () => {
    const game = await board().build();
    await game.p1.cast("daze", { targets: "guard" });
    await game.settle();
    expect(game.state("guard")).toMatchObject({ isStunned: true, location: "bf1" });
    await game.p1.cast("bolt", { targets: "guard" });
    await game.settle();
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("base"); // recalled, never died
    expect(game.p2.trash()).not.toContain("guard");
    expect(game.state("guard")).toMatchObject({ damage: 0, isExhausted: true, isStunned: true, location: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("the stun then wears off normally at the end of the turn (not because of Zhonya's)", async () => {
    const game = await board().build();
    await game.p1.cast("daze", { targets: "guard" });
    await game.settle();
    await game.p1.cast("bolt", { targets: "guard" });
    await game.settle();
    expect(game.state("guard").isStunned).toBe(true);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("guard")).toMatchObject({ isStunned: false, location: "base" });
  });
});
