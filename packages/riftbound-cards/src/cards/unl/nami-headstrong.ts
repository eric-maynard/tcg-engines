import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const namiHeadstrong: UnitCard = {
  cardNumber: 52,
  cardType: "unit",
  domain: "calm",
  energyCost: 3,
  id: createCardId("unl-052-219"),
  isChampion: true,
  might: 3,
  name: "Nami, Headstrong",
  rarity: "rare",
  rulesText:
    "You may pay [calm] as an additional cost to play me.\nWhen you play me, if you paid the additional cost, [Stun] an enemy unit. (It doesn't deal combat damage this turn.)\nWhen I hold, the next time you play a unit this turn, ready it and [Buff] it.",
  setId: "UNL",
  tags: ["Nami"],
};
