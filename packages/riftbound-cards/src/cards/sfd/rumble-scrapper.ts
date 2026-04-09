import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const rumbleScrapper: UnitCard = {
  cardNumber: 89,
  cardType: "unit",
  domain: "mind",
  energyCost: 5,
  id: createCardId("sfd-089-221"),
  isChampion: true,
  might: 4,
  name: "Rumble, Scrapper",
  rarity: "epic",
  rulesText:
    "Your Mechs have +1 [Might] (including me).\nWhen I hold, play a 3 [Might] Mech unit token to your base.",
  setId: "SFD",
  tags: ["Rumble"],
};
