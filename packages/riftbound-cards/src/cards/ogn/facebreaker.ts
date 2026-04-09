import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const facebreaker: SpellCard = {
  cardNumber: 220,
  cardType: "spell",
  domain: "order",
  energyCost: 2,
  id: createCardId("ogn-220-298"),
  name: "Facebreaker",
  rarity: "uncommon",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\n[Action] (Play on your turn or in showdowns.)\nStun a friendly unit and an enemy unit at the same battlefield. (They don't deal combat damage this turn.)",
  setId: "OGN",
  timing: "action",
};
