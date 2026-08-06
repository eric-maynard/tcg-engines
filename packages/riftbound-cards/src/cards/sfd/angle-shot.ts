import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Angle Shot — sfd-011-221
 *
 * "Choose a unit and an Equipment with the same controller. Attach that
 *  Equipment to that unit or detach that Equipment from that unit. Draw 1."
 *
 * rule 434 / 435: the chosen pair selects the half that applies — an Equipment
 * already attached to the chosen unit detaches, otherwise it attaches. The
 * phrasing is unique to this card, so the abilities are explicit rather than parsed.
 */
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        {
          equipment: { type: "equipment" },
          to: { type: "unit" },
          type: "attach-or-detach",
        },
        { amount: 1, type: "draw" },
      ],
      type: "sequence",
    },
    timing: "reaction",
    type: "spell",
  },
];

export const angleShot: SpellCard = {
  abilities,
  cardNumber: 11,
  cardType: "spell",
  domain: "fury",
  energyCost: 2,
  id: createCardId("sfd-011-221"),
  name: "Angle Shot",
  rarity: "uncommon",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nChoose a unit and an Equipment with the same controller. Attach that Equipment to that unit or detach that Equipment from that unit. Draw 1.",
  setId: "SFD",
  timing: "reaction",
};
