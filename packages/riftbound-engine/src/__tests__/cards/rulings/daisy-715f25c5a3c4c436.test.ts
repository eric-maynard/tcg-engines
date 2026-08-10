/**
 * Ruling 715f25c5a3c4c436 — Daisy! (UNL-196 → unl-196-219) · Unit · Calm/Order · 9 + [rainbow][rainbow] · 8 Might
 *     "Reduce my cost by [1] for each of the following tags among your units — Bird, Cat, Dog, and Poro."
 *   × Bird token (UNL-T02 → unl-t02, 1 Might, tag Bird).
 *
 * Q: Is the reduction 1 per unit/token (can it exceed 4), or 1 per TAG present?
 * A: Per unique tag present among your units, not per unit. 3 Birds + 2 Poros + 1 Cat = three tags → discount 3.
 *    Only four tags are listed, so the maximum reduction is [4]; duplicates of a tag add nothing.
 * Rules: 131/135 (cost determination with reductions), card text "for each of the following tags".
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DAISY = "unl-196-219";
const BIRD = "unl-t02";
const PORO = { energyCost: 1, might: 1, name: "Test Poro", tags: ["Poro"] } as const;
const CAT = { energyCost: 2, might: 2, name: "Test Cat", tags: ["Cat"] } as const;
const DOG = { energyCost: 2, might: 2, name: "Test Dog", tags: ["Dog"] } as const;

/** The ruling's example board: 3 Bird tokens, 2 Poros, 1 Cat (six tagged units, THREE distinct tags). */
function threeTagsSixUnits(energy: number) {
  return scenario()
    .resources(P1, { energy, power: { rainbow: 2 } })
    .unit(P1, "base", BIRD, "bird1")
    .unit(P1, "base", BIRD, "bird2")
    .unit(P1, "base", BIRD, "bird3")
    .unit(P1, "base", PORO, "poro1")
    .unit(P1, "base", PORO, "poro2")
    .unit(P1, "base", CAT, "cat")
    .hand(P1, DAISY, "daisy");
}

describe("Ruling 715f25c5a3c4c436 — Daisy's discount counts distinct tags (max 4), not tagged units", () => {
  test("3 Birds + 2 Poros + 1 Cat = three tags → Daisy costs 9 − 3 = 6 (not 9 − 6 = 3): 6 energy pays exactly, 5 does not", async () => {
    const game = await threeTagsSixUnits(6).build();
    expect(game.p1.can("play", "daisy")).toBe(true);
    await game.p1.play("daisy");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.settle();
    expect(game.zoneOf("daisy")).toBe("base");

    const short = await threeTagsSixUnits(5).build();
    expect(short.p1.can("play", "daisy")).toBe(false); // a per-unit reading (−6) would have made 5 (even 3) enough
  });

  test("all four tags with duplicates (2 Birds, 2 Poros, Cat, Dog = six units) → the cap is 4: Daisy costs 5, and 4 energy is not enough", async () => {
    const board = (energy: number) =>
      scenario()
        .resources(P1, { energy, power: { rainbow: 2 } })
        .unit(P1, "base", BIRD, "bird1")
        .unit(P1, "base", BIRD, "bird2")
        .unit(P1, "base", PORO, "poro1")
        .unit(P1, "base", PORO, "poro2")
        .unit(P1, "base", CAT, "cat")
        .unit(P1, "base", DOG, "dog")
        .hand(P1, DAISY, "daisy");
    const game = await board(5).build();
    await game.p1.play("daisy");
    expect(game.p1.energy()).toBe(0); // 9 − 4
    await game.settle();
    expect(game.zoneOf("daisy")).toBe("base");
    const short = await board(4).build();
    expect(short.p1.can("play", "daisy")).toBe(false);
  });

  test("control: a single Bird token = one tag → costs 8; the opponent's Cat does not count", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { rainbow: 2 } })
      .unit(P1, "base", BIRD, "bird1")
      .unit(P2, "base", CAT, "theircat")
      .hand(P1, DAISY, "daisy")
      .build();
    await game.p1.play("daisy");
    expect(game.p1.energy()).toBe(0);
    const short = await scenario()
      .resources(P1, { energy: 7, power: { rainbow: 2 } })
      .unit(P1, "base", BIRD, "bird1")
      .unit(P2, "base", CAT, "theircat")
      .hand(P1, DAISY, "daisy")
      .build();
    expect(short.p1.can("play", "daisy")).toBe(false);
  });
});
