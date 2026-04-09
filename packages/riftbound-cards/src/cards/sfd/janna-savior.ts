import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const jannaSavior: UnitCard = {
  cardNumber: 53,
  cardType: "unit",
  domain: "calm",
  energyCost: 3,
  id: createCardId("sfd-053-221"),
  isChampion: true,
  might: 3,
  name: "Janna, Savior",
  rarity: "rare",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve, including to a battlefield you control.)\nWhen you play me, heal your units here, then move up to one enemy unit from here to its base.",
  setId: "SFD",
  tags: ["Janna"],
};
