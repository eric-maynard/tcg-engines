import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Annie, Fiery — ogs-001-024
 *
 * Your spells and abilities deal 1 Bonus Damage. (Each instance of
 * damage the spell deals is increased by 1.)
 *
 * Captured as a controller-scoped virtual keyword BonusDamage with value 1.
 * The engine damage pipeline honors this aggregate when it sees the keyword
 * on any friendly card (support is partial today).
 */
const abilities: Ability[] = [
  {
    effect: {
      keyword: "BonusDamage",
      target: "controller",
      type: "grant-keyword",
      value: 1,
    },
    type: "static",
  },
];

export const annieFiery: UnitCard = {
  abilities,
  cardNumber: 1,
  cardType: "unit",
  domain: "fury",
  energyCost: 5,
  id: createCardId("ogs-001-024"),
  isChampion: true,
  might: 4,
  name: "Annie, Fiery",
  rarity: "epic",
  rulesText:
    "Your spells and abilities deal 1 Bonus Damage. (Each instance of damage the spell deals is increased by 1.)",
  setId: "OGS",
  tags: ["Annie"],
};
