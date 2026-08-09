import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * rule 105.2 / 740.1.a — "+1 [Might] for each buffed friendly unit at my
 * battlefield": the parser only emits a flat +1 with a `per` phrase, so the
 * count is spelled out as a target descriptor. `location: "battlefield"`
 * scopes it to Sett's own battlefield and yields nothing while he is in base.
 *
 * rule 740.1.a / 740.2.a — "friendly" only means "shares my controller", so a
 * buffed Sett counts himself; the rules say "other friendly units" when the
 * source is meant to be excluded, and this line does not.
 */
const abilities: Ability[] = [
  { keyword: "Tank", type: "keyword" },
  {
    effect: {
      amount: {
        count: {
          controller: "friendly",
          filter: "buffed",
          location: "battlefield",
          type: "unit",
        },
      },
      target: "self",
      type: "modify-might",
    },
    type: "static",
  },
];

export const settKingpin: UnitCard = {
  abilities,
  cardNumber: 240,
  cardType: "unit",
  domain: "order",
  energyCost: 4,
  id: createCardId("ogn-240-298"),
  isChampion: true,
  might: 5,
  name: "Sett, Kingpin",
  rarity: "rare",
  rulesText:
    "[Tank] (I must be assigned combat damage first.)\nI get +1 [Might] for each buffed friendly unit at my battlefield.",
  setId: "OGN",
  tags: ["Sett"],
};
