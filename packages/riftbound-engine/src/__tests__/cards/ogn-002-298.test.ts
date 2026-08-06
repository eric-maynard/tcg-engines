/**
 * Brazen Buccaneer — ogn-002-298 · Unit · Fury · 6 energy · 5 Might
 *
 *   As you play me, you may discard 1 as an additional cost. If you do,
 *   reduce my cost by [2].
 *
 * Rules: 356.2.b (optional additional costs are chosen as you play the card),
 * 204.2 (additional cost is paid on top of / alongside the base cost),
 * 359.2.c (units enter the board exhausted).
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "ogn-002-298";
const FILLER = "ogn-175-298"; // Shipyard Skulker, vanilla 3-cost unit used as discard fodder

describe("Brazen Buccaneer (ogn-002-298)", () => {
  test("base cost: 6 energy, no power; enters the base exhausted as a 5-Might unit", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "bb").build();
    expect(game.p1.can("play", "bb")).toBe(true);
    await game.p1.play("bb");
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("bb")).toBe("base");
    expect(game.state("bb").might).toBe(5);
    expect(game.state("bb").isExhausted).toBe(true);
  });

  test("not playable with 5 energy and nothing to discard", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "bb").build();
    expect(game.p1.can("play", "bb")).toBe(false);
    const r = await game.p1.try((p) => p.play("bb"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("bb")).toBe("hand");
  });

  test("the discard is optional: playing for the full 6 keeps the other hand card", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "bb").hand(P1, FILLER, "fodder").build();
    await game.p1.play("bb");
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("fodder")).toBe("hand");
    expect(game.zoneOf("bb")).toBe("base");
  });

  test.failing("BUG: discarding 1 as an additional cost reduces the cost by [2] — playable for 4 energy + a discard (rules 356.2.b, 204.2)", async () => {
    // Expected: with 4 energy and another card in hand, Brazen Buccaneer is playable by opting into the
    // discard; the fodder goes to trash and exactly 4 energy is spent. Actual: the parser emits
    // `additionalCost: "discard 1"` which the engine does not recognise, so no discard variant exists.
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "bb").hand(P1, FILLER, "fodder").build();
    expect(game.p1.can("play", "bb")).toBe(true);
    await game.p1.play("bb", { answers: ["fodder"], payOptional: true });
    await game.settle();
    expect(game.zoneOf("bb")).toBe("base");
    expect(game.zoneOf("fodder")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
  });
});
