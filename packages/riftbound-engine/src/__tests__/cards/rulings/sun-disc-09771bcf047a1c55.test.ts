/**
 * Ruling 09771bcf047a1c55 — Sun Disc (OGN-021 → ogn-021-298) · Gear · Fury · [2][fury]
 *     "[Exhaust]: [Legion] — The next unit you play this turn enters ready. (Get the effect if you've played another card
 *      this turn.)"
 *
 * Q: Does gear enter ready or exhausted?
 * A: Ready, unless the card says otherwise — and gear enters the BASE (not a battlefield). Applies to Sun Disc, seals, etc.
 * Rules: 143.4 (only UNITS enter exhausted), 154/718 (gear is played to its controller's base).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SUN_DISC = "ogn-021-298";
const SEAL = { cardType: "gear", domain: "fury", energyCost: 1, name: "Test Seal" }; // a vanilla "seal"-style gear

/** P1's turn with [4][fury]; P1 controls bf1 (Holder there) so a battlefield destination would exist if gear could use one. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .hand(P1, SUN_DISC, "disc")
    .hand(P1, SEAL, "seal")
    .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Recruitling" }, "unit1")
    .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Recruitling II" }, "unit2");
}

describe("Ruling 09771bcf047a1c55 — gear enters READY, in the base", () => {
  test("Sun Disc: played for [2][fury] it lands in P1's BASE and is READY (not exhausted); no destination is even asked — gear has no 'to' choice", async () => {
    const game = await board().build();
    expect(game.p1.option("play", "disc")?.fields.some((f) => f.arg === "to") ?? false).toBe(false);
    await game.p1.play("disc");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 0 } });
    expect(game.zoneOf("disc")).toBe("base");
    expect(game.locationOf("disc")).toBe("base");
    expect(game.state("disc")).toMatchObject({ isExhausted: false, isReady: true, zone: "base" });
    expect(game.p1.gear()).toContain("disc");
    expect(game.violations()).toEqual([]);
  });

  test("because it is ready, its [Exhaust] ability is usable the very turn it is played: play a unit (enters exhausted; Legion now on), exhaust the Disc, and the NEXT unit played enters READY", async () => {
    const game = await board().build();
    await game.p1.play("disc");
    await game.settle();
    expect(game.state("disc").isReady).toBe(true);
    await game.p1.play("unit1", { to: "base" });
    await game.settle();
    expect(game.state("unit1").isExhausted).toBe(true);
    expect(game.p1.can("activate", "disc")).toBe(true);
    await game.p1.activate("disc");
    await game.settle();
    expect(game.state("disc").isExhausted).toBe(true);
    await game.p1.play("unit2", { to: "base" });
    await game.settle();
    expect(game.state("unit2")).toMatchObject({ isReady: true, zone: "base" });
    expect(game.p1.energy()).toBe(0);
  });

  test("contrast: a UNIT played normally enters exhausted — that default is for units only", async () => {
    const game = await board().build();
    await game.p1.play("unit1", { to: "base" });
    await game.settle();
    expect(game.state("unit1").isExhausted).toBe(true);
  });

  test("same for a plain seal-style gear: enters the base ready", async () => {
    const game = await board().build();
    await game.p1.play("seal");
    await game.settle();
    expect(game.state("seal")).toMatchObject({ isReady: true, zone: "base" });
    expect(game.p1.gear().sort()).toEqual(["seal"]);
  });
});
