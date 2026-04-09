import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const mischievousMarai: UnitCard = {
  cardNumber: 3,
  cardType: "unit",
  domain: "fury",
  energyCost: 2,
  id: createCardId("unl-003-219"),
  might: 2,
  name: "Mischievous Marai",
  rarity: "common",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\nWhen you play me to a battlefield, deal 2 to an enemy unit here.",
  setId: "UNL",
};
