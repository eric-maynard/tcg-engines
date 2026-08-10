/**
 * Ruling a5d28fb30ba4b827 — Altar to Unity (OGN-275 → ogn-275-298) · Battlefield · "When you hold here, play a 1 [Might]
 *     Recruit unit token in your base."
 *   × Herald of the Arcane (OGN-265 → ogn-265-298) · Legend · "[1], [Exhaust]: Play a 1 [Might] Recruit unit token."
 *
 * Q: When Altar to Unity's hold effect or Herald of the Arcane's ability creates a Recruit token, does it enter ready or
 *    exhausted?
 * A: Exhausted. Token units enter play exhausted like any played unit unless the effect explicitly says the token enters
 *    ready; neither of these does.
 * Rules: 140.3 / 359.2.c (units enter the board exhausted), 187 (Recruit token), 350.2 (an effect that "plays" a token
 *        plays it), 471.2 (hold effects in the Beginning Phase).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ALTAR_TO_UNITY = "ogn-275-298";
const HERALD_OF_THE_ARCANE = "ogn-265-298";

const tokensOf = (game: Game, seat: "p1" | "p2") => game[seat].units().filter((id) => game.state(id).isToken);

describe("Ruling a5d28fb30ba4b827 — Recruit tokens from Altar to Unity / Herald of the Arcane enter EXHAUSTED", () => {
  test("Herald of the Arcane: [1] + exhaust the legend → one 1-Might Recruit unit token in P1's base, and it is exhausted (not ready)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: null })
      .legend(P1, HERALD_OF_THE_ARCANE, "herald")
      .build();
    expect(tokensOf(game, "p1")).toEqual([]);
    expect(game.p1.can("activate", "herald")).toBe(true);
    await game.p1.activate("herald");
    expect(game.p1.energy()).toBe(0);
    expect(game.state("herald").isExhausted).toBe(true);
    await game.settle();
    const toks = tokensOf(game, "p1");
    expect(toks).toHaveLength(1);
    const recruit = game.state(toks[0]!);
    expect(recruit).toMatchObject({ cardType: "unit", controller: P1, isToken: true, location: "base", might: 1, name: "Recruit" });
    expect(recruit.isExhausted).toBe(true);
    expect(recruit.isReady).toBe(false);
    // Consequence: it cannot be walked anywhere this turn.
    const movers = game.p1
      .legal()
      .filter((o) => o.moveId === "standardMove")
      .flatMap((o) => o.variants)
      .flatMap((v) => Object.values(v.params).flat().map(String));
    expect(movers).not.toContain(toks[0]!);
    expect(game.violations()).toEqual([]);
  });

  test("Altar to Unity: P1 holds it through their Beginning Phase (scores 1) → the hold trigger plays a Recruit token into P1's BASE, exhausted", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("altar", { controller: P1, def: ALTAR_TO_UNITY, inert: false, owner: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "altar", { might: 2, name: "Holder" }, "holder")
      .build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "altar", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.phase()).toBe("main");
    const toks = tokensOf(game, "p1");
    expect(toks).toHaveLength(1);
    const recruit = game.state(toks[0]!);
    expect(recruit).toMatchObject({ cardType: "unit", controller: P1, isToken: true, location: "base", might: 1, name: "Recruit" });
    expect(recruit.isExhausted).toBe(true); // created in the Beginning Phase AFTER the Awaken step readied everything — it stays exhausted
    expect(recruit.isReady).toBe(false);
    expect(game.state("holder").isReady).toBe(true); // contrast: the pre-existing unit was readied by Awaken
    expect(game.cardsAt("battlefield-altar")).toEqual(["holder"]); // token is in base, not "here"
    expect(game.violations()).toEqual([]);
  });

  test("contrast — a unit PLAYED FROM HAND enters exhausted too (same default); nothing about tokens makes them readier", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: null })
      .hand(P1, { cardType: "unit", energyCost: 2, might: 2, name: "Grunt" }, "grunt")
      .build();
    await game.p1.play("grunt");
    await game.settle();
    expect(game.state("grunt")).toMatchObject({ isExhausted: true, location: "base" });
  });
});
