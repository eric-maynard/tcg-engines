/**
 * Ruling 48f43ad476d48972 — Piercing Light (SFD-023 → sfd-023-221) · [2][fury] · [Repeat] [2][fury]
 *   "Deal 2 to a unit at a battlefield, then deal 2 to up to one other unit."
 *
 * Q: Player A has one Sand Soldier at a battlefield and three in base. Player B casts Piercing Light with
 *    Repeat and names the battlefield Sand Soldier for BOTH executions. Does the spell stop working after
 *    the first execution kills it?
 * A: No. Repeat is one resolution that runs the instructions twice; no Cleanup happens in between, so the
 *    unit is still on the board for the second execution and takes that damage too. Only when the whole
 *    spell has finished resolving does the Cleanup send lethally-damaged units to the trash.
 * Rules: 746.1.d / 820 (Repeat = one more execution of the same item), 323 (Cleanup — and therefore
 *        deaths — happens after the resolution, not between executions), 437 (damage is marked).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const PIERCING_LIGHT = "sfd-023-221";

/**
 * P2's turn: P2 casts with exactly base + Repeat ([4] + 2 fury). P1 (the Sand Soldier player) has one
 * soldier at bf1 and three at home. `frontMight` decides how visible the second execution is.
 */
function board(frontMight: number) {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 4, power: { fury: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: frontMight, name: "Sand Soldier" }, "front")
    .unit(P1, "base", { might: 2, name: "Sand Soldier" }, "home1")
    .unit(P1, "base", { might: 2, name: "Sand Soldier" }, "home2")
    .unit(P1, "base", { might: 2, name: "Sand Soldier" }, "home3")
    .hand(P2, PIERCING_LIGHT, "pl");
}

describe("Ruling 48f43ad476d48972 — a repeated Piercing Light aimed twice at the same unit still lands twice", () => {
  test("the engine offers naming the battlefield unit for both executions (and the 'up to one other' may be skipped)", async () => {
    const game = await board(3).build();
    const variants = (game.p2.option("cast", "pl")?.variants ?? [])
      .filter((v) => (v.params as { repeatCount?: number }).repeatCount === 1)
      .map((v) => ((v.params as { targets?: string[] }).targets ?? []).map(String));
    expect(variants).toContainEqual(["front", "front"]);
  });

  test("ruling 48f43ad476d48972 — proof that the second execution lands: a 3-Might unit named twice takes 2 + 2 = 4 and dies (one hit alone would not kill it)", async () => {
    const game = await board(3).build();
    await game.p2.cast("pl", { repeat: 1, targets: ["front", "front"] });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toHaveLength(1); // one chain item resolving twice
    await game.settle();
    expect(game.zoneOf("front")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("contrast: a single (un-repeated) Piercing Light leaves the same 3-Might unit alive with 2 damage", async () => {
    const game = await board(3).build();
    await game.p2.cast("pl", { targets: "front" });
    await game.settle();
    expect(game.state("front")).toMatchObject({ damage: 2, might: 3, zone: "battlefield-bf1" });
  });

  test("the question as asked — a 2-Might Sand Soldier named twice: the first hit is already lethal, the spell does NOT stop, and the three at home are untouched", async () => {
    const game = await board(2).build();
    await game.p2.cast("pl", { repeat: 1, targets: ["front", "front"] });
    await game.settle();
    expect(game.zoneOf("front")).toBe("trash");
    expect(game.zoneOf("pl")).toBe("trash");
    for (const id of ["home1", "home2", "home3"]) {
      expect(game.state(id)).toMatchObject({ damage: 0, zone: "base" });
    }
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });
});
