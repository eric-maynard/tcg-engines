import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const petalPixie: UnitCard = {
  cardNumber: 76,
  cardType: "unit",
  domain: "mind",
  energyCost: 2,
  id: createCardId("unl-076-219"),
  might: 2,
  name: "Petal Pixie",
  rarity: "uncommon",
  rulesText: "I have +1 [Might] for each of your units with [Temporary] at my battlefield.",
  setId: "UNL",
};
