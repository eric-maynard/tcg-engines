/**
 * Ruling 002d2c99c96c1538 — Iron Ballista (OGN-017 → ogn-017-298) · Fury Gear · [3]
 *   "This enters exhausted. [Exhaust]: Deal 2 to a unit at a battlefield."
 *   (+ an inline [Deflect] unit — "[Deflect]: opponents must pay [rainbow] to choose me with a spell or ability".)
 *
 * Q: Does Ballista trigger Deflect?
 * A: Yes. Its [Exhaust] ability CHOOSES a specific unit, so picking a [Deflect] unit requires paying the Deflect power
 *    as an additional cost of activating the ability (no power ⇒ that unit is not a legal choice).
 * Rules: 809.1 (Deflect surcharge for spells AND abilities that choose the unit), 355.5 (choosing = targeting),
 *        366 / 377 (activated abilities: costs paid on activation).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const IRON_BALLISTA = "ogn-017-298";

/** P1's turn with a READY Ballista and `power` fury. P2 holds bf1 with a plain Victim (3) and a [Deflect] Deflector (3). */
function board(power: number) {
  return scenario()
    .resources(P1, { energy: 0, power: { fury: power } })
    .battlefield("bf1", { controller: P2 })
    .gear(P1, IRON_BALLISTA, "ballista")
    .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim")
    .unit(P2, "bf1", { keywords: ["Deflect"], might: 3, name: "Deflector" }, "deflector");
}

const targetField = (game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>) =>
  game.p1.option("activate", "ballista")?.fields.find((f) => f.name === "targets");

describe("Ruling 002d2c99c96c1538 — Iron Ballista's [Exhaust] chooses a unit, so [Deflect] applies to it", () => {
  test("baseline: on a plain unit the only cost is exhausting the Ballista; the ability goes on the chain and deals 2", async () => {
    const game = await board(0).build();
    await game.p1.activate("ballista", undefined, { targets: "victim" });
    expect(game.state("ballista").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ballista", targets: ["victim"], type: "ability" })]);
    await game.settle();
    expect(game.state("victim").damage).toBe(2);
    expect(game.p1.power()).toBe(0);
  });

  test("with NO power for the surcharge the Deflector is not offered as a choice and forcing it fails — the Ballista stays ready, nothing on the chain", async () => {
    const game = await board(0).build();
    expect(targetField(game)?.options).toEqual([["victim"]]);
    const r = await game.p1.try((p) => p.activate("ballista", undefined, { targets: "deflector" }));
    expect(r.ok).toBe(false);
    expect(game.state("ballista").isExhausted).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.state("deflector").damage).toBe(0);
  });

  test("with 1 power the Deflector IS a legal choice; choosing it PAYS that power as an additional activation cost (plus the exhaust), then it takes 2", async () => {
    const game = await board(1).build();
    expect(targetField(game)?.options).toEqual(expect.arrayContaining([["victim"], ["deflector"]]));
    await game.p1.activate("ballista", undefined, { targets: "deflector" });
    expect(game.p1.power("fury")).toBe(0); // Deflect paid up front
    expect(game.state("ballista").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ballista", targets: ["deflector"] })]);
    expect(game.state("deflector").damage).toBe(0); // still on the chain
    await game.settle();
    expect(game.state("deflector").damage).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("choosing the plain Victim while holding power does NOT spend it — the surcharge is only for choosing the Deflect unit", async () => {
    const game = await board(1).build();
    await game.p1.activate("ballista", undefined, { targets: "victim" });
    expect(game.p1.power("fury")).toBe(1);
    await game.settle();
    expect(game.state("victim").damage).toBe(2);
    expect(game.p1.power("fury")).toBe(1);
  });
});
