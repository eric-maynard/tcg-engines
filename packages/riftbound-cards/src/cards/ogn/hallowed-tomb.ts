import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const hallowedTomb: BattlefieldCard = {
  cardNumber: 281,
  cardType: "battlefield",
  id: createCardId("ogn-281-298"),
  name: "Hallowed Tomb",
  rarity: "uncommon",
  rulesText:
    "When you hold here, you may return your Chosen Champion from your trash to your Champion Zone if it is empty.",
  setId: "OGN",
};
