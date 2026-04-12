import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Stalking Wolf — unl-166-219
 *
 * [Ambush]
 * As an additional cost to play me, kill a Bird/Cat/Dog/Poro you
 * control. You may play me to its battlefield.
 *
 * Ambush + a virtual "AmbushKillPet" marker. The kill-a-friendly
 * additional cost will be wired up once the engine learns to read it
 * from the card meta.
 */
const abilities: Ability[] = [
  {
    effect: {
      keyword: "Ambush",
      target: "self",
      type: "grant-keyword",
    },
    type: "static",
  },
  {
    effect: {
      keyword: "AmbushKillPet",
      target: "self",
      type: "grant-keyword",
    },
    type: "static",
  },
];

export const stalkingWolf: UnitCard = {
  abilities,
  cardNumber: 166,
  cardType: "unit",
  domain: "order",
  energyCost: 4,
  id: createCardId("unl-166-219"),
  might: 6,
  name: "Stalking Wolf",
  rarity: "uncommon",
  rulesText:
    "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)\nAs an additional cost to play me, kill a Bird, Cat, Dog, or Poro you control. You may play me to its battlefield (even if you don't have other units there).",
  setId: "UNL",
};
