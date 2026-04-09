import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const blueSentinel: UnitCard = {
  cardNumber: 87,
  cardType: "unit",
  domain: "mind",
  energyCost: 4,
  id: createCardId("unl-087-219"),
  might: 4,
  name: "Blue Sentinel",
  rarity: "epic",
  rulesText:
    "[Shield 2] (+2 [Might] while I'm a defender.)\nYour hold effects for holding here trigger an additional time.\nWhen I hold, [Add] [rainbow] at the start of your next Main Phase. (Abilities that add resources can't be reacted to.)",
  setId: "UNL",
};
