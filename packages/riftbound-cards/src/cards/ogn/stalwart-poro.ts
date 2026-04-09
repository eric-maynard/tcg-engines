import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const stalwartPoro: UnitCard = {
  cardNumber: 52,
  cardType: "unit",
  domain: "calm",
  energyCost: 2,
  id: createCardId("ogn-052-298"),
  might: 2,
  name: "Stalwart Poro",
  rarity: "common",
  rulesText: "[Shield] (+1 [Might] while I'm a defender.)",
  setId: "OGN",
};
