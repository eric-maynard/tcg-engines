import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Sigil of the Storm — ogn-287-298
 *
 * "When you conquer here, you must recycle one of your runes."
 */
const abilities: Ability[] = [
  {
    effect: {
      amount: 1,
      from: "board",
      target: { controller: "friendly", type: "rune" },
      type: "recycle",
    },
    // rule 383.4.c.2.b / 471.2.a — "When you conquer HERE": a Conquer Effect of
    // the conquering player, checked at THIS battlefield. Conquering another
    // battlefield while controlling the Sigil never fires it.
    trigger: {
      event: "conquer",
      on: { controller: "friendly", location: "here" },
    },
    type: "triggered",
  },
];

export const sigilOfTheStorm: BattlefieldCard = {
  abilities,
  cardNumber: 287,
  cardType: "battlefield",
  id: createCardId("ogn-287-298"),
  name: "Sigil of the Storm",
  rarity: "uncommon",
  rulesText:
    "When you conquer here, you must recycle one of your runes. (This doesn’t choose anything.)",
  setId: "OGN",
};
