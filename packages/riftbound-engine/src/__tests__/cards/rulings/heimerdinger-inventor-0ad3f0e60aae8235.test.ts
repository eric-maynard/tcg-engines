/**
 * Ruling 0ad3f0e60aae8235 — Heimerdinger, Inventor (OGN-111 → ogn-111-298) · Champion Unit · Mind · 3 + [M] · 3
 *   "I have all [Exhaust] abilities of all friendly legends, units, and gear."
 *   × Ravenborn Tome (OGN-032 → ogn-032-298) Gear "[Exhaust]: The next spell you play this turn deals 1 Bonus Damage."
 *
 * Q: With multiple Heimerdingers in play, do they grant abilities to each other — infinite loop?
 * A: Each Heimerdinger has the [Exhaust] abilities of the other friendly cards (Tome, the other Heimer),
 *    but it does not matter: exhausting a Heimerdinger activates exactly ONE ability, so duplicate copies
 *    have no gameplay effect and nothing loops.
 * Rules: [Exhaust] as a cost (the activating permanent exhausts), activated abilities one at a time.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HEIMERDINGER = "ogn-111-298";
const RAVENBORN_TOME = "ogn-032-298";
const HEXTECH_RAY = "ogn-009-298"; // [Action] 1 + [fury]: Deal 3 to a unit at a battlefield.

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1: two ready Heimerdingers + Ravenborn Tome in base, two Hextech Rays funded. P2: two 4-Might units at bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", HEIMERDINGER, "h1")
    .unit(P1, "base", HEIMERDINGER, "h2")
    .gear(P1, RAVENBORN_TOME, "tome")
    .unit(P2, "bf1", { might: 4, name: "Four" }, "four")
    .unit(P2, "bf1", { might: 4, name: "Other Four" }, "four2")
    .hand(P1, HEXTECH_RAY, "ray1")
    .hand(P1, HEXTECH_RAY, "ray2");
}

/** Source cards behind `heimer`'s activate options. */
function sources(game: Game, heimer: string): string[] {
  return game.p1
    .legal()
    .filter((o) => o.moveId === "activateAbility" && o.card === heimer)
    .flatMap((o) => o.variants.map((v) => String(v.params.sourceCardId)));
}

describe("Ruling 0ad3f0e60aae8235 — two Heimerdingers + Ravenborn Tome: no loop, one ability per exhaust", () => {
  test("the position builds and enumerates a FINITE legal menu; each Heimerdinger offers the Tome's [Exhaust] ability", async () => {
    const game = await board().build();
    const menu = game.p1.legal();
    expect(menu.length).toBeLessThan(50); // no runaway duplication
    expect(sources(game, "h1")).toContain("tome");
    expect(sources(game, "h2")).toContain("tome");
    // Whatever the other Heimerdinger contributes, it is at most more copies of the same thing.
    for (const s of [...sources(game, "h1"), ...sources(game, "h2")]) {
      expect(["tome", "h1", "h2"]).toContain(s);
    }
    expect(game.violations()).toEqual([]);
  });

  test("exhausting Heimer 1 for the Tome's ability exhausts ONLY Heimer 1 (Tome and Heimer 2 stay ready) and arms exactly one Bonus Damage: the next Hextech Ray deals 3 + 1 = 4", async () => {
    const game = await board().build();
    await game.p1.activate("h1", 0, { source: "tome" });
    await game.settle();
    expect(game.state("h1").isExhausted).toBe(true);
    expect(game.state("h2").isExhausted).toBe(false);
    expect(game.state("tome").isExhausted).toBe(false);
    // Heimer 1 is spent: it offers nothing more — one ability per exhaust, however many copies it "has".
    expect(sources(game, "h1")).toEqual([]);

    await game.p1.cast("ray1", { targets: "four" });
    await game.settle();
    expect(game.zoneOf("four")).toBe("trash"); // 3 + 1 bonus ≥ 4
    // Only the NEXT spell: a second Ray is back to 3.
    await game.p1.cast("ray2", { targets: "four2" });
    await game.settle();
    expect(game.zoneOf("four2")).toBe("battlefield-bf1");
    expect(game.state("four2").damage).toBe(3);
  });

  test("the copies are independent uses, not a loop: Heimer 2 and then the Tome itself can each still be exhausted once for the same ability", async () => {
    const game = await board().build();
    await game.p1.activate("h1", 0, { source: "tome" });
    await game.settle();
    expect(sources(game, "h2")).toContain("tome");
    await game.p1.activate("h2", 0, { source: "tome" });
    await game.settle();
    expect(game.state("h2").isExhausted).toBe(true);
    expect(game.state("tome").isExhausted).toBe(false);
    expect(game.p1.can("activate", "tome")).toBe(true);
    await game.p1.activate("tome", 0);
    await game.settle();
    expect(game.state("tome").isExhausted).toBe(true);
    // Everything is exhausted now — no activations remain; the menu is still finite and sane.
    expect(game.p1.legal().some((o) => o.moveId === "activateAbility")).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
