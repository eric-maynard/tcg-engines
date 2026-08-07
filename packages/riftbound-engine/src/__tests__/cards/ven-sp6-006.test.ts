/**
 * Lux, Crownguard — ven-sp6-006 · Champion Unit · 4 energy · 2 Might
 *
 *   [Exhaust]: [Reaction] — [Add] [2]. Spend this Energy only to play spells.
 *
 * Rule 429.4: the added Energy is earmarked — it may pay only for spells. The VEN
 * printing words the restriction as "Spend this Energy only to play spells"; the OGS
 * printing (ogs-014-024) says "Use only to play spells". Both mean the same thing.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "ven-sp6-006";
const STACKED_DECK = "ogn-183-298"; // [Action] 1-energy spell with no board target
const TWO_DROP = { cardType: "unit", domain: "order", energyCost: 2, might: 2, name: "Two Drop" };

describe("Lux, Crownguard (ven-sp6-006)", () => {
  test("[Exhaust]: [Add] [2] resolves immediately — nothing joins the chain", async () => {
    const game = await scenario().unit(P1, "base", CARD, "lux").build();
    await game.p1.activate("lux");
    expect(game.state("lux").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(2);
    expect(game.chain()).toEqual([]);
  });

  // rule 429.4 — "Spend this Energy only to play spells" earmarks the added [2].
  test("the added [2] pays for a spell but not for a 2-cost unit", async () => {
    const game = await scenario()
      .unit(P1, "base", CARD, "lux")
      .hand(P1, STACKED_DECK, "spell")
      .hand(P1, TWO_DROP, "unit")
      .build();
    await game.p1.activate("lux");
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("play", "unit")).toBe(false);
    expect(game.p1.can("cast", "spell")).toBe(true);
    await game.p1.cast("spell");
    expect(game.p1.energy()).toBe(1);
  });

  test("ordinary energy is unrestricted: with 2 real energy the same unit is playable", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", CARD, "lux")
      .hand(P1, TWO_DROP, "unit")
      .build();
    expect(game.p1.can("play", "unit")).toBe(true);
  });
});
