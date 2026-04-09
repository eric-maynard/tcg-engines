import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const challenge: SpellCard = {
  cardNumber: 128,
  cardType: "spell",
  domain: "body",
  energyCost: 2,
  id: createCardId("ogn-128-298"),
  name: "Challenge",
  rarity: "common",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nChoose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other.",
  setId: "OGN",
  timing: "action",
};
