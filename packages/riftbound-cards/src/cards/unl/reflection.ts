import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Reflection — unl-t06 (Token)
 *
 * (I become a copy of something when played. I don't get that card's
 * play effects.)
 *
 * This is a token with a copy-on-play mechanic. Token cards are spawned
 * with their "copy target" set by the card that creates them; there is
 * no authored ability here, only a marker keyword for the runtime.
 */
const abilities: Ability[] = [
  {
    effect: {
      keyword: "CopyOnPlay",
      target: "self",
      type: "grant-keyword",
    },
    type: "static",
  },
];

export const reflection: UnitCard = {
  abilities,
  cardNumber: 6,
  cardType: "unit",
  id: createCardId("unl-t06"),
  might: 0,
  name: "Reflection",
  rarity: "common",
  rulesText: "(I become a copy of something when played. I don't get that card's play effects.)",
  setId: "UNL",
};
