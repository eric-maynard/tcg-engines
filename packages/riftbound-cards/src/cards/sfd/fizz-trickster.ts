import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const fizzTrickster: UnitCard = {
  cardNumber: 140,
  cardType: "unit",
  domain: "chaos",
  energyCost: 3,
  id: createCardId("sfd-140-221"),
  isChampion: true,
  might: 3,
  name: "Fizz, Trickster",
  rarity: "rare",
  rulesText:
    "When you play me, you may play a spell from your trash with Energy cost no more than [3], ignoring its Energy cost. Recycle that spell after you play it. (You must still pay its Power cost.)",
  setId: "SFD",
  tags: ["Fizz"],
};
