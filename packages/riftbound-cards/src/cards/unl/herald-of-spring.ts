import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const heraldOfSpring: UnitCard = {
  cardNumber: 34,
  cardType: "unit",
  domain: "calm",
  energyCost: 4,
  id: createCardId("unl-034-219"),
  might: 4,
  name: "Herald of Spring",
  rarity: "common",
  rulesText: "[Hunt] (When I conquer or hold, gain 1 XP.)\nWhen you play me, gain 2 XP.",
  setId: "UNL",
};
