/**
 * Astral Heron — ven-044-166 · Unit · Calm · 7 energy · 7 Might
 *
 *   When you play your first card each turn, if I'm at a battlefield, your next card costs
 *   [2][rainbow][rainbow] less.
 *
 * Head-judge notes (the tricky spots this file pins down; the self-trigger ruling 8cedb5e8 lives in
 * rulings/astral-heron-8cedb5e8fc134531.test.ts and is not repeated here):
 *   1. "your first CARD" — any card type. A spell counts once it RESOLVES (350.1, 419.4.a; the
 *      Promising Future ruling names Astral Heron explicitly), not only permanents.
 *   2. "each turn" ≠ "on your turn": a Reaction played as your first card during the opponent's
 *      turn triggers it too, and the per-turn count resets so it re-triggers on later turns.
 *   3. The discount is a one-shot delayed passive on "your next card" (390.4/391): [2] energy
 *      (floored at 0, no refund) plus up to two power pips of ANY domain. It is spent by whichever
 *      card you play next — even a free one — and never touches the opponent's plays.
 *   4. No "this turn" is printed (contrast Ravenborn Tome), so an unspent discount survives the
 *      turn boundary and applies to your next card on a later turn (391, 392).
 *   5. "if I'm at a battlefield" is part of the trigger CONDITION (383.2.a.1): Heron in base → no
 *      trigger; Heron moved to base in response (Flash) after triggering → discount still comes
 *      (ruling 38caf55c). Moving Heron up AFTER the first card does not retro-trigger on card two.
 *   6. Two Herons at battlefields both trigger and both discounts pile onto the same next card.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-044-166";
const DISCIPLINE = "ogn-058-298"; // [Reaction] Calm 2: give a unit +2 Might this turn, draw 1
const FLASH = "ogs-011-024"; // [Reaction] 2: move up to 2 friendly units to base
const OPENER = { energyCost: 1, might: 1, name: "Opener" } as const;
const NEXT_GUY = { domain: "fury", energyCost: 3, might: 2, name: "Next Guy", powerCost: ["fury"] } as const; // 3+[fury] → 1
const THREE_PIP = { domain: "fury", energyCost: 1, might: 2, name: "Three Pip", powerCost: ["fury", "fury", "fury"] } as const;

const heronTriggers = (game: Game) => game.chain().filter((i) => i.triggered && game.state(i.cardId).defId === CARD).length;

/** P1's turn, Heron already at bf1, nothing played yet this turn. */
function board(energy = 2, fury = 0) {
  return scenario()
    .resources(P1, { energy, power: fury ? { fury } : {} })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", CARD, "heron")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .hand(P1, OPENER, "opener")
    .hand(P1, NEXT_GUY, "next")
    .hand(P1, { energyCost: 2, might: 1, name: "Third" }, "third");
}

