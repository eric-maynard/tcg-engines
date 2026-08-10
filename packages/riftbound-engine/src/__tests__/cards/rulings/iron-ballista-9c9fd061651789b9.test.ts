/**
 * Ruling 9c9fd061651789b9 — Iron Ballista (OGN-017 → ogn-017-298) · Gear [3] · "This enters exhausted. [Exhaust]: Deal 2 to a
 *   unit at a battlefield."   × Unyielding Spirit (OGN-145 → ogn-145-298) · Reaction [1][body] · "Prevent all spell and ability
 *   damage this turn."   (+ an inline [Deflect] unit.)
 *
 * Q: Does Iron Ballista's damage count as ability damage for Unyielding Spirit and Deflect?
 * A: Yes — it is ability damage, so Unyielding Spirit prevents it. And choosing a [Deflect] unit with it requires paying the
 *    Deflect power cost, because you are choosing that unit with an ability.
 * Rules: 366 (activated abilities), 437.3 (damage from an ability), 809 (Deflect: pay [rainbow] to choose with a spell OR
 *        ability), Unyielding Spirit's prevention.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const IRON_BALLISTA = "ogn-017-298";
const UNYIELDING_SPIRIT = "ogn-145-298";

/** P1's turn, Ballista ready in base. P2: 3-Might Victim and a 3-Might [Deflect] unit at P2's bf1, Unyielding Spirit + [1][body]. */
function board(p1Power: number) {
  return scenario()
    .resources(P1, { energy: 0, power: { fury: p1Power } })
    .resources(P2, { energy: 1, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .gear(P1, IRON_BALLISTA, "ballista")
    .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim")
    .unit(P2, "bf1", { keywords: ["Deflect"], might: 3, name: "Deflector" }, "deflector")
    .hand(P2, UNYIELDING_SPIRIT, "spirit");
}

describe("Ruling 9c9fd061651789b9 — Iron Ballista deals ABILITY damage", () => {
  test("baseline: Ballista's [Exhaust] puts an ability on the chain and deals 2 to the Victim when it resolves", async () => {
    const game = await board(0).build();
    await game.p1.activate("ballista", undefined, { targets: "victim" });
    expect(game.state("ballista").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ballista", targets: ["victim"], triggered: false, type: "ability" })]);
    await game.settle();
    expect(game.state("victim").damage).toBe(2);
  });

  test("Unyielding Spirit cast in response prevents it: the ability resolves but the Victim takes 0", async () => {
    const game = await board(0).build();
    await game.p1.activate("ballista", undefined, { targets: "victim" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "spirit")).toBe(true);
    await game.p2.cast("spirit");
    expect(game.chain().map((c) => c.cardId)).toEqual(["ballista", "spirit"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("spirit")).toBe("trash");
    expect(game.state("victim")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("ballista").isExhausted).toBe(true); // the cost stayed paid
    expect(game.violations()).toEqual([]);
  });

  test("Deflect: with no power to pay the surcharge the Deflect unit is not a legal choice for the Ballista at all", async () => {
    const game = await board(0).build();
    const targets = game.p1.option("activate", "ballista")?.fields.find((f) => f.name === "targets");
    expect(targets?.options).toEqual([["victim"]]);
    const r = await game.p1.try((p) => p.activate("ballista", undefined, { targets: "deflector" }));
    expect(r.ok).toBe(false);
    expect(game.state("ballista").isExhausted).toBe(false);
    expect(game.chain()).toEqual([]);
  });

  test("Deflect: with 1 power available the Deflect unit IS choosable, and choosing it spends that power on top of exhausting the Ballista; it then takes 2", async () => {
    const game = await board(1).build();
    const targets = game.p1.option("activate", "ballista")?.fields.find((f) => f.name === "targets");
    expect(targets?.options).toEqual(expect.arrayContaining([["victim"], ["deflector"]]));
    await game.p1.activate("ballista", undefined, { targets: "deflector" });
    expect(game.p1.power("fury")).toBe(0);
    expect(game.state("ballista").isExhausted).toBe(true);
    await game.settle();
    expect(game.state("deflector").damage).toBe(2);
  });
});
