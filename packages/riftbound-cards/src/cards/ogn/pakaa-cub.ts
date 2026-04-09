import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const pakaaCub: UnitCard = {
  cardNumber: 135,
  cardType: "unit",
  domain: "body",
  energyCost: 3,
  id: createCardId("ogn-135-298"),
  might: 3,
  name: "Pakaa Cub",
  rarity: "common",
  rulesText: "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)",
  setId: "OGN",
};
