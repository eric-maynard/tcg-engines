import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const undyingLegion: UnitCard = {
  cardNumber: 25,
  cardType: "unit",
  domain: "fury",
  energyCost: 3,
  id: createCardId("unl-025-219"),
  might: 3,
  name: "Undying Legion",
  rarity: "rare",
  rulesText:
    "[Legion][&gt;] You may play me from your trash for [3][fury]. (Get the effect if you've played another card this turn.)",
  setId: "UNL",
};
