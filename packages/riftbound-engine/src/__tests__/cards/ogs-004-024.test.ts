/**
 * Yi, Meditative — ogs-004-024 · Champion Unit · Calm · 5 energy + [calm] · 4 Might
 *
 *   While you have 8+ runes, I have +4 [Might].
 *
 * "Runes you have" = runes on your board (rune pool), ready or exhausted.
 * A conditional static ability, continuously re-evaluated. Yi is played from
 * hand in every test so the engine's static-ability pass has certainly run.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogs-004-024";

/** P1 has `runes` calm runes on board (plus exact resources to play Yi) and Yi in hand. */
function withRunes(runes: number, opts: { exhausted?: boolean } = {}) {
  return scenario()
    .runes(P1, "calm", runes, opts)
    .resources(P1, { energy: 5, power: { calm: 1 } })
    .hand(P1, CARD, "yi");
}

describe("Yi, Meditative (ogs-004-024)", () => {
  test("with 8 runes on your board Yi is 8 Might (4 + 4)", async () => {
    const game = await withRunes(8).build();
    await game.p1.play("yi");
    await game.settle();
    expect(game.p1.runes()).toHaveLength(8);
    expect(game.zoneOf("yi")).toBe("base");
    expect(game.state("yi").might).toBe(8);
  });

  test("exhausted runes still count: 8 exhausted runes → 8 Might", async () => {
    const game = await withRunes(8, { exhausted: true }).build();
    await game.p1.play("yi");
    await game.settle();
    expect(game.state("yi").might).toBe(8);
  });

  test("with 7 or fewer runes Yi is just 4 Might (the +4 is conditional on 8+ runes)", async () => {
    // Expected: 7 runes → condition false → printed 4 Might. Actual: the parsed static has no
    // rune-count condition, so +4 is applied unconditionally (8 Might).
    const seven = await withRunes(7).build();
    await seven.p1.play("yi");
    await seven.settle();
    expect(seven.state("yi").might).toBe(4);
    const none = await withRunes(0).build();
    await none.p1.play("yi");
    await none.settle();
    expect(none.state("yi").might).toBe(4);
  });

  test("'you' — the opponent's runes do not count toward the 8", async () => {
    // Expected: P1 has 2 runes (P2 has 9) → 4 Might. Actual: unconditional +4 → 8.
    const game = await withRunes(2).runes(P2, "calm", 9).build();
    await game.p1.play("yi");
    await game.settle();
    expect(game.state("yi").might).toBe(4);
  });

  test("'I': the bonus applies only to Yi, not to other units", async () => {
    const game = await withRunes(8).unit(P1, "base", { might: 2 }, "ally").unit(P2, "base", { might: 3 }, "foe").build();
    await game.p1.play("yi");
    await game.settle();
    expect(game.state("yi").might).toBe(8);
    expect(game.state("ally").might).toBe(2);
    expect(game.state("foe").might).toBe(3);
  });

  test("continuous — 4 Might at 6 runes, becomes 8 once your next turn channels runes 7 and 8", async () => {
    // Expected: off at 6 runes, on after P1's next Channel step (6 + 2 = 8).
    // Actual: already 8 Might at 6 runes (condition not evaluated).
    const game = await withRunes(6).build();
    await game.p1.play("yi");
    await game.settle();
    expect(game.state("yi").might).toBe(4);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1: channel 2
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.runes()).toHaveLength(8);
    expect(game.state("yi").might).toBe(8);
  });

  test("cost: 5 energy + 1 calm deducted and Yi enters exhausted; unaffordable at 4 energy or without calm", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { calm: 1 } }).hand(P1, CARD, "yi").build();
    expect(game.p1.can("play", "yi")).toBe(true);
    await game.p1.play("yi");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 0 } });
    await game.settle();
    expect(game.zoneOf("yi")).toBe("base");
    expect(game.state("yi").isExhausted).toBe(true);
    expect(game.state("yi").baseMight).toBe(4);
    const low = await scenario().resources(P1, { energy: 4, power: { calm: 1 } }).hand(P1, CARD, "yi").build();
    expect(low.p1.can("play", "yi")).toBe(false);
    const noCalm = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "yi").build();
    expect(noCalm.p1.can("play", "yi")).toBe(false);
  });
});
