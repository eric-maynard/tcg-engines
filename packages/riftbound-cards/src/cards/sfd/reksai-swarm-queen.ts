import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const reksaiSwarmQueen: UnitCard = {
  cardNumber: 170,
  cardType: "unit",
  domain: "order",
  energyCost: 5,
  id: createCardId("sfd-170-221"),
  isChampion: true,
  might: 5,
  name: "Rek'Sai, Swarm Queen",
  rarity: "rare",
  rulesText:
    "When I attack, you may reveal the top 2 cards of your Main Deck. You may banish one, then play it. If it is a unit, you may play it here. Recycle the rest.",
  setId: "SFD",
  tags: ["Rek'Sai"],
};
