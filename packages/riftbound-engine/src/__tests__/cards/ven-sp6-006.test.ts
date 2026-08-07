/**
 * Lux, Crownguard — ven-sp6-006 · alternate printing of ogs-014-024
 *
 *   [Exhaust]: [Reaction] — [Add] [2]. Spend this Energy only to play spells.
 *
 * Same ability, different wording ("Spend this Energy only to…" instead of "Use only to…"),
 * so it exercises a second parser path into the same `add-resource` restriction.
 * rule 429.4: the added Energy is earmarked and may only pay for spells.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "ven-sp6-006";
const STACKED_DECK = "ogn-183-298"; // [Action] 1-energy spell with no board target
const TWO_DROP = { cardType: "unit", domain: "order", energyCost: 2, might: 2, name: "Two Drop" };

describe("Lux, Crownguard (ven-sp6-006)", () => {
  test("[Exhaust]: [Add] [2] resolves immediately — nothing goes on the chain", async () => {
    const game = await scenario().unit(P1, "base", CARD, "lux").build();
    await game.p1.activate("lux");
    expect(game.state("lux").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(2);
    expect(game.chain()).toEqual([]);
  });

  test("'Spend this Energy only to play spells' — the added [2] pays for a spell but not for a 2-cost unit", async () => {
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
});
