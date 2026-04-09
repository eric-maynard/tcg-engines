import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const friskyHunter: UnitCard = {
  cardNumber: 33,
  cardType: "unit",
  domain: "calm",
  energyCost: 4,
  id: createCardId("unl-033-219"),
  might: 3,
  name: "Frisky Hunter",
  rarity: "common",
  rulesText:
    "When you play me, play a 1 [Might] Bird unit token with [Deflect] here. (Opponents must pay [rainbow] to choose it with a spell or ability.)",
  setId: "UNL",
};
