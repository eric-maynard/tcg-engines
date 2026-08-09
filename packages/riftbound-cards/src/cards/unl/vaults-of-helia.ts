import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Vaults of Helia — unl-219-219 (Battlefield)
 *
 * When you hold here, your non-token units cost [1] more to play this turn.
 *
 * rule 356.3 — a turn-scoped surcharge on the holder's own future UNIT plays;
 * `scope: "play"` marks it as a rider on later plays rather than a modifier on
 * objects already on the board. rule 185 / 186 — tokens are put into play by
 * effects and have no cost of their own, hence `excludeTokens`.
 */
const abilities: Ability[] = [
  {
    effect: {
      amount: 1,
      duration: "turn",
      scope: "play",
      target: { cardType: "unit", controller: "friendly", excludeTokens: true },
      type: "cost-increase",
    },
    trigger: {
      event: "hold",
      on: { controller: "friendly", location: "here" },
    },
    type: "triggered",
  },
];

export const vaultsOfHelia: BattlefieldCard = {
  abilities,
  cardNumber: 219,
  cardType: "battlefield",
  id: createCardId("unl-219-219"),
  name: "Vaults of Helia",
  rarity: "uncommon",
  rulesText: "When you hold here, your non-token units cost [1] more to play this turn.",
  setId: "UNL",
};
