import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const bulletTime: SpellCard = {
  cardNumber: 268,
  cardType: "spell",
  domain: ["body", "chaos"],
  energyCost: 1,
  id: createCardId("ogn-268-298"),
  name: "Bullet Time",
  rarity: "epic",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nPay any amount of [rainbow] to deal that much damage to all enemy units at a battlefield.",
  setId: "OGN",
  timing: "action",
};
