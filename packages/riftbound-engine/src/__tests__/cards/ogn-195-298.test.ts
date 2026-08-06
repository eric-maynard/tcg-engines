/**
 * Rhasa the Sunderer — ogn-195-298 · Unit · Chaos · 10 energy + [chaos] · 6 Might
 *
 *   I cost [1] less for each card in your trash.
 *
 * Rule 356.4 (discounts) / 356.6 (energy cost cannot go below 0). [1] is an energy discount only —
 * the [chaos] power is always due. Only the controller's own trash counts.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-195-298";
const SKULKER = "ogn-175-298"; // vanilla trash filler

function withTrash(n: number, energy: number, power = 1, owner = P1) {
  const b = scenario().resources(P1, { energy, power: { chaos: power } }).hand(P1, CARD, "rhasa");
  for (let i = 0; i < n; i++) {
    b.trash(owner, SKULKER);
  }
  return b;
}

describe("Rhasa the Sunderer (ogn-195-298)", () => {
  test("empty trash: costs the full 10 energy + 1 chaos; enters the base as a 6-Might unit; unaffordable with 9", async () => {
    const game = await withTrash(0, 10).build();
    await game.p1.play("rhasa");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("rhasa")).toBe("base");
    expect(game.state("rhasa").might).toBe(6);
    const short = await withTrash(0, 9).build();
    expect(short.p1.can("play", "rhasa")).toBe(false);
  });

  test("4 cards in your trash: costs 6 energy + 1 chaos (playable with exactly 6, not with 5)", async () => {
    const game = await withTrash(4, 6).build();
    expect(game.p1.can("play", "rhasa")).toBe(true);
    await game.p1.play("rhasa");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    const short = await withTrash(4, 5).build();
    expect(short.p1.can("play", "rhasa")).toBe(false);
  });

  test("12 cards in your trash: energy cost bottoms out at 0 (rule 356.6) but the [chaos] power is still required", async () => {
    const game = await withTrash(12, 0).build();
    expect(game.p1.can("play", "rhasa")).toBe(true);
    await game.p1.play("rhasa");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("rhasa")).toBe("base");
    const noPower = await withTrash(12, 5, 0).build();
    expect(noPower.p1.can("play", "rhasa")).toBe(false);
  });

  test("only YOUR trash counts: 4 cards in the opponent's trash leave the cost at 10", async () => {
    const game = await withTrash(4, 6, 1, P2).build();
    expect(game.p1.can("play", "rhasa")).toBe(false);
    const full = await withTrash(4, 10, 1, P2).build();
    await full.p1.play("rhasa");
    expect(full.p1.energy()).toBe(0);
  });
});
