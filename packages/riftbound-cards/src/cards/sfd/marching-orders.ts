import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const marchingOrders: SpellCard = {
  // rule 355.8 — both choices are mandatory and asymmetric: the friendly unit
  // may be ANYWHERE (base or any battlefield), the enemy one must be at a
  // battlefield. The parser's generic "unit anywhere" phrasing turns into a
  // bogus tag filter, so the pair is spelled out here.
  abilities: [
    {
      effect: {
        attacker: { controller: "friendly", type: "unit" },
        defender: { controller: "enemy", location: "battlefield", type: "unit" },
        type: "fight",
      },
      repeat: { energy: 3 },
      timing: "action",
      type: "spell",
    },
  ] as Ability[],
  cardNumber: 114,
  cardType: "spell",
  domain: "body",
  energyCost: 3,
  id: createCardId("sfd-114-221"),
  name: "Marching Orders",
  rarity: "rare",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\n[Repeat] [3] (You may pay the additional cost to repeat this spell's effect.)\nChoose a friendly unit anywhere and an enemy unit at a battlefield. They deal damage equal to their Mights to each other.",
  setId: "SFD",
  timing: "action",
};
