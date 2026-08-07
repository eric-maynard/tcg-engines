import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Ezreal, Prodigy — sfd-149-221
 *
 * "When you play me, discard 1, then draw 2.
 *  Optional additional costs you pay cost [1] or [rainbow] less."
 *
 * rule 356.4.c / 356.4.c.1: the second sentence is a flexible reduction on
 * every OPTIONAL ADDITIONAL cost (Repeat tiers, Accelerate, "you may pay …"),
 * and the payer chooses whether each application shaves the Energy or a Power
 * pip. `alternative` carries the second half of that choice.
 */
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        { amount: 1, type: "discard" },
        { amount: 2, type: "draw" },
      ],
      type: "sequence",
    },
    trigger: { event: "play-self" },
    type: "triggered",
  },
  {
    effect: {
      alternative: { power: ["rainbow"] },
      by: { energy: 1 },
      target: "optional additional costs you pay",
      type: "cost-reduction",
    },
    type: "static",
  },
] as unknown as Ability[];

export const ezrealProdigy: UnitCard = {
  abilities,
  cardNumber: 149,
  cardType: "unit",
  domain: "chaos",
  energyCost: 3,
  id: createCardId("sfd-149-221"),
  isChampion: true,
  might: 3,
  name: "Ezreal, Prodigy",
  rarity: "epic",
  rulesText:
    "When you play me, discard 1, then draw 2.\nOptional additional costs you pay cost [1] or [rainbow] less.",
  setId: "SFD",
  tags: ["Ezreal"],
};
