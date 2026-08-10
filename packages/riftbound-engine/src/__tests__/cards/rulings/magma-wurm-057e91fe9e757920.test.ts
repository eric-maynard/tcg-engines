/**
 * Ruling 057e91fe9e757920 — Magma Wurm (OGN-011 → ogn-011-298) · [8][fury] · 8 Might · "Other friendly units enter ready."
 *
 * Q: Do all units already on the board become ready when I play Magma Wurm?
 * A: No. The ability is a passive that changes how friendly units ARRIVE from now on; it does not ready anything already on
 *    the board (those stay exhausted or ready as they were). Only units played after the Wurm enter ready.
 * Rules: 143.4 (permanents enter exhausted unless an effect says otherwise), 365 (passive abilities apply continuously while
 *        on the board — not retroactively), "Other" excludes the Wurm itself.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const MAGMA_WURM = "ogn-011-298";
const RECRUIT = { cardType: "unit", energyCost: 1, might: 1, name: "Latecomer" } as const;

/** P1's turn with [9][fury]. Board: an exhausted Tired unit and a ready Fresh unit in P1's base; P2 has an exhausted unit too. */
function board() {
  return scenario()
    .resources(P1, { energy: 9, power: { fury: 1 } })
    .unit(P1, "base", { might: 2, name: "Tired" }, "tired", { exhausted: true })
    .unit(P1, "base", { might: 2, name: "Fresh" }, "fresh")
    .unit(P2, "base", { might: 2, name: "Enemy Tired" }, "enemyTired", { exhausted: true })
    .hand(P1, MAGMA_WURM, "wurm")
    .hand(P1, RECRUIT, "late");
}

describe("Ruling 057e91fe9e757920 — Magma Wurm doesn't ready what's already there; it makes later friendly units enter ready", () => {
  test("playing the Wurm changes nothing on the board: Tired stays exhausted, Fresh stays ready, the enemy unit is untouched — and the Wurm itself ('Other') enters exhausted", async () => {
    const game = await board().build();
    expect(game.state("tired").isExhausted).toBe(true);
    expect(game.state("fresh").isReady).toBe(true);
    await game.p1.play("wurm");
    await game.settle();
    expect(game.zoneOf("wurm")).toBe("base");
    expect(game.p1.energy()).toBe(1);
    expect(game.state("tired").isExhausted).toBe(true); // NOT readied
    expect(game.state("fresh").isReady).toBe(true);
    expect(game.state("enemyTired").isExhausted).toBe(true);
    expect(game.state("wurm").isExhausted).toBe(true); // "Other friendly units" — not itself
    expect(game.violations()).toEqual([]);
  });

  test("a friendly unit played AFTER the Wurm enters ready (whereas without the Wurm it would enter exhausted)", async () => {
    const game = await board().build();
    await game.p1.play("wurm");
    await game.settle();
    await game.p1.play("late");
    await game.settle();
    expect(game.zoneOf("late")).toBe("base");
    expect(game.state("late").isReady).toBe(true);
    expect(game.state("tired").isExhausted).toBe(true); // still

    const noWurm = await scenario().resources(P1, { energy: 1 }).hand(P1, RECRUIT, "late").build();
    await noWurm.p1.play("late");
    await noWurm.settle();
    expect(noWurm.state("late").isExhausted).toBe(true);
  });
});
