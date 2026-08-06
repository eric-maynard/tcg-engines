import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Piercing Light — sfd-023-221
 *
 * "[Repeat] [2][fury] Deal 2 to a unit at a battlefield, then deal 2 to up to
 *  one other unit."
 *
 * rule 355.8 — the first unit is a mandatory target chosen as the spell is
 * played; rule 355.13 — the second ("up to one other unit", anywhere) may be
 * left unchosen, and it is a slot of its own rather than a restatement of the
 * first.
 */
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        { amount: 2, target: { location: "battlefield", type: "unit" }, type: "damage" },
        { amount: 2, target: { quantity: { upTo: 1 }, type: "unit" }, type: "damage" },
      ],
      type: "sequence",
    },
    repeat: { energy: 2, power: ["fury"] },
    timing: "action",
    type: "spell",
  },
];

export const piercingLight: SpellCard = {
  abilities,
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
