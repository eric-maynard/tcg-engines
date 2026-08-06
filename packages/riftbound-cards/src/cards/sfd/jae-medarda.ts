import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Jae Medarda — sfd-142-221
 *
 * When you choose me with a spell, draw 1.
 *
 * Trigger: `choose` event with self as the chosen target, restricted to
 * spell-sourced choices made by Jae's controller.
 * rule-id: sfd-142-221 — `filter: ["self","spell"]` + `actor: "controller"`;
 * a gear/unit ability choosing Jae must NOT draw.
 */
const abilities: Ability[] = [
  {
    effect: { amount: 1, type: "draw" },
    trigger: {
      event: "choose",
      on: {
        actor: "controller",
        cardType: "unit",
        filter: ["self", "spell"],
      },
    },
    type: "triggered",
  },
];

export const jaeMedarda: UnitCard = {
  abilities,
  cardNumber: 142,
  cardType: "unit",
  domain: "chaos",
  energyCost: 5,
  id: createCardId("sfd-142-221"),
  might: 5,
  name: "Jae Medarda",
  rarity: "rare",
  rulesText: "When you choose me with a spell, draw 1.",
  setId: "SFD",
};
