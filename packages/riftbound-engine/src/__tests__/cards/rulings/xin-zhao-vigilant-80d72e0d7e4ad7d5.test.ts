/**
 * Ruling 80d72e0d7e4ad7d5 — Xin Zhao, Vigilant (SFD-176 → sfd-176-221) · Champion Unit · Order · [3][order] · 4 Might
 *   "[Tank] I enter ready if you have two or more other units in your base."
 *   × Recruit unit tokens (1 Might) — played by Vanguard Armory (sfd-168-221) / the printed Recruit token ogn-271-298
 *
 * Q: Does a token count toward Xin Zhao entering ready?
 * A: Yes — a token unit is a unit (179.1.d), so tokens in your base satisfy "two or more other units". Xin Zhao never
 *    counts himself: you need two OTHER units in base.
 * Rules: 179.1.d (token units are units), 143.4 (default exhausted) / conditional "enter ready".
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const XIN_ZHAO = "sfd-176-221";
const VANGUARD_ARMORY = "sfd-168-221";
const RECRUIT_TOKEN = "ogn-271-298";

/** P1's turn: Xin Zhao in hand + exactly [3][order]; `tokens` Recruit tokens already in base; an enemy unit in P2's base as noise. */
function withTokens(tokens: number) {
  const s = scenario().resources(P1, { energy: 3, power: { order: 1 } }).hand(P1, XIN_ZHAO, "xz").unit(P2, "base", { might: 1, name: "Enemy" }, "enemy");
  for (let i = 0; i < tokens; i++) {
    s.unit(P1, "base", RECRUIT_TOKEN, `recruit${i}`);
  }
  return s;
}

async function playXinZhao(game: Game): Promise<void> {
  await game.p1.play("xz", { to: "base" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  await game.settle();
  expect(game.zoneOf("xz")).toBe("base");
}

describe("Ruling 80d72e0d7e4ad7d5 — token units count as 'other units in your base' for Xin Zhao", () => {
  test("three Recruit TOKENS the Armory just played into base (nothing else there): Xin Zhao enters READY", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { order: 1 } })
      .gear(P1, VANGUARD_ARMORY, "armory")
      .hand(P1, XIN_ZHAO, "xz")
      .build();
    await game.p1.activate("armory");
    await game.settle();
    const toks = game.p1.units("base");
    expect(toks).toHaveLength(3);
    expect(toks.every((t) => game.state(t).isToken && game.state(t).name === "Recruit")).toBe(true);
    await playXinZhao(game);
    expect(game.state("xz").isReady).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("exactly two token units in base is enough ('two or more'): ready", async () => {
    const game = await withTokens(2).build();
    expect(game.p1.units("base").every((t) => game.state(t).isToken)).toBe(true);
    await playXinZhao(game);
    expect(game.state("xz").isReady).toBe(true);
  });

  test("only ONE token in base: 1 < 2 → he enters EXHAUSTED — he does not count himself as the second unit", async () => {
    const game = await withTokens(1).build();
    await playXinZhao(game);
    expect(game.p1.units("base").sort()).toEqual(["recruit0", "xz"]);
    expect(game.state("xz").isExhausted).toBe(true);
  });

  test("empty base: exhausted (the enemy's units never count)", async () => {
    const game = await withTokens(0).build();
    await playXinZhao(game);
    expect(game.state("xz").isExhausted).toBe(true);
  });
});
