import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * rule 105.2 / 740.1.a — "I have +1 [Might] for each friendly gear": the parser
 * only emits a flat +1 with an inert `per` phrase, so the count is spelled out
 * as a target descriptor the engine re-resolves on every static recalculation.
 */
const abilities: Ability[] = [
  { keyword: "Deflect", type: "keyword", value: 2 },
  { keyword: "Weaponmaster", type: "keyword" },
  {
    effect: {
      amount: {
        count: {
          controller: "friendly",
          quantity: "all",
          type: "gear",
        },
      },
      target: "self",
      type: "modify-might",
    },
    type: "static",
  },
];

export const ornnForgeGod: UnitCard = {
  abilities,
  cardNumber: 85,
  cardType: "unit",
  domain: "mind",
  energyCost: 6,
  id: createCardId("sfd-085-221"),
  isChampion: true,
  might: 4,
  name: "Ornn, Forge God",
  rarity: "rare",
  rulesText:
    "[Deflect 2] (Opponents must pay [rainbow][rainbow] to choose me with a spell or ability.)\n[Weaponmaster] (When you play me, you may [Equip] one of your Equipment to me for [rainbow] less, even if it's already attached.)\nI have +1 [Might] for each friendly gear.",
  setId: "SFD",
  tags: ["Ornn"],
};
