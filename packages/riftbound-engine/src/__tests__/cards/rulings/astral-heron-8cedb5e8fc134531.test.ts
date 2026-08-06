/**
 * Ruling 8cedb5e8fc134531 — Astral Heron (VEN-044 → ven-044-166) · Unit · Calm · 7 · 7 Might
 *   "When you play your first card each turn, if I'm at a battlefield, your next card costs
 *    [2][rainbow][rainbow] less."
 *
 * Q: Does the ability trigger if Heron ITSELF is your first card played this turn (to a battlefield)?
 * A: Yes, if it is played to a battlefield. "Play" in a trigger condition means the card resolved
 *    (350.1, 419.4.a); a unit resolves right after finalizing and is on the board at its location
 *    (337.2, 359.2). Trigger conditions — including the "if I'm at a battlefield" clause — are checked
 *    after the inciting event (383.2.a.1, 383.2.c), when Heron is already there.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const ASTRAL_HERON = "ven-044-166";

/** A follow-up card whose discounted cost is observable: 3 energy + [fury] → 1 energy + nothing. */
const NEXT_GUY = { domain: "fury", energyCost: 3, might: 2, name: "Next Guy", powerCost: ["fury"] } as const;

function heronTriggers(game: Game): number {
  return game.chain().filter((i) => i.cardId === "heron" && i.triggered).length;
}

/** P1's turn, nothing played yet; P1 controls bf1 (a token holder sits there); exactly 7 for Heron + 1 spare. */
function board() {
  return scenario()
    .resources(P1, { energy: 8 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
    .hand(P1, ASTRAL_HERON, "heron")
    .hand(P1, NEXT_GUY, "next");
}

describe("Ruling 8cedb5e8fc134531 — Astral Heron triggers off its own play to a battlefield", () => {
  test("Heron played to a battlefield as the FIRST card this turn: it is at bf1 when the condition is checked → its trigger goes on the chain", async () => {
    const game = await board().build();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    await game.p1.play("heron", { to: "bf1" });
    expect(game.locationOf("heron")).toBe("bf1");
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(heronTriggers(game)).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "heron", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.energy()).toBe(1);
  });

  // Expected: after the trigger resolves, P1's next card costs 2 energy and 2 power (any domain) less —
  // Next Guy (3 + [fury]) becomes 1 + nothing, playable with the 1 energy / 0 power P1 has left.
  // Actual: the trigger resolves as a no-op (effect parsed as raw text); Next Guy still costs 3 + [fury].
  test.failing("BUG: ruling 8cedb5e8fc134531 — the resolved trigger discounts the next card by [2][rainbow][rainbow]; engine applies no discount", async () => {
    const game = await board().build();
    await game.p1.play("heron", { to: "bf1" });
    expect(heronTriggers(game)).toBe(1);
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    expect(game.p1.can("play", "next")).toBe(true);
    await game.p1.play("next", { to: "base" });
    await game.settle();
    expect(game.zoneOf("next")).toBe("base");
    expect(game.p1.energy()).toBe(0);
  });

  test("contrast: Heron played to BASE as the first card — 'if I'm at a battlefield' fails, no trigger", async () => {
    const game = await board().build();
    await game.p1.play("heron", { to: "base" });
    expect(game.locationOf("heron")).toBe("base");
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(heronTriggers(game)).toBe(0);
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.p1.can("play", "next")).toBe(false); // no discount either way
  });

  test("contrast: Heron played to a battlefield as the SECOND card this turn — not 'your first card', no trigger", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
      .hand(P1, { energyCost: 2, might: 2, name: "Opener" }, "opener")
      .hand(P1, ASTRAL_HERON, "heron")
      .build();
    await game.p1.play("opener", { to: "base" });
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(heronTriggers(game)).toBe(0); // Heron was in hand — not a game object — when the first card was played
    await game.p1.play("heron", { to: "bf1" });
    expect(game.locationOf("heron")).toBe("bf1");
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2);
    expect(heronTriggers(game)).toBe(0);
    expect(game.chain()).toEqual([]);
  });

  test("sanity: Heron already at a battlefield triggers on a DIFFERENT first card too (nothing requires the inciting card to be another card, but it may be)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", ASTRAL_HERON, "heron")
      .hand(P1, { energyCost: 2, might: 2, name: "Opener" }, "opener")
      .build();
    await game.p1.play("opener", { to: "base" });
    expect(heronTriggers(game)).toBe(1);
    await game.settle();
    expect(game.chain()).toEqual([]);
  });
});
