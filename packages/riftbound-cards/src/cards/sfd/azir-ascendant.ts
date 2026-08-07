import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Azir, Ascendant — sfd-050-221
 *
 * [calm]: [Action] — Choose a unit you control. Move me to its location and it to
 * my original location. If it's equipped, you may attach one of its Equipment to me.
 *
 * The trade of locations is a `move` with `swap` (rule 455 / 350.1); rule 716's
 * optional attach rides on the same effect because only the swap knows which unit
 * was chosen. The phrasing is unique to this card, so it is spelled out here
 * rather than taught to the parser.
 */
const abilities: Ability[] = [
  {
    cost: { power: ["calm"] },
    effect: {
      mayAttachPartnerEquipment: true,
      partner: { controller: "friendly", type: "unit" },
      swap: true,
      type: "move",
    },
    // rule 377.2.b — "Use only once per turn" is a condition on ACTIVATING.
    restrictions: [{ type: "once-per-turn" }],
    type: "activated",
  },
];

export const azirAscendant: UnitCard = {
  abilities,
  cardNumber: 50,
  cardType: "unit",
  domain: "calm",
  energyCost: 6,
  id: createCardId("sfd-050-221"),
  isChampion: true,
  might: 6,
  name: "Azir, Ascendant",
  rarity: "rare",
  rulesText:
    "[calm]: [Action] — Choose a unit you control. Move me to its location and it to my original location. If it's equipped, you may attach one of its Equipment to me. Use only once per turn.",
  setId: "SFD",
  tags: ["Azir"],
};
