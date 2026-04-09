import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const wallop: SpellCard = {
  cardNumber: 146,
  cardType: "spell",
  domain: "body",
  energyCost: 2,
  id: createCardId("ogn-146-298"),
  name: "Wallop",
  rarity: "uncommon",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nAs you play this, you may spend a buff as an additional cost. If you do, ignore this spell's cost.\nReady a unit.",
  setId: "OGN",
  timing: "action",
};
