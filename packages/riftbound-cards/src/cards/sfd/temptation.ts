import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const temptation: SpellCard = {
  // rule 449.1 — "to a location where there's a unit with the same controller"
  // is part of the instruction: the destination menu is limited to the base /
  // battlefields where the MOVED unit's controller already has another unit.
  // The parser only produces an unrestricted `to: "choose"`, so it is spelled
  // out here.
  abilities: [
    {
      effect: {
        target: { controller: "enemy", type: "unit" },
        to: "location-with-same-controller-unit",
        type: "move",
      },
      repeat: { energy: 2 },
      timing: "standard",
      type: "spell",
    },
  ] as Ability[],
  cardNumber: 129,
  cardType: "spell",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("sfd-129-221"),
  name: "Temptation",
  rarity: "common",
  rulesText:
    "[Repeat] [2] (You may pay the additional cost to repeat this spell's effect.)\nMove an enemy unit to a location where there's a unit with the same controller.",
  setId: "SFD",
  timing: "action",
};
