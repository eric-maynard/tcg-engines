/**
 * Ruling 52e7d9ff2de85669 — Daughter of the Void (Kai'Sa legend, OGN-247 → ogn-247-298) · Fury/Mind
 *   "[Exhaust]: [Reaction] — [Add] [rainbow]. Use only to play spells."
 *   × Hextech Ray (OGN-009 → ogn-009-298) · Action · [1][fury] · "Deal 3 to a unit at a battlefield."
 *
 * Q: Can I exhaust Kai'Sa to pay Hextech Ray's power cost instead of recycling my red (fury) rune?
 * A: Yes — tap the rune for the [1] energy, then exhaust Kai'Sa for the power pip; the rune need not be recycled.
 * Rules: 429 / 429.3 ([Add] resource abilities), 160-ish rune pool payment (energy by exhausting, power by
 *        recycling), the legend's "use only to play spells" restriction.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DAUGHTER_OF_THE_VOID = "ogn-247-298";
const HEXTECH_RAY = "ogn-009-298";

/** P1's turn: Kai'Sa legend, exactly ONE fury rune channeled, empty pool; Hextech Ray in hand; P2's Victim (2) at bf1. */
function board() {
  return scenario()
    .legend(P1, DAUGHTER_OF_THE_VOID, "kaisa")
    .rune(P1, "fury", { alias: "furyRune" })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Victim" }, "victim")
    .hand(P1, HEXTECH_RAY, "ray");
}

describe("Ruling 52e7d9ff2de85669 — Kai'Sa's [Add] pays Hextech Ray's power pip; the rune is only tapped, not recycled", () => {
  test("with a single fury rune, tapping it for [1] is not enough on its own — Ray still needs a power pip, which would otherwise mean RECYCLING the rune", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "ray")).toBe(false);
    await game.p1.tapRune("furyRune");
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    expect(game.p1.can("cast", "ray")).toBe(false); // 1 energy, 0 power
    expect(game.p1.can("recycleRune", "furyRune")).toBe(true); // the alternative the player wants to avoid
  });

  test("ruling: tap the rune for [1], exhaust Kai'Sa to [Add] a power — Hextech Ray becomes castable and resolves (Victim takes 3 and dies) while the fury rune STAYS in the pool, merely exhausted", async () => {
    const game = await board().build();
    await game.p1.tapRune("furyRune");
    expect(game.p1.can("activate", "kaisa")).toBe(true);
    await game.p1.activate("kaisa");
    // [Add] abilities can't be reacted to — no chain; the power is in the pool at once.
    expect(game.chain()).toEqual([]);
    expect(game.state("kaisa").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.power()).toBe(1);
    expect(game.p1.can("cast", "ray")).toBe(true);
    await game.p1.cast("ray", { targets: "victim" });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("ray")).toBe("trash");
    // The red rune was never recycled: still channeled (exhausted) in P1's rune pool.
    expect(game.zoneOf("furyRune")).toBe("runePool");
    expect(game.state("furyRune").isExhausted).toBe(true);
    expect(game.p1.runes()).toEqual(["furyRune"]);
    expect(game.violations()).toEqual([]);
  });

  test("'Use only to play spells': Kai'Sa's added power does not make a [0]+[fury] UNIT playable", async () => {
    const game = await scenario()
      .legend(P1, DAUGHTER_OF_THE_VOID, "kaisa")
      .battlefield("bf1", { controller: P2 })
      .hand(P1, { cardType: "unit", energyCost: 0, might: 1, name: "Fury Pup", powerCost: ["fury"] }, "pup")
      .build();
    expect(game.p1.can("play", "pup")).toBe(false);
    await game.p1.activate("kaisa");
    expect(game.p1.power()).toBe(1);
    expect(game.p1.can("play", "pup")).toBe(false);
  });
});
