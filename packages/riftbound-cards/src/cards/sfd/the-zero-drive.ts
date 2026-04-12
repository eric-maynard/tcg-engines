import type { Ability } from "@tcg/riftbound-types";
import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * The Zero Drive — sfd-090-221 (Equipment)
 *
 * "[Equip] [1][mind] ([1][mind]: Attach this to a unit you control.)
 *  [3][mind], Banish this: Play all units banished with this, ignoring
 *  their costs. (Use only if unattached.)"
 *
 * Engine primitive: the `tracksExiledCards` flag on the card-definition
 * lookup makes the `banish` effect executor append every banished target's
 * instance ID to the source's `exiledByThis` meta. When this equipment
 * later leaves the board (via its own banish-self activation or any other
 * means), the `performCleanup` state-based check returns each tracked card
 * to its owner's base and clears the list.
 *
 * The activated ability here is "pay [3][mind], banish this" — its effect
 * is `banish { target: self }`, which moves this card to banishment and
 * triggers the cleanup return. The "use only if unattached" restriction
 * noted in the rules text is not yet modeled as a `Condition` variant and
 * is enforced at a higher layer.
 */
const abilities: Ability[] = [
  { cost: { energy: 1, power: ["mind"] }, keyword: "Equip", type: "keyword" },
  {
    cost: { energy: 3, power: ["mind"] },
    effect: { target: "self", type: "banish" },
    type: "activated",
  },
];

export const theZeroDrive: EquipmentCard = {
  abilities,
  cardNumber: 90,
  cardType: "equipment",
  domain: "mind",
  energyCost: 3,
  id: createCardId("sfd-090-221"),
  mightBonus: 2,
  name: "The Zero Drive",
  rarity: "epic",
  rulesText:
    "[Equip] [1][mind] ([1][mind]: Attach this to a unit you control.)\n[3][mind], Banish this: Play all units banished with this, ignoring their costs. (Use only if unattached.)",
  setId: "SFD",
  tracksExiledCards: true,
};
