import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const blastCorpsCadet: UnitCard = {
  cardNumber: 13,
  cardType: "unit",
  domain: "fury",
  energyCost: 2,
  id: createCardId("sfd-013-221"),
  might: 2,
  name: "Blast Corps Cadet",
  rarity: "uncommon",
  rulesText:
    "You may pay [1][fury] as an additional cost to play me.\nWhen you play me, if you paid the additional cost, deal 2 to a unit at a battlefield.",
  setId: "SFD",
};
