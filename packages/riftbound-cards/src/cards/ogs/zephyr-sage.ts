import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const zephyrSage: UnitCard = {
  cardNumber: 5,
  cardType: "unit",
  domain: "calm",
  energyCost: 6,
  id: createCardId("ogs-005-024"),
  might: 6,
  name: "Zephyr Sage",
  rarity: "uncommon",
  rulesText: "[Shield] (+1 [Might] while I'm a defender.)",
  setId: "OGS",
};
