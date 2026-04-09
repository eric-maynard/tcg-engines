import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const targonianVisionary: UnitCard = {
  cardNumber: 98,
  cardType: "unit",
  domain: "body",
  energyCost: 6,
  id: createCardId("unl-098-219"),
  might: 6,
  name: "Targonian Visionary",
  rarity: "common",
  rulesText: "[Level 11][&gt;] I have +4 [Might]. (While you have 11+ XP, get the effect.)",
  setId: "UNL",
};
