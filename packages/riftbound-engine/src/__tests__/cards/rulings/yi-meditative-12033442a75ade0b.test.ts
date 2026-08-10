/**
 * Ruling 12033442a75ade0b — Yi, Meditative (OGS-004 → ogs-004-024) · Champion Unit · Calm · [5][calm] · 4 Might
 *   "While you have 8+ runes, I have +4 [Might]."
 *
 * Q: Does "8+" mean "8 or more" or "9 or more" runes?
 * A: "8+" = 8 or more. Yi has +4 Might (8 total) once you have exactly 8 runes; 7 is not enough; 9 also qualifies.
 * Rules: standard "N+" notation (N or more); conditional static ability continuously evaluated.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const YI = "ogs-004-024";

/** P1 has `n` calm runes on board, exactly [5][calm] floating, and Yi in hand. */
function withRunes(n: number) {
  return scenario().runes(P1, "calm", n).resources(P1, { energy: 5, power: { calm: 1 } }).hand(P1, YI, "yi");
}

async function yiMightWith(n: number): Promise<number> {
  const game = await withRunes(n).build();
  await game.p1.play("yi");
  await game.settle();
  expect(game.p1.runes()).toHaveLength(n);
  expect(game.zoneOf("yi")).toBe("base");
  return game.state("yi").might;
}

describe("Ruling 12033442a75ade0b — Yi's '8+ runes' means eight OR MORE", () => {
  test("exactly 8 runes: the condition is met → 4 + 4 = 8 Might", async () => {
    expect(await yiMightWith(8)).toBe(8);
  });

  test("7 runes: not met → printed 4 Might ('8+' is not '7 or more')", async () => {
    expect(await yiMightWith(7)).toBe(4);
  });

  test("9 runes: still met ('or more') → 8 Might; it is not an 'exactly 8' check", async () => {
    expect(await yiMightWith(9)).toBe(8);
  });

  test("continuously evaluated: at 6 runes Yi is 4; channeling the 8th rune (next turn's Channel Phase) turns the +4 on", async () => {
    const game = await withRunes(6).unit(P2, "base", { might: 1 }, "dummy").build();
    await game.p1.play("yi");
    await game.settle();
    expect(game.state("yi").might).toBe(4);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1: channels 2 → 8 runes
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.runes()).toHaveLength(8);
    expect(game.state("yi").might).toBe(8);
    expect(game.violations()).toEqual([]);
  });
});
