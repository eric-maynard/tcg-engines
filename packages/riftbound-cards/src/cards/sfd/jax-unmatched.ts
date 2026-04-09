import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const jaxUnmatched: UnitCard = {
  cardNumber: 54,
  cardType: "unit",
  domain: "calm",
  energyCost: 5,
  id: createCardId("sfd-054-221"),
  isChampion: true,
  might: 5,
  name: "Jax, Unmatched",
  rarity: "rare",
  rulesText:
    "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)\nYour Equipment everywhere have [Quick-Draw]. (Each gains [Reaction]. When you play it, attach it to a unit you control.)",
  setId: "SFD",
  tags: ["Jax"],
};
