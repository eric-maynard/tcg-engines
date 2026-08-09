import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Guards! — sfd-154-221
 *
 * "[Hidden] Play a 2 [Might] Sand Soldier unit token. You may pay [order] to
 *  ready it."
 *
 * rule 356.1 / 354.2: the ready rider is a cost paid WITHIN the instructions —
 * the caster is asked once the token has landed, and only a paid [order]
 * readies it. "it" is the token this same instruction played, so the ready
 * step names the sequence's pending value.
 */
const abilities: Ability[] = [
  { keyword: "Hidden", type: "keyword" },
  {
    effect: {
      effects: [
        { token: { might: 2, name: "Sand Soldier", type: "unit" }, type: "create-token" },
        {
          condition: { cost: { power: ["order"] }, type: "pay-cost" },
          then: { target: { type: "pending-value" }, type: "ready" },
          type: "conditional",
        },
      ],
      pendingValue: { source: 0 },
      type: "sequence",
    },
    type: "spell",
  },
] as unknown as Ability[];

export const guards: SpellCard = {
  abilities,
  cardNumber: 154,
  cardType: "spell",
  domain: "order",
  energyCost: 3,
  id: createCardId("sfd-154-221"),
  name: "Guards!",
  rarity: "common",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [0].)\nPlay a 2 [Might] Sand Soldier unit token. You may pay [order] to ready it.",
  setId: "SFD",
  timing: "action",
};
