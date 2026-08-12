/**
 * Ruling 2e532c3d4c4bc310 — Ember Monk (OGN-167 → ogn-167-298) · Chaos unit · [4] · 4 Might
 *   "When you play a card from [Hidden], give me +2 [Might] this turn."
 *   × Teemo, Strategist (OGN-121 → ogn-121-298) "When I defend, choose an enemy unit here and reveal the top 5
 *     cards of your Main Deck. Deal 1 to that unit for each card with [Hidden] revealed this way…"
 *
 * Q: Does Ember Monk — which mentions [Hidden] but does not have it — count for Teemo's "each card with [Hidden]"?
 * A: No. "Having X" means carrying the ability X; merely printing the word X in the rules text is not having it.
 * Rules: 111 (an object has an ability only if it is one of its abilities), 801 (keywords).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TEEMO = "ogn-121-298";
const EMBER_MONK = "ogn-167-298"; // references [Hidden]; does NOT have it
const FIGHT_OR_FLIGHT = "ogn-168-298"; // really has [Hidden]
const SWITCHEROO = "sfd-145-221"; // really has [Hidden]
const SKULKER = "ogn-175-298"; // vanilla filler

/** P2's turn. P1 holds bf1 with Teemo; P2 attacks with a 6-Might Brute. The top 5 of P1's deck is `top`. */
function board(top: readonly string[]) {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", TEEMO, "teemo")
    .unit(P2, "base", { might: 6, name: "Brute" }, "brute")
    .deck(P1, [...top], top.map((_, i) => `t${i}`))
    .fillDecks({ main: 6, runes: 6 });
}

/** P2 attacks so Teemo defends; the trigger picks the lone enemy unit here and reveals 5. */
async function attackInto(top: readonly string[]): Promise<number> {
  const game = await board(top).build();
  await game.p2.move("brute", "bf1");
  expect(game.state("teemo").combatRole).toBe("defender");
  // Resolve only Teemo's defend trigger — the Combat Cleanup would heal the damage away.
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
  return game.state("brute").damage;
}

describe("Ruling 2e532c3d4c4bc310 — Ember Monk does not HAVE [Hidden], it only mentions it", () => {
  test("the card itself carries no Hidden keyword, unlike Fight or Flight", async () => {
    const game = await scenario().hand(P1, EMBER_MONK, "monk").hand(P1, FIGHT_OR_FLIGHT, "fof").build();
    expect(game.state("monk").keywords).not.toContain("Hidden");
    expect(game.state("monk").rulesText).toContain("Hidden"); // …but the word is right there in the text
    expect(game.state("fof").keywords).toContain("Hidden");
  });

  test("ruling: five Ember Monks on top count for NOTHING — Teemo deals 0", async () => {
    expect(await attackInto([EMBER_MONK, EMBER_MONK, EMBER_MONK, SKULKER, SKULKER])).toBe(0);
  });

  test("control: two genuinely [Hidden] cards among the five deal 2", async () => {
    expect(await attackInto([FIGHT_OR_FLIGHT, SWITCHEROO, SKULKER, SKULKER, SKULKER])).toBe(2);
  });

  test("mixed: one real [Hidden] card beside two Ember Monks deals exactly 1", async () => {
    expect(await attackInto([EMBER_MONK, FIGHT_OR_FLIGHT, EMBER_MONK, SKULKER, SKULKER])).toBe(1);
  });
});
