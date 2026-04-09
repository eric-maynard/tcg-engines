import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const demacianDiplomat: UnitCard = {
  cardNumber: 92,
  cardType: "unit",
  domain: "body",
  energyCost: 2,
  id: createCardId("unl-092-219"),
  might: 2,
  name: "Demacian Diplomat",
  rarity: "common",
  rulesText: "When you play me, gain 1 XP.",
  setId: "UNL",
};
