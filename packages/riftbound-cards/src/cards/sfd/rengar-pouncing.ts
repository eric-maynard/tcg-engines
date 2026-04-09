import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const rengarPouncing: UnitCard = {
  cardNumber: 25,
  cardType: "unit",
  domain: "fury",
  energyCost: 3,
  id: createCardId("sfd-025-221"),
  isChampion: true,
  might: 3,
  name: "Rengar, Pouncing",
  rarity: "rare",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve, including to a battlefield you control.)\n[Assault 2] (+2 [Might] while I'm an attacker.)\nI can be played to a battlefield you're attacking.",
  setId: "SFD",
  tags: ["Rengar"],
};
