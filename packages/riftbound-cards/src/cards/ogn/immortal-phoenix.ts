import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Immortal Phoenix — ogn-037-298
 *
 * [Assault 2]
 * When you kill a unit with a spell, you may pay [1][fury] to play me from
 * your trash.
 *
 * The "kill with a spell" trigger fires on any enemy unit death where the
 * source is a spell. The effect plays this card from its owner's trash at
 * an optional cost.
 */
const abilities: Ability[] = [
  { keyword: "Assault", type: "keyword", value: 2 },
  {
    condition: {
      cost: { energy: 1, power: ["fury"] },
      type: "pay-cost",
    },
    effect: {
      from: "trash",
      target: "self",
      type: "play",
    },
    optional: true,
    trigger: {
      event: "die",
      on: { cardType: "unit", filter: "killed-by-spell" },
    },
    type: "triggered",
  },
];

export const immortalPhoenix: UnitCard = {
  abilities,
  cardNumber: 37,
  cardType: "unit",
  domain: "fury",
  energyCost: 3,
  id: createCardId("ogn-037-298"),
  might: 3,
  name: "Immortal Phoenix",
  rarity: "epic",
  rulesText:
    "[Assault 2] (+2 [Might] while I'm an attacker.)\nWhen you kill a unit with a spell, you may pay [1][fury] to play me from your trash.",
  setId: "OGN",
};
