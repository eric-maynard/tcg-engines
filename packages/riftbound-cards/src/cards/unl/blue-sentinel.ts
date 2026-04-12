import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Blue Sentinel — unl-087-219
 *
 * [Shield 2]
 * Your hold effects for holding here trigger an additional time.
 * When I hold, [Add] [rainbow] at the start of your next Main Phase.
 *
 * The "trigger an additional time" rider is captured as a helper
 * keyword HoldRepeatHere; engine support is pending. The [Add] is
 * simplified to an immediate add-resource at hold time.
 */
const abilities: Ability[] = [
  { keyword: "Shield", type: "keyword", value: 2 },
  {
    effect: {
      keyword: "HoldRepeatHere",
      target: "self",
      type: "grant-keyword",
    },
    type: "static",
  },
  {
    effect: { power: ["rainbow"], type: "add-resource" },
    trigger: { event: "hold", on: "self" },
    type: "triggered",
  },
];

export const blueSentinel: UnitCard = {
  abilities,
  cardNumber: 87,
  cardType: "unit",
  domain: "mind",
  energyCost: 4,
  id: createCardId("unl-087-219"),
  might: 4,
  name: "Blue Sentinel",
  rarity: "epic",
  rulesText:
    "[Shield 2] (+2 [Might] while I'm a defender.)\nYour hold effects for holding here trigger an additional time.\nWhen I hold, [Add] [rainbow] at the start of your next Main Phase. (Abilities that add resources can't be reacted to.)",
  setId: "UNL",
};
