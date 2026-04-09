import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const poppyDefenderOfTheMeek: UnitCard = {
  cardNumber: 178,
  cardType: "unit",
  domain: "order",
  energyCost: 6,
  id: createCardId("unl-178-219"),
  isChampion: true,
  might: 5,
  name: "Poppy, Defender of the Meek",
  rarity: "epic",
  rulesText:
    "You may spend 3 XP as an additional cost to play me. If you do, I cost [3] less.\n[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)\n[Tank] (I must be assigned combat damage first.)",
  setId: "UNL",
  tags: ["Poppy"],
};
