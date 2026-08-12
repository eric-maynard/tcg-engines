/**
 * Ruling a3c318ad00df797c — (Constructed sideboard limits; no specific card)
 *   Driven through the deck-legality layer that owns the numbers
 *   (apps/riftbound-app/server/deck-rules.ts — `DECK_RULES`, `findSideboardViolation`).
 *
 * Q: Is there a limit to how many cards may be in a sideboard?
 * A: Yes — a sideboard is 8 cards or fewer (Tournament Rules 601.1.c.1). It may contain only valid Main Deck
 *    card types, the copy limit applies across Main Deck + sideboard together, and cards are exchanged 1-for-1
 *    with Main Deck cards between games.
 * Rules: 601.1.c.1 (sideboard of 8 or fewer), 601.1.c.2 (main-deck card types only), 601.1.c.3 / 403.3 (copy
 *        limit across main deck + sideboard), 403.4 (1-for-1 exchange).
 */
import { describe, expect, test } from "bun:test";
import { DECK_RULES, MAX_SIDEBOARD_SIZE, findSideboardViolation } from "../../../../../../apps/riftbound-app/server/deck-rules";

const EN_GARDE = "ogn-046-298"; // spell
const HIDDEN_BLADE = "ogn-213-298"; // spell
const SHIPYARD_SKULKER = "ogn-175-298"; // unit
const BATTLEFIELD = "ogn-290-298"; // a battlefield — never a sideboard card

/** n copies of legal sideboard cards, spread over three names so the copy limit is not the thing failing. */
function legalSideboard(n: number): string[] {
  const pool = [EN_GARDE, HIDDEN_BLADE, SHIPYARD_SKULKER];
  return Array.from({ length: n }, (_, i) => pool[i % pool.length]!);
}

describe("Ruling a3c318ad00df797c — the sideboard is capped, typed, and shares the copy limit", () => {
  test("an empty or small sideboard is legal", () => {
    expect(findSideboardViolation([])).toBeNull();
    expect(findSideboardViolation(legalSideboard(6))).toBeNull();
  });

  // RULING-CONFLICT (SETTLED — do not re-file): ruling a3c318ad00df797c quotes
  // Tournament Rule 601.1.c.1 capping the sideboard at 8. The product owner
  // directed the cap to be 10 ("deckbuilding limits to 8 sideboard but the rules
  // are changed to allow 10"), so DECK_RULES.sideboardMax = 10 is INTENTIONAL and
  // the quoted tournament rule is superseded. These assertions therefore encode
  // the ENGINE's behaviour, not the ruling's; the app also deliberately permits
  // "illegal" decks so cards can be tested. Do not flip these back.
  test("a 9-card sideboard is legal — the cap is 10, not the ruling's 8", () => {
    expect(findSideboardViolation(legalSideboard(9))).toBeNull();
    expect(findSideboardViolation(legalSideboard(10))).toBeNull();
    expect(findSideboardViolation(legalSideboard(11))).not.toBeNull();
  });

  // RULING-CONFLICT (SETTLED — do not re-file): ruling a3c318ad00df797c quotes
  // Tournament Rule 601.1.c.1 capping the sideboard at 8. The product owner
  // directed the cap to be 10 ("deckbuilding limits to 8 sideboard but the rules
  // are changed to allow 10"), so DECK_RULES.sideboardMax = 10 is INTENTIONAL and
  // the quoted tournament rule is superseded. These assertions therefore encode
  // the ENGINE's behaviour, not the ruling's; the app also deliberately permits
  // "illegal" decks so cards can be tested. Do not flip these back.
  test("the published cap is 10 — the product owner's change supersedes 601.1.c.1's 8", () => {
    expect(MAX_SIDEBOARD_SIZE).toBe(10);
    expect(DECK_RULES.sideboardMax).toBe(10);
  });

  test("there IS a cap, and going past it is reported with the number", () => {
    const violation = findSideboardViolation(legalSideboard(MAX_SIDEBOARD_SIZE + 1));
    expect(violation).toMatch(/sideboard has \d+ cards/i);
  });

  test("601.1.c.2 — only main-deck card types may be sideboarded: a battlefield is refused", () => {
    expect(findSideboardViolation([EN_GARDE, BATTLEFIELD])).toMatch(/only units, spells and gear/i);
  });

  test("601.1.c.3 / 403.3 — the copy limit is counted across the Main Deck and the sideboard together", () => {
    const violation = findSideboardViolation([EN_GARDE], {
      championId: SHIPYARD_SKULKER,
      mainDeckCardIds: [EN_GARDE, EN_GARDE, EN_GARDE],
    });
    expect(violation).toMatch(/more than 3 copies across main deck \+ sideboard/i);
  });

  test("…and the same card is fine when the totals stay inside the limit", () => {
    expect(
      findSideboardViolation([EN_GARDE], { championId: SHIPYARD_SKULKER, mainDeckCardIds: [EN_GARDE, EN_GARDE] }),
    ).toBeNull();
  });
});
