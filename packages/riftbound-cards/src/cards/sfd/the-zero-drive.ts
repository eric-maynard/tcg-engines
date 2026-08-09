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
 * Effect Text (rule 150.2 / 718.3 / 724): "[Deathknell] Banish me." — while
 * attached it belongs to the Top-Most unit, so the wearer's death banishes the
 * wearer. rule 395/397: the banish is linked to the drive (`linkTo`), which is
 * what "banished WITH THIS" reads.
 *
 * rule 202-203 / 356: "Banish this" is a COST — the drive is in banishment as
 * soon as the ability is activated and stays there.
 * rule 419.3 / 359.2.c: the released units are PLAYED (they enter exhausted),
 * ignoring their costs; rule 377.2.b gates the ability on being unattached.
 */
const abilities: Ability[] = [
  { cost: { energy: 1, power: ["mind"] }, keyword: "Equip", type: "keyword" },
  {
    cost: { banish: "self", energy: 3, power: ["mind"] },
    effect: {
      from: "banishment",
      ignoreCost: true,
      linkedToSource: true,
      target: { quantity: "all", type: "unit" },
      type: "play",
    },
    restrictions: [{ type: "unattached" }],
    type: "activated",
  },
  {
    effect: { target: "self", type: "banish" },
    effectText: true,
    name: "Deathknell",
    trigger: { event: "die", on: "self" },
    type: "triggered",
  },
];

export const theZeroDrive: EquipmentCard = {
  abilities,
  cardNumber: 90,
  cardType: "equipment",
  domain: "mind",
  effectText: "[Deathknell] — Banish me. (When I die, get the effect.)",
  energyCost: 3,
  id: createCardId("sfd-090-221"),
  mightBonus: 2,
  name: "The Zero Drive",
  rarity: "epic",
  rulesText:
    "[Equip] [1][mind] ([1][mind]: Attach this to a unit you control.)\n[3][mind], Banish this: Play all units banished with this, ignoring their costs. (Use only if unattached.)\n[Deathknell] — Banish me. (When I die, get the effect.)",
  setId: "SFD",
  tracksExiledCards: true,
};
