import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * The Academy — unl-216-219 (Battlefield)
 *
 * When you hold here, give your next spell this turn [Repeat] equal to
 * its base cost.
 */
const abilities: Ability[] = [
  {
    effect: {
      duration: "turn",
      keyword: "NextSpellRepeat",
      target: "controller",
      type: "grant-keyword",
    },
    trigger: {
      event: "hold",
      on: { controller: "friendly", location: "here" },
    },
    type: "triggered",
  },
];

export const theAcademy: BattlefieldCard = {
  abilities,
  cardNumber: 216,
  cardType: "battlefield",
  id: createCardId("unl-216-219"),
  name: "The Academy",
  rarity: "uncommon",
  rulesText:
    "When you hold here, give your next spell this turn [Repeat] equal to its base cost. (You may pay the additional cost to repeat the spell's effect.)",
  setId: "UNL",
};
