import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const dravenAudacious: UnitCard = {
  cardNumber: 148,
  cardType: "unit",
  domain: "chaos",
  energyCost: 6,
  id: createCardId("sfd-148-221"),
  isChampion: true,
  might: 6,
  name: "Draven, Audacious",
  rarity: "epic",
  rulesText:
    "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)\nThe first time I win a combat each turn, you score 1 point.\nWhen I die in combat, choose an opponent. They score 1 point.",
  setId: "SFD",
  tags: ["Draven"],
};
