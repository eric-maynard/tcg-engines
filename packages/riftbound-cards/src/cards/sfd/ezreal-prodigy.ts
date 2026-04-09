import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const ezrealProdigy: UnitCard = {
  cardNumber: 149,
  cardType: "unit",
  domain: "chaos",
  energyCost: 3,
  id: createCardId("sfd-149-221"),
  isChampion: true,
  might: 3,
  name: "Ezreal, Prodigy",
  rarity: "epic",
  rulesText:
    "When you play me, discard 1, then draw 2.\nOptional additional costs you pay cost [1] or [rainbow] less.",
  setId: "SFD",
  tags: ["Ezreal"],
};
