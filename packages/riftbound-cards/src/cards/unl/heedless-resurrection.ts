import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const heedlessResurrection: SpellCard = {
  cardNumber: 142,
  cardType: "spell",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("unl-142-219"),
  name: "Heedless Resurrection",
  rarity: "rare",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nAs an additional cost to play this, kill a friendly unit.\nPlay a unit from your trash that costs no more Energy and no more Power than the killed unit, ignoring its cost.",
  setId: "UNL",
  timing: "reaction",
};
