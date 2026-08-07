import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Irelia, Graceful — sfd-141-221
 *
 * Your spells that choose me cost [1] or [rainbow] less.
 *
 * rule 366.2 / 356.4.b — a continuous cost modification the caster elects one
 * half of: [1] Energy off, or one Power pip of any Domain off. `appliesTo`
 * scopes it to the controller's SPELLS whose chosen targets include me.
 */
const abilities: Ability[] = [
  {
    effect: {
      alternative: ":rb_rune_rainbow:",
      appliesTo: { chooses: "self", controller: "friendly", type: "spell" },
      by: ":rb_energy_1:",
      target: "self",
      type: "cost-reduction",
    },
    type: "static",
  },
];

export const ireliaGraceful: UnitCard = {
  abilities,
  cardNumber: 141,
  cardType: "unit",
  domain: "chaos",
  energyCost: 4,
  id: createCardId("sfd-141-221"),
  isChampion: true,
  might: 4,
  name: "Irelia, Graceful",
  rarity: "rare",
  rulesText: "Your spells that choose me cost [1] or [rainbow] less.",
  setId: "SFD",
  tags: ["Irelia"],
};
