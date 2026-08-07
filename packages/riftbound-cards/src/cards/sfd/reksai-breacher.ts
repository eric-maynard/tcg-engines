import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Rek'Sai, Breacher — sfd-029-221
 *
 * "Friendly units played from anywhere other than a player's hand have [Accelerate]."
 *
 * rule 805: Accelerate is an optional additional cost paid AS the unit is played,
 * so this is not a board grant (a unit already in play can never use it) — it is a
 * play-time licence read by `getGrantedAcceleratePlayCost` on the reveal / play path.
 */
const abilities: Ability[] = [
  { cost: { energy: 1, power: ["fury"] }, keyword: "Accelerate", type: "keyword" },
  { keyword: "Assault", type: "keyword", value: 1 },
  {
    effect: {
      keyword: "Accelerate",
      playedFrom: "non-hand",
      target: { controller: "friendly", excludeSelf: true, type: "unit" },
      type: "grant-keyword-on-play",
    },
    type: "static",
  },
];

export const reksaiBreacher: UnitCard = {
  abilities,
  cardNumber: 29,
  cardType: "unit",
  domain: "fury",
  energyCost: 3,
  id: createCardId("sfd-029-221"),
  isChampion: true,
  might: 3,
  name: "Rek'Sai, Breacher",
  rarity: "epic",
  rulesText:
    "[Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.)\n[Assault] (+1 [Might] while I'm an attacker.)\nFriendly units played from anywhere other than a player's hand have [Accelerate].",
  setId: "SFD",
  tags: ["Rek'Sai"],
};
