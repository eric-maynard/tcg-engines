import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// rule 417/712: "Deal 2" is a flat Deal action — the trailing "for each time this spell has dealt
// damage this turn" rider belongs to the [rainbow] replay, not to the printed 2. The generic parser
// folds that "for each" into the first amount (2 x count(all units)), so the payload is explicit here.
// rule 108.2 / 809.1.c.1 / 715.1: the replay rides on the Deal action — its
// offer goes to the DAMAGED unit's controller (who may be the opponent), costs
// one power of any domain and no energy, and each replay adds 1 Bonus Damage
// ("for each time this spell has dealt damage this turn", rule 317.2.c).
const abilities: Ability[] = [
  {
    effect: {
      amount: 2,
      target: { type: "unit" },
      then: {
        cost: { power: ["rainbow"] },
        escalate: true,
        optional: true,
        player: "target-controller",
        target: "self",
        type: "play",
      },
      type: "damage",
    },
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
