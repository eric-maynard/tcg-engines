/**
 * Lux, Crownguard — ogs-014-024 · Champion Unit · Order · 4 energy (no power) · 2 Might · Lux
 *
 *   [Exhaust]: [Reaction] — [Add] [2]. Use only to play spells.
 *   (Abilities that add resources can't be reacted to.)
 *
 * Rule 429 (Add): activated abilities that Add resources resolve as soon as they are finalized —
 * they never wait on the chain. [Reaction] lets it be used on any turn / while a chain is open.
 * The added 2 energy is restricted: it may only pay for spells.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogs-014-024";
const STACKED_DECK = "ogn-183-298"; // Stacked Deck: [Action] 1-energy spell with no board target
const TWO_DROP = { cardType: "unit", domain: "order", energyCost: 2, might: 2, name: "Two Drop" }; // inline vanilla unit
const HEXTECH_RAY = "ogn-009-298"; // [Action] 1 energy + [fury]: Deal 3 to a unit at a battlefield.

describe("Lux, Crownguard (ogs-014-024)", () => {
  test("costs 4 energy (no power); enters the base exhausted as a 2-Might unit; unaffordable with 3", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "lux").build();
    await game.p1.play("lux");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("lux")).toBe("base");
    expect(game.state("lux")).toMatchObject({ isExhausted: true, might: 2 });
    const poor = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "lux").build();
    expect(poor.p1.can("play", "lux")).toBe(false);
  });

  test("[Exhaust]: [Add] [2] — exhausts Lux and adds 2 energy immediately; nothing goes on the chain", async () => {
    const game = await scenario().unit(P1, "base", CARD, "lux").build();
    expect(game.state("lux").isReady).toBe(true);
    await game.p1.activate("lux");
    expect(game.state("lux").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(2);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("the exhaust cost gates it: an exhausted Lux cannot activate", async () => {
    const game = await scenario().unit(P1, "base", CARD, "lux", { exhausted: true }).build();
    expect(game.p1.can("activate", "lux")).toBe(false);
  });

  test("the added energy pays for a spell (Stacked Deck, 1 energy) in the same turn", async () => {
    const game = await scenario().unit(P1, "base", CARD, "lux").hand(P1, STACKED_DECK, "spell").build();
    expect(game.p1.can("cast", "spell")).toBe(false);
    await game.p1.activate("lux");
    expect(game.p1.can("cast", "spell")).toBe(true);
    await game.p1.cast("spell");
    expect(game.p1.energy()).toBe(1);
    expect(game.zoneOf("spell")).toBe("chain");
  });

  test.failing("BUG: 'Use only to play spells' — the added [2] cannot pay for a 2-cost unit (ordinary energy can)", async () => {
    // Expected: Lux's 2 energy is spell-only, so with no other energy a 2-cost unit stays unplayable.
    // Actual: the ability adds ordinary energy (`add-resource {energy: 2}` with no restriction) and the unit becomes playable.
    const game = await scenario().unit(P1, "base", CARD, "lux").hand(P1, TWO_DROP, "unit").build();
    await game.p1.activate("lux");
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("play", "unit")).toBe(false);
    const control = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", CARD, "lux").hand(P1, TWO_DROP, "unit").build();
    expect(control.p1.can("play", "unit")).toBe(true);
  });

  test("[Reaction]: usable on the opponent's turn, in response to their spell, without disturbing the chain", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 5 }, "ally")
      .unit(P1, "base", CARD, "lux")
      .hand(P2, HEXTECH_RAY, "ray")
      .build();
    expect(game.p1.can("activate", "lux")).toBe(false); // rule 316.5.b: not in the opponent's Neutral Open State
    await game.p2.cast("ray", { targets: "ally" });
    await game.p2.passPriority();
    expect((game.decision() as ActionDecision).context).toBe("chain");
    expect(game.p1.can("activate", "lux")).toBe(true);
    await game.p1.activate("lux");
    expect(game.p1.energy()).toBe(2);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray"]); // the Add ability never joined the chain
  });
});
