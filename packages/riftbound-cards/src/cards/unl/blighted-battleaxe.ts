import type { Ability, Effect } from "@tcg/riftbound-types";
import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Blighted Battleaxe — unl-019-219 (Equipment, +4)
 *
 * Effect Text (rule 136.2 / 150.2 / 718.3): "At the end of your turn, if I
 * didn't conquer this turn, unattach this and deal 4 to me." — conferred on the
 * equipped unit, so "I"/"me" is the WEARER and "this" is the axe itself
 * (136.2.d). The two steps are ordered: the unattach happens first, so the +4
 * is already gone when the 4 damage lands (142.4.b lethal check runs in the
 * post-chain Cleanup).
 *
 * rule 383.2.a.1 — "if I didn't conquer this turn" is an intervening-if on the
 * trigger: with a conquer on the controller's ledger the ability never goes on
 * the chain.
 */
const abilities: Ability[] = [
  { cost: { energy: 1, power: ["fury"] }, keyword: "Equip", type: "keyword" },
  {
    condition: { condition: { event: "conquered", type: "this-turn" }, type: "not" },
    effect: {
      effects: [
        // rule 435 — "unattach THIS": the axe conferring this text, never a
        // sibling Equipment the wearer happens to be carrying.
        { equipment: { attachedTo: "source", type: "equipment" }, type: "detach" },
        { amount: 4, target: "self", type: "damage" },
      ] as unknown as Effect[],
      type: "sequence",
    } as unknown as Effect,
    effectText: true,
    trigger: { event: "end-of-turn", on: "controller", timing: "at" },
    type: "triggered",
  },
];

export const blightedBattleaxe: EquipmentCard = {
  abilities,
  cardNumber: 19,
  cardType: "equipment",
  domain: "fury",
  effectText:
    "At the end of your turn, if I didn't conquer this turn, unattach this and deal 4 to me.",
  energyCost: 4,
  id: createCardId("unl-019-219"),
  mightBonus: 4,
  name: "Blighted Battleaxe",
  rarity: "rare",
  rulesText:
    "[Equip] [1][fury] ([1][fury]: Attach this to a unit you control.)\nAt the end of your turn, if I didn't conquer this turn, unattach this and deal 4 to me.",
  setId: "UNL",
};
