/**
 * Ruling c99071e18d0fc359 — Gust (ogn-169-298) × Ravenbloom Student (ogn-103-298)
 *   Gust — [Reaction] · [1] chaos: "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   Ravenbloom Student — Unit · Mind · 2 Might: "When you play a spell, give me +1 [Might] this turn."
 *
 * Q: I Gust my OWN Student that is already at 3 Might. Does its +1 (→ 4, out of Gust's range) happen before Gust
 *    resolves, or does Gust resolve first and bounce it?
 * A: Gust resolves first and returns the Student to hand. A spell is only "played" once it resolves, so the
 *    Student's play-a-spell trigger cannot fire before Gust's effect; it never reaches 4 Might.
 * Rules: 350.1 / 419.4.a (played = finished resolving; play-triggers fire then), 355.9 (legality rechecked on
 *        resolution — still 3).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";
/** Cheap inline [Action] spell aimed elsewhere, to show the Student's +1 trigger normally works. */
const SPARK = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Spark",
  timing: "action",
} as const;

/** P1's turn. P1's Student sits at P1's bf1 already buffed to 3 Might; a dummy at bf1 too; Gust + Spark in hand, [2]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", RAVENBLOOM_STUDENT, "student", { buffed: true })
    .unit(P1, "bf1", { might: 5, name: "Dummy" }, "dummy")
    .hand(P1, GUST, "gust")
    .hand(P1, SPARK, "spark");
}

describe("Ruling c99071e18d0fc359 — Gust on your own 3-Might Ravenbloom Student bounces it before its +1 can trigger", () => {
  test("premise: the buffed Student is at exactly 3 Might, and playing some OTHER spell does give it +1 (→ 4) once that spell has resolved", async () => {
    const game = await board().build();
    expect(game.state("student").might).toBe(3);
    await game.p1.cast("spark", { targets: "dummy" });
    expect(game.state("student").might).toBe(3); // on the chain ≠ played yet
    await game.settle();
    expect(game.state("dummy").damage).toBe(1);
    expect(game.state("student").might).toBe(4);
    expect(game.state("student").mightModifier).toBe(1);
  });

  test("Gust targeting the 3-Might Student is legal; while Gust is on the chain the Student is still 3 (no trigger has fired)", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "gust")).toBe(true);
    const offered = (game.p1.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("student");
    expect(offered).not.toContain("dummy"); // 5 Might — out of range
    await game.p1.cast("gust", { targets: "student" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gust", targets: ["student"] })]);
    expect(game.state("student").might).toBe(3);
    expect(game.chain()).toHaveLength(1); // no Student trigger stacked on top
  });

  test("Gust resolves first: the Student goes back to P1's hand (never reached 4 Might on the board); Gust to trash", async () => {
    const game = await board().build();
    await game.p1.cast("gust", { targets: "student" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("student")).toBe("hand");
    expect(game.p1.hand()).toContain("student");
    expect(game.p1.units("bf1")).toEqual(["dummy"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
