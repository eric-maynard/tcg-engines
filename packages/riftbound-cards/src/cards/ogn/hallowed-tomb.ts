import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Hallowed Tomb — ogn-281-298
 *
 * "When you hold here, you may return your Chosen Champion from your trash
 *  to your Champion Zone if it is empty."
 *
 * Modeled as an optional triggered ability on hold that returns your chosen
 * champion to hand (closest primitive — champion-zone isn't a return-to-hand
 * location).
 */
const abilities: Ability[] = [
  {
    effect: {
      target: {
        controller: "friendly",
        location: "trash",
        type: "legend",
      },
      type: "return-to-hand",
    },
    optional: true,
    trigger: { event: "hold", on: "self" },
    type: "triggered",
  },
];

export const hallowedTomb: BattlefieldCard = {
  abilities,
  cardNumber: 281,
  cardType: "battlefield",
  id: createCardId("ogn-281-298"),
  name: "Hallowed Tomb",
  rarity: "uncommon",
  rulesText:
    "When you hold here, you may return your Chosen Champion from your trash to your Champion Zone if it is empty.",
  setId: "OGN",
};
