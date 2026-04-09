import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const runePrison: SpellCard = {
  cardNumber: 50,
  cardType: "spell",
  domain: "calm",
  energyCost: 2,
  id: createCardId("ogn-050-298"),
  name: "Rune Prison",
  rarity: "common",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nStun a unit. (It doesn't deal combat damage this turn.)",
  setId: "OGN",
  timing: "action",
};
