import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const ireliaGraceful: UnitCard = {
  cardNumber: 141,
  cardType: "unit",
  domain: "chaos",
  energyCost: 4,
  id: createCardId("sfd-141-221"),
  isChampion: true,
  might: 4,
  name: "Irelia, Graceful",
  rarity: "rare",
  rulesText: "Your spells that choose me cost [1] or [rainbow] less.",
  setId: "SFD",
  tags: ["Irelia"],
};
