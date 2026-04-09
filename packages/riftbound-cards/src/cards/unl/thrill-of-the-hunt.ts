import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const thrillOfTheHunt: SpellCard = {
  cardNumber: 184,
  cardType: "spell",
  domain: ["fury", "body"],
  energyCost: 2,
  id: createCardId("unl-184-219"),
  name: "Thrill of the Hunt",
  rarity: "epic",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nBanish a friendly unit, then its owner plays it to any battlefield, ignoring its cost.",
  setId: "UNL",
  timing: "reaction",
};
