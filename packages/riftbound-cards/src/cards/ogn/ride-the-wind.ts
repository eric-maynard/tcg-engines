import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const rideTheWind: SpellCard = {
  cardNumber: 173,
  cardType: "spell",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("ogn-173-298"),
  name: "Ride the Wind",
  rarity: "common",
  rulesText: "[Action] (Play on your turn or in showdowns.)\nMove a friendly unit and ready it.",
  setId: "OGN",
  timing: "action",
};
