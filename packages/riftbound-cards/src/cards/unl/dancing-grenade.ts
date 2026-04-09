import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const dancingGrenade: SpellCard = {
  cardNumber: 20,
  cardType: "spell",
  domain: "fury",
  energyCost: 2,
  id: createCardId("unl-020-219"),
  name: "Dancing Grenade",
  rarity: "rare",
  rulesText:
    "Deal 2 to a unit. Its controller may play this spell again for [rainbow]. If they do, this deals 1 additional Bonus Damage for each time this spell has dealt damage this turn.",
  setId: "UNL",
  timing: "action",
};
