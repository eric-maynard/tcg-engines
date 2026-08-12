/**
 * Ruling 2b98ee80eba49de8 — Undertitan (SFD-175 → sfd-175-221) · Order unit · [6][order] · 5 Might
 *   "When you play me, give your other units +2 [Might] this turn.
 *    As I'm revealed from your deck, [Add] [2]."
 *   × Void Rush (SFD-188 → sfd-188-221) · [2][rainbow] "Reveal the top 2 cards of your Main Deck. You may
 *     banish one, then play it, reducing its cost by [2]. Draw any you didn't banish."
 *
 * Q: If Undertitan is DRAWN, can it be revealed for the [Add] [2]?
 * A: No. Drawing is not revealing — they are distinct game actions, and the ability only fires on effects that
 *    actually instruct a reveal.
 * Rules: 172 / 176 (draw and reveal are separate actions), 383 (the trigger's event is "revealed").
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const UNDERTITAN = "sfd-175-221";
const VOID_RUSH = "sfd-188-221";

describe("Ruling 2b98ee80eba49de8 — drawing Undertitan is not revealing it: no [Add] [2]", () => {
  test("ruling: P1 draws Undertitan in their Draw Step — it lands in hand and the Energy pool stays empty", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .deckTop(P1, UNDERTITAN, "titan")
      .fillDecks({ main: 10, runes: 10 })
      .build();
    expect(game.zoneOf("titan")).toBe("mainDeck");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.hand()).toContain("titan"); // drawn …
    expect(game.p1.energy()).toBe(0); // … and nothing was added
  });

  test("contrast: an effect that actually REVEALS it from the deck does fire the ability — Void Rush adds [2]", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { rainbow: 1 } })
      .deck(P1, [UNDERTITAN, "ogn-175-298"], ["titan", "skulker"])
      .hand(P1, VOID_RUSH, "rush")
      .fillDecks({ main: 6, runes: 6 })
      .build();
    await game.p1.cast("rush");
    await game.settle({ maxSteps: 6 });
    expect(game.p1.energy()).toBe(2); // [Add] [2] from being revealed
  });

  test("the two paths are the same card and the same ability — the only difference is how it left the deck", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .deckTop(P1, UNDERTITAN, "titan")
      .fillDecks({ main: 10, runes: 10 })
      .build();
    await game.advanceTurn();
    expect(game.zoneOf("titan")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.violations()).toEqual([]);
  });
});
