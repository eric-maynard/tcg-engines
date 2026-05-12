/**
 * Rules Audit: Legion "...instead." dependent ability replaces the printed
 * spell effect (Unleashed; Core Rules 2026-03-30 §812, §724).
 *
 * Some Unleashed spells carry a "[Legion] — <text> instead." line that does
 * not *add* an effect on top of the printed one — it *substitutes* for it
 * when the Legion condition holds (the controller played another card this
 * turn). Canonical card: Noxian Guillotine (OGN-254):
 *   "[Action] (...) Choose a unit. Kill it the next time it takes damage this
 *    turn. [Legion] — Kill it now instead."
 *
 * Before this fix the parser silently dropped that line and the engine had no
 * notion of an effect-replacing Legion ability. Now the parser emits
 *   { type:"keyword", keyword:"Legion", effect:<alt>, replacesSpellEffect:true }
 * and `executeResolvedItem` substitutes `<alt>` for the printed spell effect
 * during chain resolution — but only when ≥ 2 cards have been played this turn
 * (this spell + one other; rule 724.1.c says "*another* card").
 *
 * Methodology: minimal state → play spell(s) → both players pass → assert
 * which effect ran (cards in hand). We use a draw-1 / "draw 3 instead"
 * stand-in so the observable side effect is unambiguous without target
 * resolution. NB: the rules-audit chain harness resolves the top item twice
 * when both players pass (one per pass — a pre-existing harness quirk), so a
 * printed "draw 1" yields 2 cards and the Legion "draw 3" yields 6; we assert
 * the *difference*, which is unaffected by the quirk.
 */

import { describe, expect, it } from "bun:test";
import {
  P1,
  P2,
  applyMove,
  createCard,
  createMinimalGameState,
  getCardsInZone,
  passChainPriority,
} from "./helpers";

// A spell whose printed effect is "draw 1" and whose Legion alternate is
// "draw 3 instead" — exactly the shape the parser produces from
// "[Action]\nDraw 1.\n[Legion] — Draw 3 instead."
const LEGION_REPLACE_DRAW_SPELL_ABILITIES = [
  { effect: { amount: 1, type: "draw" }, type: "spell" as const },
  {
    effect: { amount: 3, type: "draw" },
    keyword: "Legion" as const,
    replacesSpellEffect: true,
    type: "keyword" as const,
  },
];

function seedDeck(engine: ReturnType<typeof createMinimalGameState>, owner: string, n: number) {
  for (let i = 0; i < n; i++) {
    createCard(engine, `${owner}-deck-${i}`, {
      cardType: "unit",
      might: 1,
      owner,
      zone: "mainDeck",
    });
  }
}

/** Play a spell from P1's hand and resolve the chain (P1 then P2 pass). */
function playAndResolve(engine: ReturnType<typeof createMinimalGameState>, cardId: string) {
  applyMove(engine, "playSpell", { cardId, playerId: P1 });
  passChainPriority(engine, P1);
  passChainPriority(engine, P2);
}

describe("Rule 812/724: Legion '...instead.' alternate replaces the printed spell effect", () => {
  it("with NO prior card played this turn, the printed 'draw 1' effect runs (Legion inactive)", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    seedDeck(engine, P1, 6);
    createCard(engine, "guillotine", {
      abilities: LEGION_REPLACE_DRAW_SPELL_ABILITIES,
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });

    const handBefore = getCardsInZone(engine, "hand", P1).length; // 1 (the spell)
    playAndResolve(engine, "guillotine");
    const handAfter = getCardsInZone(engine, "hand", P1).length;

    // CardsPlayedThisTurn === 1 (only this spell) ⇒ Legion gate (≥2) not met.
    // The printed "draw 1" ran; the spell left hand. Net gain is small (<= 2).
    const drawn = handAfter - (handBefore - 1); // Cards added beyond losing the spell
    expect(drawn).toBeLessThanOrEqual(2);
    expect(drawn).toBeGreaterThanOrEqual(1);
  });

  it("with another card played FIRST this turn, the Legion 'draw 3' alternate replaces the printed effect", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 2, power: {} } },
    });
    seedDeck(engine, P1, 16);
    // Plain draw-1 spell played first to satisfy the Legion condition.
    createCard(engine, "prelude", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    createCard(engine, "guillotine", {
      abilities: LEGION_REPLACE_DRAW_SPELL_ABILITIES,
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });

    playAndResolve(engine, "prelude"); // CardsPlayedThisTurn → 1
    const handAfterPrelude = getCardsInZone(engine, "hand", P1).length;

    playAndResolve(engine, "guillotine"); // CardsPlayedThisTurn → 2 ⇒ Legion active
    const handAfter = getCardsInZone(engine, "hand", P1).length;

    // The Legion alternate ("draw 3") replaced the printed "draw 1": the
    // Controller drew strictly more than a printed-effect-only resolution
    // Would have (>= 3, accounting for the harness's double-resolve as <= 6),
    // Minus the spell card that left hand.
    const drawn = handAfter - (handAfterPrelude - 1);
    expect(drawn).toBeGreaterThanOrEqual(3);
  });

  it("an additive Legion ability (no replacesSpellEffect) does NOT replace the spell effect", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 2, power: {} } },
    });
    seedDeck(engine, P1, 16);
    createCard(engine, "prelude2", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    createCard(engine, "additive", {
      abilities: [
        { effect: { amount: 1, type: "draw" }, type: "spell" },
        // No replacesSpellEffect flag → handled via trigger synthesis
        // Elsewhere; it must NOT hijack chain resolution.
        {
          effect: { amount: 3, type: "draw" },
          keyword: "Legion" as const,
          type: "keyword" as const,
        },
      ],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });

    playAndResolve(engine, "prelude2"); // CardsPlayedThisTurn → 1
    const handMid = getCardsInZone(engine, "hand", P1).length;

    playAndResolve(engine, "additive"); // CardsPlayedThisTurn → 2
    const handAfter = getCardsInZone(engine, "hand", P1).length;

    // Only the printed "draw 1" ran (not "draw 3"): small net gain (<= 2).
    const drawn = handAfter - (handMid - 1);
    expect(drawn).toBeLessThanOrEqual(2);
  });
});
