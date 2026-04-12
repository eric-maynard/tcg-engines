import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Rockfall Path — sfd-216-221 (Battlefield)
 *
 * Units can't be played here.
 *
 * Captured as a self-keyword "NoUnitsPlayedHere" that the engine's
 * play-target validator can honor. Engine support pending.
 */
const abilities: Ability[] = [
  {
    effect: {
      keyword: "NoUnitsPlayedHere",
      target: "self",
      type: "grant-keyword",
    },
    type: "static",
  },
];

export const rockfallPath: BattlefieldCard = {
  abilities,
  cardNumber: 216,
  cardType: "battlefield",
  id: createCardId("sfd-216-221"),
  name: "Rockfall Path",
  rarity: "uncommon",
  rulesText: "Units can't be played here.",
  setId: "SFD",
};
