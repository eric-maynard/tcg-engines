/**
 * Battering Ram — sfd-012-221 · Unit · Fury · 5 energy (no power) · 5 might
 *
 *   I cost [1] less for each card you've played this turn, to a minimum of [1].
 *
 * Head-judge notes — the tricky situations for this card:
 *   1. Scaling: 0 played → 5, 1 → 4, 2 → 3, 4 → 1, and 5+ played must still cost 1 (the
 *      "minimum of [1]" floor, rule 356.4.e) — it never becomes free and never negative.
 *   2. What counts as "a card you've played": any card type YOU finalized this turn (unit,
 *      spell, gear — rule 812.1.c uses the same "finalized by you" notion). Hiding a card is
 *      NOT playing it (811.1.c.1); tokens are not cards (350.2) so a Gold token that an
 *      effect "plays" must not count; the opponent's plays never count.
 *   3. Battering Ram never counts itself: its cost is determined while it is being played,
 *      before it is finalized (rule 419.1).
 *   4. "this turn" — the count resets when the turn passes; cards played last turn give no
 *      discount (checked across game.advanceTurn()).
 *   5. Cost is a static self-reduction read at play time: legality (can("play")) and the
 *      energy actually deducted must agree.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-012-221";
const BUSHWHACK = "sfd-004-221"; // Fury spell, 2+[fury]: "... Play a Gold gear token exhausted."
const CHEAP = { cardType: "unit", energyCost: 1, might: 1, name: "Cheap Recruit" } as const;
const TRINKET = { cardType: "gear", energyCost: 1, name: "Trinket" } as const;
const CANTRIP = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Cantrip",
  timing: "action",
} as const;

/** P1 with `energy`, Battering Ram in hand as "ram", and `n` 1-cost Cheap Recruits c0..c{n-1}. */
function board(energy: number, n: number) {
  const b = scenario().resources(P1, { energy }).hand(P1, CARD, "ram");
  for (let i = 0; i < n; i++) {
    b.hand(P1, CHEAP, `c${i}`);
  }
  return b;
}

async function playCheap(game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>, n: number) {
  for (let i = 0; i < n; i++) {
    await game.p1.play(`c${i}`);
    await game.settle();
    expect(game.zoneOf(`c${i}`)).toBe("base");
  }
}

