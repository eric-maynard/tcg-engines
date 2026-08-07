import type { Ability } from "@tcg/riftbound-types";
import type { Effect } from "@tcg/riftbound-types/abilities/effect-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Strike Down — sfd-107-221
 *
 * "Choose an equipped friendly unit. It deals damage equal to its Might to an
 *  enemy unit. Then detach an Equipment from it."
 *
 * rule 355.8 — two caster-chosen targets: the equipped friendly unit (the
 * Might reference) and the enemy unit that takes the damage, locked as
 * [reference, enemy]. rule 359.3.f.2 — the Might is read on resolution, so it
 * still includes the Equipment's bonus (the detach only happens afterwards).
 * The phrasing is unique to this card, so the abilities are explicit.
 */
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        {
          amount: { might: { controller: "friendly", filter: "equipped", type: "unit" } },
          target: { controller: "enemy", type: "unit" },
          type: "damage",
        },
        // rule 435 — "detach AN Equipment from it": exactly one, chosen by the
        // controller when the referenced unit wears more than one.
        {
          equipment: { attachedTo: "reference", type: "equipment" },
          type: "detach",
        },
      ] as unknown as Effect[],
      type: "sequence",
    } as unknown as Effect,
    timing: "standard",
    type: "spell",
  },
];

export const strikeDown: SpellCard = {
  abilities,
  cardNumber: 107,
  cardType: "spell",
  domain: "body",
  energyCost: 3,
  id: createCardId("sfd-107-221"),
  name: "Strike Down",
  rarity: "uncommon",
  rulesText:
    "Choose an equipped friendly unit. It deals damage equal to its Might to an enemy unit. Then detach an Equipment from it.",
  setId: "SFD",
  timing: "action",
};
