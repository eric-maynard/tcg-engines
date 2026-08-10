/**
 * Ruling f1723bfb8d84207b — Frigid Touch (SFD-066 → sfd-066-221) · Reaction · Mind · [2] · "[Repeat][2] Give a unit -2 [Might] this turn."
 *   × Discipline (OGN-058 → ogn-058-298) · Reaction · Calm · [2] · "Give a unit +2 [Might] this turn. Draw 1."
 *
 * Q: Does Frigid Touch kill units that are at 2 or 1 Might? How does negative Might interact with buffs like Discipline?
 * A: Frigid Touch never kills a unit. A unit whose Might would go below 0 is TREATED as 0, but the real (negative) value is
 *    kept for arithmetic: a 1-Might unit hit by two Frigid Touches is really -3 (shown as 0) and needs two Disciplines
 *    (+2 each) to get back to 1. Units don't die from 0/negative Might alone.
 * Rules: 143.2.a (killed only by nonzero damage ≥ Might), 143.2.b / 143.2.b.1 (negative Might treated as 0, but the actual
 *        value is used when calculating increases/decreases).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FRIGID_TOUCH = "sfd-066-221";
const DISCIPLINE = "ogn-058-298";

/** P1's turn, plenty of energy. P1's Sprout (1) and Pawn (2) in base; two Frigid Touches and two Disciplines in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 12 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 1, name: "Sprout" }, "sprout")
    .unit(P1, "base", { might: 2, name: "Pawn" }, "pawn")
    .hand(P1, FRIGID_TOUCH, "ft1")
    .hand(P1, FRIGID_TOUCH, "ft2")
    .hand(P1, DISCIPLINE, "disc1")
    .hand(P1, DISCIPLINE, "disc2");
}

async function castAndResolve(game: Game, spell: string, target: string): Promise<void> {
  await game.p1.cast(spell, { targets: target });
  await game.settle();
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf(spell)).toBe("trash");
}

describe("Ruling f1723bfb8d84207b — Frigid Touch never kills; negative Might reads as 0 but is tracked for later +Might", () => {
  test("a 2-Might unit hit by Frigid Touch drops to 0 Might and stays on the board (0 Might with no damage is not lethal)", async () => {
    const game = await board().build();
    await castAndResolve(game, "ft1", "pawn");
    expect(game.state("pawn").might).toBe(0);
    expect(game.zoneOf("pawn")).toBe("base");
    expect(game.state("pawn").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("a 1-Might unit hit by Frigid Touch (1 − 2 = −1) is TREATED as 0 Might and does not die", async () => {
    const game = await board().build();
    await castAndResolve(game, "ft1", "sprout");
    expect(game.state("sprout").might).toBe(0); // 143.2.b — never reported below 0
    expect(game.zoneOf("sprout")).toBe("base");
  });

  test("two Frigid Touches on the 1-Might unit: really −3, still shown as 0 and still alive; the modifier keeps the true arithmetic (−4)", async () => {
    const game = await board().build();
    await castAndResolve(game, "ft1", "sprout");
    await castAndResolve(game, "ft2", "sprout");
    expect(game.state("sprout").might).toBe(0);
    expect(game.state("sprout").mightModifier).toBe(-4); // 143.2.b.1 — the actual value is tracked
    expect(game.zoneOf("sprout")).toBe("base");
  });

  test("ONE Discipline after two Frigid Touches adds to the real −3, giving −1 → still shown as 0 (not 2)", async () => {
    const game = await board().build();
    await castAndResolve(game, "ft1", "sprout");
    await castAndResolve(game, "ft2", "sprout");
    await castAndResolve(game, "disc1", "sprout");
    expect(game.state("sprout").mightModifier).toBe(-2);
    expect(game.state("sprout").might).toBe(0);
    expect(game.zoneOf("sprout")).toBe("base");
  });

  test("the SECOND Discipline finally brings it back to 1 Might (1 − 2 − 2 + 2 + 2)", async () => {
    const game = await board().build();
    await castAndResolve(game, "ft1", "sprout");
    await castAndResolve(game, "ft2", "sprout");
    await castAndResolve(game, "disc1", "sprout");
    await castAndResolve(game, "disc2", "sprout");
    expect(game.state("sprout").mightModifier).toBe(0);
    expect(game.state("sprout").might).toBe(1);
    expect(game.zoneOf("sprout")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("'this turn' only and not snapshotted: at the next turn every modifier lapses and the Sprout is a plain 1 again, alive", async () => {
    const game = await board().build();
    await castAndResolve(game, "ft1", "sprout");
    await castAndResolve(game, "ft2", "sprout");
    await game.advanceTurn();
    expect(game.state("sprout")).toMatchObject({ might: 1, mightModifier: 0, zone: "base" });
  });
});
