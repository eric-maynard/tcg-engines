import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const piercingLight: SpellCard = {
  cardNumber: 23,
  cardType: "spell",
  domain: "fury",
  energyCost: 2,
  id: createCardId("sfd-023-221"),
  name: "Piercing Light",
  rarity: "rare",
  rulesText:
    "[Repeat] [2][fury] (You may pay the additional cost to repeat this spell's effect.)\nDeal 2 to a unit at a battlefield, then deal 2 to up to one other unit.",
  setId: "SFD",
  timing: "action",
};
