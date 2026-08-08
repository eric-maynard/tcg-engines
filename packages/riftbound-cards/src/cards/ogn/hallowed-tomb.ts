import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Hallowed Tomb — ogn-281-298
 *
 * "When you hold here, you may return your Chosen Champion from your trash
 *  to your Champion Zone if it is empty."
 *
 * Optional hold trigger: the holder's Chosen Champion (rule 103.2.a.3 — the
 * champion unit tagged for their Legend, never the Legend itself) goes from
 * their trash back to their Champion Zone, from where it may be played again
 * (rule 419.1.a). "If it is empty" gates the whole effect.
 */
const abilities: Ability[] = [
  {
    effect: {
      from: "trash",
      ifZoneEmpty: true,
      type: "return-to-champion-zone",
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
