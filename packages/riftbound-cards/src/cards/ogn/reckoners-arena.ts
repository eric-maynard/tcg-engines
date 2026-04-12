import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Reckoner's Arena — ogn-286-298
 *
 * "When you hold here, activate the conquer effects of units here."
 *
 * FIXME: "activate the conquer effects of units here" isn't directly
 * representable in the Effect union. We approximate via a grant-keyword of
 * "TriggerConquer" on all friendly units here — the engine can honor this
 * as a tag to re-fire conquer triggers when holding.
 */
const abilities: Ability[] = [
  {
    effect: {
      duration: "turn",
      keyword: "TriggerConquer",
      target: { controller: "friendly", location: "here", type: "unit" },
      type: "grant-keyword",
    },
    trigger: { event: "hold", on: "self" },
    type: "triggered",
  },
];

export const reckonersArena: BattlefieldCard = {
  abilities,
  cardNumber: 286,
  cardType: "battlefield",
  id: createCardId("ogn-286-298"),
  name: "Reckoner's Arena",
  rarity: "uncommon",
  rulesText: "When you hold here, activate the conquer effects of units here.",
  setId: "OGN",
};
