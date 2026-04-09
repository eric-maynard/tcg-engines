import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const lucianGunslinger: UnitCard = {
  cardNumber: 28,
  cardType: "unit",
  domain: "fury",
  energyCost: 3,
  id: createCardId("sfd-028-221"),
  isChampion: true,
  might: 2,
  name: "Lucian, Gunslinger",
  rarity: "epic",
  rulesText:
    "[Assault] (+1 [Might] while I'm an attacker.)\nWhen I attack, deal damage equal to my [Assault] to an enemy unit here.",
  setId: "SFD",
  tags: ["Lucian"],
};
