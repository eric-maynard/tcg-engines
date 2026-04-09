import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const reksaiBreacher: UnitCard = {
  cardNumber: 29,
  cardType: "unit",
  domain: "fury",
  energyCost: 3,
  id: createCardId("sfd-029-221"),
  isChampion: true,
  might: 3,
  name: "Rek'Sai, Breacher",
  rarity: "epic",
  rulesText:
    "[Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.)\n[Assault] (+1 [Might] while I'm an attacker.)\nFriendly units played from anywhere other than a player's hand have [Accelerate].",
  setId: "SFD",
  tags: ["Rek'Sai"],
};
