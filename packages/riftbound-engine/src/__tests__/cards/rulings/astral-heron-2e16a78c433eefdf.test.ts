/**
 * Ruling 2e16a78c433eefdf — Astral Heron (VEN-044 → ven-044-166) · Unit · [7] · 7 Might
 *   "When you play your first card each turn, if I'm at a battlefield, your next card costs
 *    [2][rainbow][rainbow] less."
 *
 * Q: Does an Astral Heron played to a battlefield as your first card already reduce the cost of the next card?
 * A: Yes. Heron itself is the first card played; once it finalizes onto the battlefield the trigger's
 *    condition ("if I'm at a battlefield") is checked and holds, so it fires and discounts your NEXT card.
 *    It does NOT discount itself — you pay Heron's full [7].
 * Rules: 350.1 / 419.4.a (played = resolved), 383.2.a.1 (trigger conditions checked after the event),
 *        337.2 (a unit is at its location once it resolves).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const ASTRAL_HERON = "ven-044-166";
/** Observable follow-up: [2] + [fury][fury] → free once the [2][rainbow][rainbow] discount applies. */
const NEXT_CARD = { domain: "fury", energyCost: 2, might: 2, name: "Next Card", powerCost: ["fury", "fury"] } as const;

/** P1's turn, nothing played yet, EXACTLY Heron's [7] in the pool; P1 holds bf1 with a token holder. */
function board() {
  return scenario()
    .resources(P1, { energy: 7 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
    .hand(P1, ASTRAL_HERON, "heron")
    .hand(P1, NEXT_CARD, "next");
}

describe("Ruling 2e16a78c433eefdf — Heron as your first card discounts the NEXT card, not itself", () => {
  test("Heron pays its full [7] (no self-discount) and its trigger goes on the chain", async () => {
    const game = await board().build();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    await game.p1.play("heron", { to: "bf1" });
    expect(game.locationOf("heron")).toBe("bf1");
    expect(game.p1.energy()).toBe(0); // 7 − 7: it did not reduce its own cost
    expect(game.chain().filter((c) => c.cardId === "heron" && c.triggered)).toHaveLength(1);
  });

  test("ruling: after the trigger resolves the SECOND card costs [2][rainbow][rainbow] less — here, free", async () => {
    const game = await board().build();
    await game.p1.play("heron", { to: "bf1" });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p1.can("play", "next")).toBe(true); // [2][fury][fury] fully discounted
    await game.p1.play("next", { to: "base" });
    await game.settle();
    expect(game.zoneOf("next")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    // (the harness `costPaid` invariant compares against the PRINTED cost and so flags the discounted
    // play; that bookkeeping note is exactly the discount this ruling is about)
  });

  test("contrast: without Heron's trigger the same second card is unaffordable — the discount is what pays for it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
      .hand(P1, NEXT_CARD, "next")
      .build();
    expect(game.p1.can("play", "next")).toBe(false);
  });
});
