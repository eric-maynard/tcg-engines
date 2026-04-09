import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const confront: SpellCard = {
  cardNumber: 129,
  cardType: "spell",
  domain: "body",
  energyCost: 2,
  id: createCardId("ogn-129-298"),
  name: "Confront",
  rarity: "common",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nUnits you play this turn enter ready. Draw 1.",
  setId: "OGN",
  timing: "action",
};