describe("Battering Ram (sfd-012-221)", () => {
  test("parsed ability: a single static self cost-reduction of [1] per card played this turn, floor [1]", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "fury", energyCost: 5, might: 5, name: "Battering Ram" });
    expect(def?.powerCost ?? []).toEqual([]);
    const abilities = (def?.abilities ?? []) as { type: string; effect?: Record<string, unknown> }[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({ effect: { target: "self", type: "cost-reduction" }, type: "static" });
    const scope = String(abilities[0]?.effect?.scope ?? "");
    expect(scope).toContain("for each card you've played this turn");
    expect(scope).toContain("minimum");
  });

  test("no cards played this turn: costs the full 5 and lands in base as a 5-might unit", async () => {
    const game = await board(5, 0).build();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    await game.p1.play("ram");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("ram")).toBe("base");
    expect(game.state("ram").might).toBe(5);
  });

  test("no cards played this turn: 4 energy is not enough (no discount yet)", async () => {
    const game = await board(4, 0).build();
    expect(game.p1.can("play", "ram")).toBe(false);
    const r = await game.p1.try((p) => p.play("ram"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("ram")).toBe("hand");
  });

  test("after playing 1 card this turn Battering Ram costs 4 (rule 356.4 self static reduction is not applied)", async () => {
    // Expected: 5 energy − 1 (Cheap) = 4 left, ram costs 5−1 = 4 → legal, ends at 0.
    // Actual: the "for each card you've played this turn" scope is not counted; ram still costs 5.
    const game = await board(5, 1).build();
    await playCheap(game, 1);
    expect(game.p1.energy()).toBe(4);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.p1.can("play", "ram")).toBe(true);
    await game.p1.play("ram");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("ram")).toBe("base");
  });

  test("every card TYPE you played counts — unit + gear + spell → costs 2", async () => {
    // Expected: 3 cards finalized by P1 (unit, gear, spell) → 5−3 = 2. Actual: charged 5.
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .hand(P1, CARD, "ram")
      .hand(P1, CHEAP, "c0")
      .hand(P1, TRINKET, "trinket")
      .hand(P1, CANTRIP, "cantrip")
      .build();
    await game.p1.play("c0");
    await game.settle();
    await game.p1.play("trinket");
    await game.settle();
    await game.p1.cast("cantrip");
    await game.settle();
    expect(game.zoneOf("cantrip")).toBe("trash");
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(3);
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("play", "ram")).toBe(true);
    await game.p1.play("ram");
    expect(game.p1.energy()).toBe(0);
  });

  test("four cards played → costs exactly 1", async () => {
    const game = await board(5, 4).build();
    await playCheap(game, 4);
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.can("play", "ram")).toBe(true);
    await game.p1.play("ram");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("ram")).toBe("base");
  });

  test("minimum of [1] — with five or more cards played it still costs 1, never 0 (rule 356.4.e)", async () => {
    // 7 energy: 6 Cheap Recruits (6 energy) leaves 1 → ram (floor 1) is exactly affordable and charges 1.
    const game = await board(7, 6).build();
    await playCheap(game, 6);
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.can("play", "ram")).toBe(true);
    await game.p1.play("ram");
    expect(game.p1.energy()).toBe(0);
  });

  test("minimum of [1] — with five cards played and 0 energy left it is NOT free", async () => {
    const game = await board(5, 5).build();
    await playCheap(game, 5);
    expect(game.p1.energy()).toBe(0);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(5);
    expect(game.p1.can("play", "ram")).toBe(false);
  });

  test("only YOUR plays count: two Reactions the opponent played on your turn give no discount", async () => {
    // P1 casts Cantrip (1 card); P2 reacts twice on that chain (2 cards for P2). Afterwards P1 has
    // 3 energy: ram costs 5−1 = 4 → NOT playable. (Were P2's plays counted it would cost 2.)
    const REACT = { ...CANTRIP, name: "Snap Reaction", timing: "reaction" } as const;
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .resources(P2, { energy: 2 })
      .hand(P1, CARD, "ram")
      .hand(P1, CANTRIP, "cantrip")
      .hand(P2, REACT, "r1")
      .hand(P2, REACT, "r2")
      .build();
    await game.p1.cast("cantrip");
    await game.p1.passPriority();
    await game.p2.cast("r1");
    await game.p2.cast("r2");
    await game.settle();
    expect(game.zoneOf("r1")).toBe("trash");
    expect(game.zoneOf("r2")).toBe("trash");
    expect(game.zoneOf("cantrip")).toBe("trash");
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.p1.energy()).toBe(3);
    expect(game.p1.can("play", "ram")).toBe(false);
  });

  test("hiding a card is not playing it (811.1.c.1): no discount after a Hide", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .hand(P1, CARD, "ram")
      .hand(P1, BUSHWHACK, "bw")
      .build();
    await game.p1.hide("bw", "bf1");
    expect(game.zoneOf("bw")).toBe("facedown-bf1");
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.p1.energy()).toBe(4);
    expect(game.p1.can("play", "ram")).toBe(false);
  });

  test("a token 'played' by an effect is not a card (350.2) — Bushwhack + its Gold token = ONE card → ram costs 4, not 3", async () => {
    // Expected: after Bushwhack (2+[fury]) resolves and plays a Gold token, exactly one CARD was played:
    // ram costs 4. With 7 energy: 7−2 = 5 left, ram 4 → 1 left. Actual today: ram costs 5 → 0 left
    // (and if tokens were wrongly counted it would cost 3 → 2 left).
    const game = await scenario()
      .resources(P1, { energy: 7, power: { fury: 1 } })
      .hand(P1, CARD, "ram")
      .hand(P1, BUSHWHACK, "bw")
      .build();
    await game.p1.cast("bw");
    await game.settle();
    expect(game.p1.gear()).toHaveLength(1); // the Gold token exists
    expect(game.p1.energy()).toBe(5);
    await game.p1.play("ram");
    expect(game.p1.energy()).toBe(1);
  });

  test("'this turn' only: cards played on an earlier turn give no discount after the turn passes", async () => {
    const game = await board(2, 2).build();
    await playCheap(game, 2);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1 again (channels 2 runes, draws 1)
    expect(game.turnPlayer()).toBe(P1);
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    // rule 357.1.a: a READY channelled rune could pay the 5th Energy during the
    // Pay step, so exhaust them before checking the (undiscounted) price.
    await game.p1.tapRunes(game.p1.runes({ ready: true }).length);
    await game.p1.do("addResources", { energy: 4 - game.p1.energy() });
    expect(game.p1.energy()).toBe(4);
    expect(game.p1.can("play", "ram")).toBe(false); // full 5 again
    await game.p1.do("addResources", { energy: 1 });
    expect(game.p1.can("play", "ram")).toBe(true);
    await game.p1.play("ram");
    expect(game.p1.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
