import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const akshanMischievous: UnitCard = {
  cardNumber: 109,
  cardType: "unit",
  domain: "body",
  energyCost: 4,
  id: createCardId("sfd-109-221"),
  isChampion: true,
  might: 4,
  name: "Akshan, Mischievous",
  rarity: "rare",
  rulesText:
    "[Weaponmaster]\nYou may pay [body][body] as an additional cost to play me.\nWhen you play me, if you paid the additional cost, move an enemy gear to your base. You control it until I leave the board. If it's an Equipment, attach it to me.",
  setId: "SFD",
  tags: ["Akshan"],
};
