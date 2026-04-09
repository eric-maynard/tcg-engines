import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const voidAssault: SpellCard = {
  cardNumber: 202,
  cardType: "spell",
  domain: ["body", "chaos"],
  energyCost: 2,
  id: createCardId("unl-202-219"),
  name: "Void Assault",
  rarity: "epic",
  rulesText:
    "Move a friendly unit, then move an enemy unit. (If they both move to a battlefield you don't control, you're the attacker.)",
  setId: "UNL",
  timing: "action",
};
