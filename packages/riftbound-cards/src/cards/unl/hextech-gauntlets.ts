import type { Ability } from "@tcg/riftbound-types";
import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Hextech Gauntlets — unl-188-219 (Equipment)
 *
 * "[Equip] [3][rainbow]. This ability's Energy cost is reduced by the Might
 *  of the unit you choose."
 *
 * Engine primitive: the `interactiveCostReduction: "target-might"` marker
 * instructs `playGear` to reduce the card's energy cost by the Might of the
 * unit identified by `chosenTargetId` in the move parameters. The player
 * must pass the intended attachment target's instance ID along with the
 * play move, and the cost-pay step reads the target's current effective
 * Might (base + buff + equipment + static modifiers) as the reduction.
 *
 * The [Equip] keyword ability records the base equip cost
 * (3 energy + 1 rainbow power) for UI and rules reference; the actual cost
 * reduction happens at play time in the engine.
 */
const abilities: Ability[] = [
  {
    cost: { energy: 3, power: ["rainbow"] },
    keyword: "Equip",
    type: "keyword",
  },
];

export const hextechGauntlets: EquipmentCard = {
  abilities,
  cardNumber: 188,
  cardType: "equipment",
  domain: ["fury", "order"],
  energyCost: 3,
  id: createCardId("unl-188-219"),
  interactiveCostReduction: "target-might",
  mightBonus: 3,
  name: "Hextech Gauntlets",
  rarity: "epic",
  rulesText:
    "[Equip] [3][rainbow]. This ability's Energy cost is reduced by the Might of the unit you choose. (Pay the cost: Attach this to a unit you control.)",
  setId: "UNL",
};
