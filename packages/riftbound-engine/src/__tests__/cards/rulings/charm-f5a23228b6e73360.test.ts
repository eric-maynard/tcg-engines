/**
 * Ruling f5a23228b6e73360 — Charm (OGN-043 → ogn-043-298) · Spell · Calm · [1][calm]
 *   "Move an enemy unit."
 *
 * Q: What happens if an effect would move a unit into an OPPONENT's base?
 * A: It cannot happen — a player's base is not a legal location for another player's unit, so such a move is
 *    simply not among the destinations. Charm can only send the enemy unit to a battlefield or back to ITS
 *    OWN controller's base. Nothing is recalled or destroyed; the situation just never arises.
 * Rules: 355.4 (a move names a legal destination), 190/323 (locations: each player's base and the
 *        battlefields), 359.3.e.5 (an instruction with no legal destination does nothing).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";

/** P1's turn with Charm in hand and P2's Raider standing at bf1; bf2 is a second, empty battlefield. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Raider" }, "raider")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "homebody")
    .hand(P1, CHARM, "charm");
}

describe("Ruling f5a23228b6e73360 — Charm can never park an enemy unit in P1's base", () => {
  test("premise: the Raider is P2's and currently at bf1", async () => {
    const game = await board().build();
    expect(game.state("raider").controller).toBe(P2);
    expect(game.locationOf("raider")).toBe("bf1");
  });

  test("ruling: the destination menu offers battlefields and the unit's OWN base — never a base belonging to P1", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "raider" });
    const d = game.decision() as Extract<Decision, { kind: "pick" }>;
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    const keys = d.options.map((o) => o.zone ?? o.key).toSorted();
    expect(keys).toEqual(["base", "battlefield-bf2"]);
    expect(keys.some((k) => String(k).includes(P1))).toBe(false);
  });

  test("…and choosing 'base' sends it to P2's base, not P1's", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "raider" });
    await game.p1.pick("base");
    await game.settle();
    expect(game.locationOf("raider")).toBe("base");
    expect(game.p2.base()).toContain("raider");
    expect(game.p1.base()).not.toContain("raider");
    expect(game.state("raider")).toMatchObject({ controller: P2, owner: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("moving it to the other battlefield works normally (nothing about the ruling forbids that)", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "raider" });
    await game.p1.pick("bf2");
    await game.settle();
    expect(game.locationOf("raider")).toBe("bf2");
    expect(game.state("raider").controller).toBe(P2);
  });

  test("an enemy unit already in ITS OWN base is likewise only ever offered battlefields — no P1 base among them", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "homebody" });
    const d = game.decision() as Extract<Decision, { kind: "pick" }>;
    const keys = d.options.map((o) => o.zone ?? o.key).toSorted();
    expect(keys).toEqual(["battlefield-bf1", "battlefield-bf2"]);
    await game.p1.pick("bf2");
    await game.settle();
    expect(game.locationOf("homebody")).toBe("bf2");
    expect(game.p1.base()).not.toContain("homebody");
    expect(game.violations()).toEqual([]);
  });
});
