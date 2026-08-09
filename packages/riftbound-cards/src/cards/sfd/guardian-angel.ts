import type { Ability } from "@tcg/riftbound-types";
import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Guardian Angel — sfd-051-221 (Equipment, +1 Might)
 *
 * [Equip] [calm], plus the protective replacement it appends to the equipped
 * unit — rule 373.2 quotes it: "If I would die, kill Guardian Angel instead.
 * Heal me, exhaust me, and recall me." (ruling 0167a87fe08432da; rules 369.1,
 * 370.1.a.1, 370.2).
 */
const abilities: Ability[] = [
  { cost: { power: ["calm"] }, keyword: "Equip", type: "keyword" },
  {
    replaces: "die",
    replacement: {
      effects: [
        { target: "self", type: "kill" },
        { amount: "all", target: { type: "trigger-source" }, type: "heal" },
        { target: { type: "trigger-source" }, type: "exhaust" },
        { target: { type: "trigger-source" }, type: "recall" },
      ],
      type: "sequence",
    },
    target: { attachedToSource: true, controller: "friendly", type: "unit" },
    type: "replacement",
  } as unknown as Ability,
];

export const guardianAngel: EquipmentCard = {
  abilities,
  cardNumber: 51,
  cardType: "equipment",
  domain: "calm",
  effectText: "If I would die, kill Guardian Angel instead. Heal me, exhaust me, and recall me.",
  energyCost: 2,
  id: createCardId("sfd-051-221"),
  mightBonus: 1,
  name: "Guardian Angel",
  rarity: "rare",
  rulesText:
    "[Equip] [calm] ([calm]: Attach this to a unit you control.)\nIf I would die, kill Guardian Angel instead. Heal me, exhaust me, and recall me.",
  setId: "SFD",
};
