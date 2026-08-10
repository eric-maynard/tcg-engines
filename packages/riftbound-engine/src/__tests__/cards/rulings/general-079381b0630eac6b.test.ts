/**
 * Ruling 079381b0630eac6b — (general rules question) illustrated with basic Fury runes, Seal of Rage (OGN-040 → ogn-040-298:
 *   "[Exhaust]: [Reaction] — [Add] [fury]") and Hextech Ray (OGN-009 → ogn-009-298, cost [1][fury]).
 *
 * Q: How are costs paid — energy (numbers) vs power (coloured symbols); what do exhausting vs recycling a rune do?
 * A: Exhausting a rune generates 1 ENERGY (pays numeric costs, colour irrelevant); recycling a rune generates 1 POWER of its
 *    domain (pays symbol costs, colour matters). Runes themselves never pay costs — the pool does. You may exhaust a rune and
 *    then recycle that same rune; energy needn't be spent immediately; energy and power are NOT interchangeable; Seals also
 *    generate power when exhausted.
 * Rules: 158–160 (Rune Pool, Energy, Power), 605–607 (rune abilities: [Exhaust]: Add [1]; Recycle: Add [C]), 356/357 (costs
 *        are paid from the pool), 317.2 (pool empties at end of turn).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SEAL_OF_RAGE = "ogn-040-298";
const HEXTECH_RAY = "ogn-009-298"; // [1][fury]

/** P1's turn: two ready Fury runes, a Seal of Rage, an empty pool; Hextech Ray in hand and an enemy unit at a battlefield to aim at. */
function board() {
  return scenario()
    .turn(3)
    .runes(P1, "fury", 2)
    .gear(P1, SEAL_OF_RAGE, "seal")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Dummy" }, "dummy")
    .hand(P1, HEXTECH_RAY, "ray");
}

describe("Ruling 079381b0630eac6b — exhaust = energy, recycle = power; the pool pays, not the runes", () => {
  test("exhausting a rune adds exactly 1 ENERGY (no power); the rune stays on the board, exhausted", async () => {
    const game = await board().build();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    const [r1] = game.p1.runes({ ready: true });
    await game.p1.tapRune(r1);
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    expect(game.p1.runes()).toContain(r1!);
    expect(game.p1.runes({ ready: false })).toEqual([r1!]);
  });

  test("recycling a rune adds exactly 1 POWER of its domain (no energy) and the rune leaves the board for the rune deck", async () => {
    const game = await board().build();
    const runeDeck = game.p1.runeDeck().length;
    const [r1] = game.p1.runes({ ready: true });
    await game.p1.recycleRune(r1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } });
    expect(game.p1.runes()).not.toContain(r1!);
    expect(game.p1.runeDeck()).toHaveLength(runeDeck + 1);
  });

  test("you can exhaust a rune FIRST and THEN recycle that same rune: 1 energy + 1 fury from one rune — exactly Hextech Ray's [1][fury], paid from the pool", async () => {
    const game = await board().build();
    const [r1] = game.p1.runes({ ready: true });
    expect(game.p1.can("cast", "ray")).toBe(false); // empty pool: the runes on the board don't pay by themselves
    await game.p1.tapRune(r1);
    await game.p1.recycleRune(r1);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.p1.runes()).toHaveLength(1); // the other rune untouched
    expect(game.p1.can("cast", "ray")).toBe(true);
    await game.p1.cast("ray", { targets: "dummy" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("dummy")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("energy and power are not interchangeable: 2 energy (both runes exhausted) can't cover the [fury] pip, and 2 fury (both recycled) can't cover the [1]", async () => {
    const energyOnly = await board().build();
    await energyOnly.p1.tapRunes(2);
    expect(energyOnly.p1.resources()).toEqual({ energy: 2, power: {} });
    expect(energyOnly.p1.can("cast", "ray")).toBe(false);

    const powerOnly = await board().build();
    await powerOnly.p1.recycleRune({ domain: "fury" });
    await powerOnly.p1.recycleRune({ domain: "fury" });
    expect(powerOnly.p1.resources()).toEqual({ energy: 0, power: { fury: 2 } });
    expect(powerOnly.p1.can("cast", "ray")).toBe(false);
  });

  test("energy needn't be used immediately: it sits in the pool across other actions this turn (a move, here) — but the pool empties at end of turn", async () => {
    const game = await board().unit(P1, "base", { might: 1, name: "Walker" }, "walker").battlefield("bf2", { controller: null }).build();
    await game.p1.tapRune({ domain: "fury" });
    expect(game.p1.energy()).toBe(1);
    await game.p1.move("walker", "bf2");
    await game.settle();
    await game.settle();
    expect(game.p1.energy()).toBe(1); // still there later in the turn
    await game.advanceTurn();
    expect(game.p1.energy()).toBe(0);
    expect(game.trace().expiration[0]?.poolsEmptied?.[P1]?.energy).toBe(1);
  });

  test("a Seal generates POWER too: exhausting Seal of Rage adds [fury]; with one rune exhausted for the [1] that pays Hextech Ray", async () => {
    const game = await board().build();
    await game.p1.tapRune({ domain: "fury" });
    expect(game.p1.can("activate", "seal")).toBe(true);
    await game.p1.activate("seal");
    expect(game.state("seal").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    await game.p1.cast("ray", { targets: "dummy" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });
});
