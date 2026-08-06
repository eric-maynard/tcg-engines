import type { Ability } from "@tcg/riftbound-types";
import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// rule 809 — "if they didn't already" suppresses the grant on units that
// already print [Deflect], so their Deflect value stays 1.
const abilities: Ability[] = [
  {
    effect: { target: { controller: "friendly", type: "unit" }, type: "buff" },
    trigger: { event: "play-self" },
    type: "triggered",
  },
  {
    effect: {
      ifMissing: true,
      keyword: "Deflect",
      target: { controller: "friendly", filter: "buffed", type: "unit" },
      type: "grant-keyword",
    },
    type: "static",
  },
];

export const spiritsRefuge: GearCard = {
  abilities,
  cardNumber: 63,
  cardType: "gear",
  domain: "calm",
  energyCost: 2,
  id: createCardId("ogn-063-298"),
  name: "Spirit's Refuge",
  rarity: "uncommon",
  rulesText:
    "When you play this, buff a friendly unit. (If it doesn't have a buff, it gets a +1 [Might] buff.)\nFriendly buffed units have [Deflect] if they didn't already. (Opponents must pay [rainbow] to choose those units with a spell or ability.)",
  setId: "OGN",
};
