import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const mutatedMouser: UnitCard = {
  cardNumber: 36,
  cardType: "unit",
  domain: "calm",
  energyCost: 2,
  id: createCardId("unl-036-219"),
  might: 1,
  name: "Mutated Mouser",
  rarity: "common",
  rulesText:
    "[Shield 2] (+2 [Might] while I'm a defender.)\n[Tank] (I must be assigned combat damage first.)",
  setId: "UNL",
};
