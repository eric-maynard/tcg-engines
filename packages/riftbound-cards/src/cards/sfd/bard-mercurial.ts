import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const bardMercurial: UnitCard = {
  cardNumber: 79,
  cardType: "unit",
  domain: "mind",
  energyCost: 4,
  id: createCardId("sfd-079-221"),
  isChampion: true,
  might: 4,
  name: "Bard, Mercurial",
  rarity: "rare",
  rulesText:
    "You may exhaust your legend as an additional cost to play me.\nWhen you play me, if you paid the additional cost, move any number of your units to an open battlefield.",
  setId: "SFD",
  tags: ["Bard"],
};
