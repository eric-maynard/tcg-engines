import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * rule 359.3.e.5 — the two instructions are ONE spell ability: if the damage
 * target has become illegal the damage is skipped, but the Gold token is still
 * played. The parser would split the text into two separate spell abilities and
 * only the first resolves, so the shape is spelled out here.
 */
const abilities: Ability[] = [
  { keyword: "Hidden", type: "keyword" },
  {
    effect: {
      effects: [
        { amount: 3, target: { location: "battlefield", type: "unit" }, type: "damage" },
        { ready: false, token: { name: "Gold", type: "gear" }, type: "create-token" },
      ],
      type: "sequence",
    },
    timing: "action",
    type: "spell",
  },
];

export const wagesOfPain: SpellCard = {
  abilities,
  cardNumber: 70,
  cardType: "spell",
  domain: "mind",
  energyCost: 3,
  id: createCardId("sfd-070-221"),
  name: "Wages of Pain",
  rarity: "common",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [0].)\n[Action] (Play on your turn or in showdowns.)\nDeal 3 to a unit at a battlefield. Play a Gold gear token exhausted.",
  setId: "SFD",
  timing: "action",
};
