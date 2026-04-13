import type { Ability } from "@tcg/riftbound-types";
import type { Effect } from "@tcg/riftbound-types/abilities/effect-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Zilean, Time Mage — unl-086-219
 *
 * "Once each turn, if you would play a token unit while I'm at a
 *  battlefield, you may play that token and an additional copy of it
 *  instead."
 *
 * Modeled as a replacement ability on play-token that creates an extra copy.
 * Limited to once per turn via a restriction on the trigger.
 */
const abilities: Ability[] = [
  {
    condition: { type: "while-at-battlefield" },
    duration: "permanent",
    replacement: {
      token: { name: "Copy", type: "unit" },
      type: "create-token",
    } as unknown as Effect,
    replaces: "play-token",
    target: { filter: "token", type: "unit" },
    type: "replacement",
  },
];

export const zileanTimeMage: UnitCard = {
  abilities,
  cardNumber: 86,
  cardType: "unit",
  domain: "mind",
  energyCost: 5,
  id: createCardId("unl-086-219"),
  isChampion: true,
  might: 5,
  name: "Zilean, Time Mage",
  rarity: "rare",
  rulesText:
    "Once each turn, if you would play a token unit while I'm at a battlefield, you may play that token and an additional copy of it instead.",
  setId: "UNL",
  tags: ["Zilean"],
};
