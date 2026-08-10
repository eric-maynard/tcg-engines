/**
 * Ruling 294ce2242c0e87ba — Marching Orders (SFD-114 → sfd-114-221) · Spell · Body · [3] · [Action] · [Repeat] [3]
 *     "Choose a friendly unit anywhere and an enemy unit at a battlefield. They deal damage equal to their Mights to
 *      each other."
 *
 * Q: My 3-Might unit in base; opponent has two 3-Might units at a battlefield. I play Marching Orders repeated, pairing my
 *    unit with each enemy in turn. Do both enemy units die?
 * A: Yes — all THREE die. Not because of a cleanup between the two executions (there is none while a spell resolves), but
 *    because damage just accumulates: exchange 1 marks 3 on mine and 3 on enemy A; exchange 2 marks 3 more on mine (6) and 3
 *    on enemy B; only after the spell has fully resolved are units with lethal damage killed, simultaneously.
 * Rules: 157.3 / 319–323 (no cleanup mid-resolution; deaths at the cleanup after the spell leaves the chain), 143.2.a
 *        (damage ≥ Might ⇒ killed), 820 (Repeat = one spell executing its effect twice, 820.2.a own choices per execution).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const MARCHING_ORDERS = "sfd-114-221";

/** P1's turn with [6] (3 + Repeat 3). Mine (3) in P1's base; P2 holds bf1 with A (3) and B (3). */
function board(energy = 6) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 3, name: "Mine" }, "mine")
    .unit(P2, "bf1", { might: 3, name: "Enemy A" }, "foeA")
    .unit(P2, "bf1", { might: 3, name: "Enemy B" }, "foeB")
    .hand(P1, MARCHING_ORDERS, "mo");
}

describe("Ruling 294ce2242c0e87ba — repeated Marching Orders: my 3 fights both enemy 3s; all three die together after the spell resolves", () => {
  test("cast with Repeat paid, pairing [mine, A] then [mine, B]: 6 energy, ONE chain item, and no damage on anyone while it is still on the chain", async () => {
    const game = await board().build();
    await game.p1.cast("mo", { repeat: 1, targets: ["mine", "foeA", "mine", "foeB"] });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "mo", controller: P1, triggered: false });
    expect(game.state("mine").damage).toBe(0);
    expect(game.state("foeA").damage).toBe(0);
    expect(game.state("foeB").damage).toBe(0);
  });

  test("on resolution both exchanges happen with my unit still standing (no cleanup in between) — so enemy B IS hit — and then Mine (6 ≥ 3), A (3) and B (3) are all killed", async () => {
    const game = await board().build();
    await game.p1.cast("mo", { repeat: 1, targets: ["mine", "foeA", "mine", "foeB"] });
    await game.settle();
    expect(game.zoneOf("mo")).toBe("trash");
    expect(game.zoneOf("foeA")).toBe("trash");
    expect(game.zoneOf("foeB")).toBe("trash"); // would have survived untouched if Mine had died between the executions
    expect(game.zoneOf("mine")).toBe("trash");
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — a single (un-repeated) cast [mine, A]: Mine and A trade (3 each, both die), B is untouched", async () => {
    const game = await board(3).build();
    await game.p1.cast("mo", { targets: ["mine", "foeA"] });
    await game.settle();
    expect(game.zoneOf("mine")).toBe("trash");
    expect(game.zoneOf("foeA")).toBe("trash");
    expect(game.state("foeB")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
  });
});
