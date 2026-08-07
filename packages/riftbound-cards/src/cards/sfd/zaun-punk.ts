import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Zaun Punk — sfd-160-221
 *
 * You may kill a friendly gear as an additional cost to play me.
 * When you play me, if you paid the additional cost, kill a gear.
 *
 * The parser has no pattern for "you may kill a friendly <type> as an
 * additional cost", so the optional cost is hand-authored in the shape
 * `getOptionalPlayCost` reads (`{type:"static", cost:{kill: Target}}`,
 * kind `kill`); without it the payoff trigger's `paid-additional-cost`
 * condition can never be satisfied.
 */
// rule 356.2: an optional additional cost is chosen and paid as the card is played.
const abilities: Ability[] = [
  {
    cost: { kill: { controller: "friendly", type: "gear" } },
    type: "static",
  } as unknown as Ability,
  {
    condition: { type: "paid-additional-cost" },
    effect: { target: { type: "gear" }, type: "kill" },
    trigger: { event: "play-self" },
    type: "triggered",
  } as unknown as Ability,
];

export const zaunPunk: UnitCard = {
  abilities,
  cardNumber: 160,
  cardType: "unit",
  domain: "order",
  energyCost: 3,
  id: createCardId("sfd-160-221"),
  might: 3,
  name: "Zaun Punk",
  rarity: "common",
  rulesText:
    "You may kill a friendly gear as an additional cost to play me.\nWhen you play me, if you paid the additional cost, kill a gear.",
  setId: "SFD",
};
