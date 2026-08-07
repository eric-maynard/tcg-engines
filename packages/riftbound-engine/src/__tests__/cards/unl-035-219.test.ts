/**
 * Monch — unl-035-219 · Unit · Calm · 6 energy (no power) · 6 Might
 *
 *   If an opponent controls a stunned unit, I cost [2] less and enter ready.
 *
 * Rules: 356.4 (discounts — "cost [amount] less" — applied while determining the total cost, before
 * paying), 364.3.a / 369.3 ("If …, I enter ready" is a conditional replacement of entering exhausted,
 * checked as the unit enters — not a continuous "is ready"), 143.4 (units otherwise enter exhausted),
 * 423.1 (Stunned is a binary status; it drops off in end-of-turn cleanup, 423.1.a.2), 108.2 ("an
 * opponent controls" — your own stunned unit is not an opponent's).
 *
 * Head-judge notes — the tricky spots this file covers:
 *   1. BOTH halves ride on one condition: with a stunned enemy Monch is 4 energy AND ready; without,
 *      6 AND exhausted. Exactly 4 energy must be enough when the condition holds; 5 is not otherwise.
 *   2. Whose stunned unit: only an OPPONENT's counts — stunning your own unit buys nothing. Where it is
 *      (base or battlefield) does not matter. Two stunned enemies are still just [2] less.
 *   3. "enter ready" is checked as Monch enters: a Monch already on the board and exhausted does not
 *      stand up when something gets stunned later.
 *   4. The natural line — Rune Prison (2 + [calm]) a unit, then Monch for 4, ready to swing — and its
 *      expiry: the stun ends with the turn, so on your NEXT turn Monch is full price and exhausted again.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-035-219";
const RUNE_PRISON = "ogn-050-298"; // [Action] spell, 2 energy + [calm]: Stun a unit.

/** Monch in P1's hand with `energy`; P2 has a unit in base (stunned or not) and P1 has one too. */
function board(energy: number, opts: { enemyStunned?: boolean; ownStunned?: boolean } = {}) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "base", { might: 3, name: "Enemy" }, "enemy", opts.enemyStunned ? { stunned: true } : undefined)
    .unit(P1, "base", { might: 3, name: "Mine" }, "mine", opts.ownStunned ? { stunned: true } : undefined)
    .hand(P1, CARD, "monch");
}

