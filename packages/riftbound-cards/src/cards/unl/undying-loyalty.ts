import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const undyingLoyalty: SpellCard = {
  cardNumber: 168,
  cardType: "spell",
  domain: "order",
  energyCost: 2,
  id: createCardId("unl-168-219"),
  name: "Undying Loyalty",
  rarity: "uncommon",
  rulesText:
    "This costs [2] less if you choose a Bird, Cat, Dog, or Poro.\nPlay a unit with cost no more than [2] and no more than [rainbow] from your trash, ignoring its cost.",
  setId: "UNL",
  timing: "action",
};
