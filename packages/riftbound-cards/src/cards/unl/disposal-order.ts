import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Disposal Order — unl-103-219 (Reaction spell)
 *
 * "[Reaction] Choose one —
 *  Choose up to 3 cards from opponents' trashes. Their owners recycle them.
 *  Draw 1."
 *
 * Modeled as a single `choice` effect with two options:
 *  1. Recycle up to 3 cards targeted from opponents' trashes. The recycle
 *     effect's `target` narrows to enemy-owned cards in the `trash`
 *     location, with `quantity: { upTo: 3 }`. `from: "trash"` tells the
 *     engine the recycled cards come from the trash (bottom of main deck).
 *  2. Draw 1.
 */
const abilities: Ability[] = [
  {
    effect: {
      options: [
        {
          effect: {
            amount: 3,
            from: "trash",
            target: {
              controller: "enemy",
              location: "trash",
              quantity: { upTo: 3 },
              type: "card",
            },
            type: "recycle",
          },
          label: "Recycle up to 3 from opponents' trashes",
        },
        {
          effect: { amount: 1, type: "draw" },
          label: "Draw 1",
        },
      ],
      type: "choice",
    },
    timing: "reaction",
    type: "spell",
  },
];

export const disposalOrder: SpellCard = {
  abilities,
  cardNumber: 103,
  cardType: "spell",
  domain: "body",
  energyCost: 2,
  id: createCardId("unl-103-219"),
  name: "Disposal Order",
  rarity: "uncommon",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nChoose one —Choose up to 3 cards from opponents' trashes. Their owners recycle them.Draw 1.",
  setId: "UNL",
  timing: "reaction",
};
