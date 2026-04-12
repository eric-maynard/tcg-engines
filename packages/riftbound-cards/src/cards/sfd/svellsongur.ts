import type { Ability } from "@tcg/riftbound-types";
import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Svellsongur — sfd-059-221 (Equipment)
 *
 * "[Equip] [1][calm] ([1][calm]: Attach this to a unit you control.)
 *  As this is attached to a unit, copy that unit's text to this Equipment's
 *  effect text for as long as this is attached to it."
 *
 * Engine primitive: the `copyAttachedUnitText` flag on the card-definition
 * lookup makes `equipCard` populate the equipment's `copiedFromCardId` meta
 * with the attach target's instance ID. The chain-moves enumerator then
 * exposes the target unit's activated abilities on this equipment, so they
 * can be activated with their cost paid by Svellsongur as the host. On
 * unequip the field is cleared so the copy dissolves immediately.
 */
const abilities: Ability[] = [
  { cost: { energy: 1, power: ["calm"] }, keyword: "Equip", type: "keyword" },
];

export const svellsongur: EquipmentCard = {
  abilities,
  cardNumber: 59,
  cardType: "equipment",
  copyAttachedUnitText: true,
  domain: "calm",
  energyCost: 3,
  id: createCardId("sfd-059-221"),
  mightBonus: 0,
  name: "Svellsongur",
  rarity: "epic",
  rulesText:
    "[Equip] [1][calm] ([1][calm]: Attach this to a unit you control.)\nAs this is attached to a unit, copy that unit's text to this Equipment's effect text for as long as this is attached to it.",
  setId: "SFD",
};
