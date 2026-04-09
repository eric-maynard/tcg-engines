import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const ezrealDashing: UnitCard = {
  cardNumber: 82,
  cardType: "unit",
  domain: "mind",
  energyCost: 4,
  id: createCardId("sfd-082-221"),
  isChampion: true,
  might: 3,
  name: "Ezreal, Dashing",
  rarity: "rare",
  rulesText:
    "When I attack or defend, deal damage equal to my Might to an enemy unit here.\nI don't deal combat damage.\n[mind]: [Action] — Move me to your base.",
  setId: "SFD",
  tags: ["Ezreal"],
};
