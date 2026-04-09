import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const siphonPower: SpellCard = {
  cardNumber: 266,
  cardType: "spell",
  domain: ["mind", "order"],
  energyCost: 2,
  id: createCardId("ogn-266-298"),
  name: "Siphon Power",
  rarity: "epic",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nChoose a battlefield. Give friendly units there +1 [Might] this turn and enemy units there -1 [Might] this turn, to a minimum of 1 [Might].",
  setId: "OGN",
  timing: "reaction",
};
