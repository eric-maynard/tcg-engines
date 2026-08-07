import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// rule 417/712: "Deal 2" is a flat Deal action — the trailing "for each time this spell has dealt
// damage this turn" rider belongs to the [rainbow] replay, not to the printed 2. The generic parser
// folds that "for each" into the first amount (2 x count(all units)), so the payload is explicit here.
const abilities: Ability[] = [
  {
    effect: { amount: 2, target: { type: "unit" }, type: "damage" },
    type: "spell",
  } as unknown as Ability,
];

export const dancingGrenade: SpellCard = {
  abilities,
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