describe("Monch (unl-035-219)", () => {
  // Expected: the payload carries BOTH printed effects behind the "opponent controls a stunned unit"
  // condition — a [2] cost reduction and enter-ready. Actual: only the EntersReady grant is present;
  // the discount was dropped when the card was hand-authored.
  test("parsed abilities drop 'I cost [2] less' — only the conditional EntersReady half of the text is represented", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "calm", energyCost: 6, might: 6, name: "Monch" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toContainEqual({
      condition: { target: { controller: "enemy", filter: "stunned", type: "unit" }, type: "opponent-controls" },
      effect: { keyword: "EntersReady", target: "self", type: "grant-keyword" },
      type: "static",
    });
    expect(JSON.stringify(def?.abilities)).toMatch(/cost/i);
  });

  test("no stunned unit anywhere: full price — 6 energy deducted, enters EXHAUSTED as a 6-Might unit; 5 energy is not enough", async () => {
    const game = await board(6).build();
    await game.p1.play("monch");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("monch")).toBe("base");
    expect(game.state("monch")).toMatchObject({ isExhausted: true, might: 6 });
    expect((await board(5).build()).p1.can("play", "monch")).toBe(false);
  });

  // Expected (364.3.a / 369.3): with P2's stunned unit on the board Monch enters READY (one stunned
  // enemy or two — it is one condition). Actual: it enters exhausted; the conditional EntersReady is
  // modelled as a static on the card, and statics of a card in hand never apply.
  test("Monch should enter ready while an opponent controls a stunned unit (364.3.a, 369.3)", async () => {
    const game = await board(6, { enemyStunned: true }).build();
    expect(game.state("enemy").isStunned).toBe(true);
    await game.p1.play("monch");
    await game.settle();
    expect(game.zoneOf("monch")).toBe("base");
    expect(game.state("monch")).toMatchObject({ isReady: true, might: 6 });
    expect(game.violations()).toEqual([]);
    const two = await scenario()
      .resources(P1, { energy: 6 })
      .unit(P2, "base", { might: 2, name: "E1" }, "e1", { stunned: true })
      .unit(P2, "base", { might: 2, name: "E2" }, "e2", { stunned: true })
      .hand(P1, CARD, "monch")
      .build();
    await two.p1.play("monch");
    await two.settle();
    expect(two.state("monch").isReady).toBe(true);
  });

  // Expected (356.4): with a stunned enemy on the board Monch costs 6 - 2 = 4, so 6 energy leaves 2.
  // Actual: the discount is not implemented — all 6 energy is taken.
  test("with a stunned enemy unit Monch should cost [2] less — 6 energy in the pool leaves 2 after playing it (356.4)", async () => {
    const game = await board(6, { enemyStunned: true }).build();
    await game.p1.play("monch");
    expect(game.p1.resources()).toEqual({ energy: 2, power: {} });
    await game.settle();
    expect(game.state("monch").isReady).toBe(true);
    // Two stunned enemies are one condition, not two discounts: still [2] less, never [4].
    const two = await scenario()
      .resources(P1, { energy: 6 })
      .unit(P2, "base", { might: 2, name: "E1" }, "e1", { stunned: true })
      .unit(P2, "base", { might: 2, name: "E2" }, "e2", { stunned: true })
      .hand(P1, CARD, "monch")
      .build();
    await two.p1.play("monch");
    expect(two.p1.energy()).toBe(2);
  });

  // Expected: exactly 4 energy is enough while an opponent controls a stunned unit (and 3 is not).
  // Actual: Monch is not offered at 4 energy because the discount is missing.
  test("with a stunned enemy unit exactly 4 energy should be enough to play Monch, 3 should not (356.4)", async () => {
    const four = await board(4, { enemyStunned: true }).build();
    expect(four.p1.can("play", "monch")).toBe(true);
    await four.p1.play("monch");
    expect(four.p1.energy()).toBe(0);
    const three = await board(3, { enemyStunned: true }).build();
    expect(three.p1.can("play", "monch")).toBe(false);
  });

  test("only an OPPONENT's stunned unit counts: with just my own unit stunned Monch is full price and enters exhausted", async () => {
    const game = await board(6, { ownStunned: true }).build();
    expect(game.state("mine").isStunned).toBe(true);
    await game.p1.play("monch");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("monch").isExhausted).toBe(true);
    expect((await board(4, { ownStunned: true }).build()).p1.can("play", "monch")).toBe(false);
  });

  // Expected: the stunned enemy's location is irrelevant — one at a battlefield also makes Monch enter
  // ready. Actual: enters exhausted (enter-ready half not functional, see above).
  test("a stunned enemy unit AT A BATTLEFIELD should also make Monch enter ready (364.3.a)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Sentinel" }, "sentinel", { stunned: true })
      .hand(P1, CARD, "monch")
      .build();
    await game.p1.play("monch");
    await game.settle();
    expect(game.state("monch").isReady).toBe(true);
  });

  test("'enter ready' is an entry replacement, not a continuous state: an exhausted Monch already on the board stays exhausted when an enemy gets stunned", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { calm: 1 } })
      .unit(P1, "base", CARD, "monch", { exhausted: true })
      .unit(P2, "base", { might: 3, name: "Enemy" }, "enemy")
      .hand(P1, RUNE_PRISON, "prison")
      .build();
    await game.p1.cast("prison", { targets: "enemy" });
    await game.settle();
    expect(game.state("enemy").isStunned).toBe(true);
    expect(game.state("monch").isExhausted).toBe(true);
  });

  // Expected: stun the 5-Might Sentinel with Rune Prison, drop Monch ready, walk in: 6 kills the Sentinel,
  // which (stunned) deals nothing back — Monch conquers undamaged. Actual: Monch enters exhausted, so the
  // move is not legal.
  test("Rune Prison an enemy then Monch should enter ready and be able to attack the stunned unit the same turn (369.3, 423.1.b)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Sentinel" }, "sentinel")
      .hand(P1, RUNE_PRISON, "prison")
      .hand(P1, CARD, "monch")
      .build();
    await game.p1.cast("prison", { targets: "sentinel" });
    await game.settle();
    expect(game.state("sentinel").isStunned).toBe(true);
    await game.p1.play("monch");
    await game.settle();
    expect(game.state("monch").isReady).toBe(true);
    await game.p1.move("monch", "bf1");
    await game.settle();
    // 6 ≥ 5 kills the Sentinel; stunned, it deals no combat damage back (423.1.b) — Monch conquers unhurt.
    expect(game.zoneOf("sentinel")).toBe("trash");
    expect(game.zoneOf("monch")).toBe("battlefield-bf1");
    expect(game.state("monch").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  // Expected: same line, and the whole thing fits in 6 energy + [calm] because Monch is discounted to 4
  // (2 for Rune Prison + 4 for Monch). Actual: Monch still wants 6, so with 4 left it is not playable.
  test("Rune Prison (2) then a discounted Monch (4) should fit in exactly 6 energy + [calm] (356.4)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { calm: 1 } })
      .unit(P2, "base", { might: 3, name: "Enemy" }, "enemy")
      .hand(P1, RUNE_PRISON, "prison")
      .hand(P1, CARD, "monch")
      .build();
    await game.p1.cast("prison", { targets: "enemy" });
    await game.settle();
    expect(game.p1.energy()).toBe(4);
    expect(game.p1.can("play", "monch")).toBe(true);
    await game.p1.play("monch");
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.state("monch").isReady).toBe(true);
  });

  test("expiry: the stun drops off at end of turn (423.1.a.2), so on my NEXT turn Monch is full price and enters exhausted", async () => {
    const game = await scenario()
      .fillDecks({ main: 10, runes: 0 }) // no runes to channel, so the energy pool below is all P1 can spend
      .resources(P1, { energy: 2, power: { calm: 1 } })
      .unit(P2, "base", { might: 3, name: "Enemy" }, "enemy")
      .hand(P1, RUNE_PRISON, "prison")
      .hand(P1, CARD, "monch")
      .build();
    await game.p1.cast("prison", { targets: "enemy" });
    await game.settle();
    expect(game.state("enemy").isStunned).toBe(true);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1 again; pools emptied at turn start
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.runes()).toEqual([]);
    expect(game.p1.energy()).toBe(0);
    expect(game.state("enemy").isStunned).toBe(false);
    await game.p1.do("addResources", { energy: 5 });
    expect(game.p1.can("play", "monch")).toBe(false); // 5 < 6: no discount any more
    await game.p1.do("addResources", { energy: 1 });
    await game.p1.play("monch");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("monch").isExhausted).toBe(true);
  });

});
