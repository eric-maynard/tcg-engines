import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const tiannaCrownguard: UnitCard = {
  cardNumber: 60,
  cardType: "unit",
  domain: "calm",
  energyCost: 7,
  id: createCardId("sfd-060-221"),
  might: 4,
  name: "Tianna Crownguard",
  rarity: "epic",
  rulesText:
    "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)\nWhile I'm at a battlefield, opponents can't gain points.",
  setId: "SFD",
};
