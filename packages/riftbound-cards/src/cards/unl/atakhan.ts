import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Atakhan — unl-170-219
 *
 * - Optional additional cost: kill a friendly unit → cost reduction.
 * - [Ganking]
 * - When I attack, the defender must kill one of their units here.
 */
const abilities: Ability[] = [
  // Rule 560: optional additional play-cost — shape read by
  // getOptionalPlayCost() (riftbound-engine cards.ts) so the paid variant
  // is enumerated and the player is prompted.
  {
    cost: { kill: { controller: "friendly", type: "unit" } },
    type: "additional-cost-option",
  } as unknown as Ability,
  { keyword: "Ganking", type: "keyword" },
  {
    effect: {
      player: "opponent",
      target: {
        controller: "enemy",
        location: "here",
        type: "unit",
      },
      type: "kill",
    },
    trigger: { event: "attack", on: "self" },
    type: "triggered",
  },
];

export const atakhan: UnitCard = {
  abilities,
  cardNumber: 170,
  cardType: "unit",
  domain: "order",
  energyCost: 10,
  id: createCardId("unl-170-219"),
  might: 7,
  name: "Atakhan",
  rarity: "rare",
  rulesText:
    "You may kill a friendly unit as an additional cost to play me. If you do, I cost [1] less for each Energy it costs and [order] less for each Power it costs.\n[Ganking] (I can move from battlefield to battlefield.)\nWhen I attack, the defender must kill one of their units here.",
  // rule 356.4: the paid kill discounts him by the victim's printed cost —
  // [1] per Energy and one [order] per Power pip (of ANY domain).
  sacrificeCostDiscount: { powerDomain: "order" },
  setId: "UNL",
};
