/**
 * Ruling a94ea8ba21526c27 — Lee Sin, Ascetic (OGN-078 → ogn-078-298) · 5 Might · "[Shield] [Exhaust]: Buff me. I can have any
 *     number of buffs."
 *   × Wallop (ogn-146-298) · Action [2] · "… Ready a unit." (the "another card effect" that readies him)
 *
 * Q: Lee Sin exhausts for his buff, then is readied by another effect — can he exhaust again for a second buff the same turn?
 * A: Yes. Exhausting is just the cost; as long as you can ready him you can activate the ability again (and he keeps every buff).
 * Rules: 380 (activated abilities: pay cost each activation, no per-turn limit unless stated), 702.3 (buff cap lifted by his text).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const LEE_SIN_ASCETIC = "ogn-078-298";
const WALLOP = "ogn-146-298";
const EXHAUST_BUFF = 1; // ability index of "[Exhaust]: Buff me."

describe("Ruling a94ea8ba21526c27 — Lee Sin can exhaust → buff, be readied, and exhaust → buff again in one turn", () => {
  test("activate (exhausted, 6 Might) → Wallop readies him → the ability is legal again → second activation stacks a second buff (7 Might)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", LEE_SIN_ASCETIC, "lee")
      .hand(P1, WALLOP, "wallop")
      .build();

    // First use: the exhaust is the cost, paid up front; the buff lands on resolution.
    await game.p1.activate("lee", EXHAUST_BUFF);
    expect(game.state("lee").isExhausted).toBe(true);
    await game.settle();
    expect(game.state("lee")).toMatchObject({ isBuffed: true, isExhausted: true, might: 6 });
    expect(game.p1.can("activate", "lee")).toBe(false); // can't pay the cost while exhausted

    // Another card effect readies him.
    await game.p1.cast("wallop", { targets: "lee" });
    await game.settle();
    expect(game.state("lee").isReady).toBe(true);
    expect(game.state("lee").might).toBe(6); // readying does not touch the buff

    // Second use, same turn.
    expect(game.p1.can("activate", "lee")).toBe(true);
    await game.p1.activate("lee", EXHAUST_BUFF);
    expect(game.state("lee").isExhausted).toBe(true);
    await game.settle();
    expect(game.state("lee")).toMatchObject({ isBuffed: true, might: 7 });
    expect(game.turnPlayer()).toBe(P1); // all within the one turn
    expect(game.violations()).toEqual([]);
  });
});
