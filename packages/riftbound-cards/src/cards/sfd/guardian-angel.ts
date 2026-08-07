import type { Ability } from "@tcg/riftbound-types";
import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Guardian Angel — sfd-051-221 (Equipment, +1 Might)
 *
 * [Equip] [calm], plus the protective replacement the rulings rely on: the
 * Equipment dies in place of the unit it is attached to (ruling
 * 0167a87fe08432da; rules 369.1, 370.1.a.1, 370.2).
 */
const abilities: Ability[] = [
  { cost: { power: ["calm"] }, keyword: "Equip", type: "keyword" },
  {
    replaces: "die",
    replacement: { target: "self", type: "kill" },
    target: { attachedToSource: true, controller: "friendly", type: "unit" },
    type: "replacement",
  },
];

export const guardianAngel: EquipmentCard = {
  abilities,
  cardNumber: 51,
  cardType: "equipment",
  domain: "calm",
  energyCost: 2,
  id: createCardId("sfd-051-221"),
  mightBonus: 1,
  name: "Guardian Angel",
  rarity: "rare",
  rulesText: "[Equip] [calm] ([calm]: Attach this to a unit you control.)",
  setId: "SFD",
};