describe("Astral Heron (ven-044-166)", () => {
  test("registry payload: first-play-each-turn trigger, at-battlefield condition, next-card [2][rainbow][rainbow] reduction", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "calm", energyCost: 7, might: 7 });
    expect(def?.abilities).toEqual([
      {
        condition: { type: "while-at-battlefield" },
        effect: { duration: "next", reduction: { energy: 2, power: ["rainbow", "rainbow"] }, replaces: "play-cost", type: "replacement" },
        trigger: { event: "play-card", on: "controller", restrictions: [{ count: 1, type: "nth-time-each-turn" }] },
        type: "triggered",
      },
    ]);
  });

  test("costs 7 energy for a 7-Might unit; 6 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 7 }).hand(P1, CARD, "heron").build();
    await game.p1.play("heron");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("heron")).toMatchObject({ might: 7, zone: "base" });
    expect((await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "heron").build()).p1.can("play", "heron")).toBe(false);
  });

  test("first card (a unit) with Heron at bf1 → trigger → next card is [2]+[any][any] cheaper (3+[fury] → 1), the card after that pays full", async () => {
    const game = await board(4).build();
    await game.p1.play("opener", { to: "base" });
    expect(heronTriggers(game)).toBe(1);
    await game.settle();
    expect(game.p1.energy()).toBe(3);
    await game.p1.play("next", { to: "base" }); // 3+[fury] − [2][r][r] = 1 energy, no power
    expect(game.p1.resources()).toEqual({ energy: 2, power: {} });
    await game.settle();
    expect(heronTriggers(game)).toBe(0); // second card: no new trigger
    await game.p1.play("third", { to: "base" }); // full 2
    expect(game.p1.energy()).toBe(0);
  });

  test("power part is 'up to two pips of any domain': a 1+[fury]×3 card still needs one fury; energy floors at 0 with no refund", async () => {
    const dry = await board(2, 0).hand(P1, THREE_PIP, "pip").build();
    await dry.p1.play("opener", { to: "base" });
    await dry.settle();
    expect(dry.p1.can("play", "pip")).toBe(false); // 1 fury still owed, none in pool
    const game = await board(2, 1).hand(P1, THREE_PIP, "pip").build();
    await game.p1.play("opener", { to: "base" });
    await game.settle();
    await game.p1.play("pip", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 0 } }); // 1−2 → 0 energy (not −1), 3−2 → 1 fury paid
  });

  test("the discount is spent by the very next card even when wasted on a 1-cost play; nothing carries to the card after", async () => {
    const game = await board(4).hand(P1, OPENER, "cheap").build();
    await game.p1.play("opener", { to: "base" });
    await game.settle();
    await game.p1.play("cheap", { to: "base" }); // 1 − 2 → free, discount gone
    expect(game.p1.energy()).toBe(3);
    await game.settle();
    expect(game.p1.can("play", "next")).toBe(false); // 3+[fury] at full price with 3 energy / no fury
  });

  test("negative: Heron in BASE when your first card resolves → no trigger; moving it up afterwards does not make card two 'first'", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", CARD, "heron")
      .hand(P1, OPENER, "opener")
      .hand(P1, NEXT_GUY, "next")
      .build();
    await game.p1.play("opener", { to: "base" });
    expect(heronTriggers(game)).toBe(0);
    await game.settle();
    await game.p1.move("heron", "bf1");
    await game.settle();
    expect(game.locationOf("heron")).toBe("bf1");
    expect(game.p1.can("play", "next")).toBe(false); // no discount: needs [fury]
    await game.p1.do("addResources", { power: { fury: 1 } });
    await game.p1.play("next", { to: "base" });
    expect(heronTriggers(game)).toBe(0); // second card this turn
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 0 } }); // paid full 3+[fury]
  });

  test("negative: the OPPONENT's first card never triggers my Heron", async () => {
    const game = await board(2)
      .active(P2)
      .resources(P2, { energy: 3 })
      .hand(P2, OPENER, "theirs1")
      .hand(P2, { energyCost: 2, might: 1, name: "Theirs2" }, "theirs2")
      .build();
    await game.p2.play("theirs1", { to: "base" });
    expect(heronTriggers(game)).toBe(0);
    await game.settle();
    await game.p2.play("theirs2", { to: "base" });
    expect(game.p2.energy()).toBe(0);
    expect(heronTriggers(game)).toBe(0);
    expect(game.gameState.activeReplacements ?? []).toEqual([]);
  });

  test("negative: 'YOUR next card' — a pending discount does not cheapen a spell the opponent plays in my showdown, and stays pending", async () => {
    const game = await board(2)
      .resources(P2, { energy: 2 })
      .unit(P2, "bf2", { might: 5, name: "Wall" }, "wall")
      .hand(P2, DISCIPLINE, "disc2")
      .build();
    await game.p1.play("opener", { to: "base" });
    await game.settle();
    expect(game.gameState.activeReplacements).toHaveLength(1);
    await game.p1.move("ally", "bf2"); // opens a showdown at bf2
    await game.p1.pass(); // focus to P2
    await game.p2.cast("disc2", { targets: "wall" });
    expect(game.p2.energy()).toBe(0); // full 2
    expect(game.gameState.activeReplacements).toHaveLength(1); // still mine to use
  });

  test("'each turn' resets: triggering on turn N does not stop it triggering again on your next turn's first card", async () => {
    const game = await board(1).build();
    await game.p1.play("opener", { to: "base" });
    expect(heronTriggers(game)).toBe(1);
    await game.settle();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.tapRunes(2);
    await game.p1.play("third", { to: "base" });
    expect(heronTriggers(game)).toBe(1);
  });

  test("two Herons at battlefields: both trigger off the same first card and BOTH discounts land on the next card ([4] + four pips off)", async () => {
    const game = await board(2, 0).unit(P1, "bf2", CARD, "heron2").hand(P1, THREE_PIP, "pip").build();
    await game.p1.play("opener", { to: "base" });
    expect(heronTriggers(game)).toBe(2);
    await game.settle();
    await game.p1.play("pip", { to: "base" }); // 1+[fury]×3 − ([4]+4 pips) → free
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    await game.settle();
    expect(game.p1.can("play", "third")).toBe(false); // both spent; 2-cost with 1 energy
  });

  test("ruling 38caf55c: Flash-ing Heron to base in response to its trigger does not stop the discount (condition is not rechecked on resolution)", async () => {
    const game = await board(6).hand(P1, FLASH, "flash").build();
    await game.p1.play("opener", { to: "base" });
    expect(heronTriggers(game)).toBe(1);
    await game.p1.cast("flash", { targets: "heron" }); // full price: the trigger under it has not resolved yet
    expect(game.p1.energy()).toBe(3);
    await game.settle();
    expect(game.locationOf("heron")).toBe("base");
    expect(game.chain()).toEqual([]);
    await game.p1.play("next", { to: "base" }); // 3+[fury] → 1
    expect(game.p1.resources()).toEqual({ energy: 2, power: {} });
  });

  test("a spell as your first card should trigger Heron when it resolves — only permanent plays fire the play-card trigger (419.4.a; Promising Future ruling)", async () => {
    // Expected: Discipline resolves → it was P1's first card this turn with Heron at bf1 → trigger on
    // the chain → next card discounted. Actual: only permanent plays bump the trigger; a spell never does.
    const game = await board(5).hand(P1, DISCIPLINE, "disc").build();
    await game.p1.cast("disc", { targets: "ally" });
    await game.p1.pass();
    await game.p2.pass(); // Discipline resolves
    expect(game.zoneOf("disc")).toBe("trash");
    expect(heronTriggers(game)).toBe(1);
    await game.settle();
    await game.p1.play("next", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: {} });
  });

  test("'each turn' includes the opponent's — a Reaction as my first card on their turn should trigger Heron, but no trigger fires", async () => {
    // Expected: on P2's turn P1 answers P2's spell with Discipline (P1's first card this turn, Heron at
    // bf1) → when Discipline resolves Heron triggers. Actual: no trigger (shares the spell-play gap above).
    const game = await board(4)
      .active(P2)
      .resources(P2, { energy: 2 })
      .unit(P2, "base", { might: 2, name: "Theirs" }, "u2")
      .hand(P1, DISCIPLINE, "disc")
      .hand(P2, DISCIPLINE, "disc2")
      .build();
    await game.p2.cast("disc2", { targets: "u2" });
    await game.p2.pass();
    await game.p1.cast("disc", { targets: "ally" });
    await game.p1.pass();
    await game.p2.pass(); // P1's Discipline resolves first (LIFO)
    expect(game.zoneOf("disc")).toBe("trash");
    expect(heronTriggers(game)).toBe(1);
  });

  test("no 'this turn' is printed, so an unspent next-card discount should survive to your next turn (390.4/391/392) — the end-of-turn sweep drops it", async () => {
    // Expected: turn-2 trigger resolves, P1 plays nothing else; on P1's next turn "third" (2) costs 0.
    // Actual: the end-of-turn sweep drops every duration:"next" replacement, so full price is charged.
    const game = await board(1).build();
    await game.p1.play("opener", { to: "base" });
    await game.settle();
    expect(game.gameState.activeReplacements).toHaveLength(1);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("play", "third")).toBe(true); // 2 − 2 = 0
    await game.p1.play("third", { to: "base" });
    expect(game.p1.energy()).toBe(0);
  });
});
