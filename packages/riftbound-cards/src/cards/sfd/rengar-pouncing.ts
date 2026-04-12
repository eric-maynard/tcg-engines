import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Rengar, Pouncing — sfd-025-221
 *
 * [Reaction]
 * [Assault 2]
 * I can be played to a battlefield you're attacking.
 *
 * The last clause is the [Ambush] mechanic (see B8 in the Wave 3 plan).
 * It is modelled as a static grant-keyword "CanPlayToAttacked" on self,
 * which `canPlay` validation can honor once the engine hook lands.
 */
const abilities: Ability[] = [
  { keyword: "Reaction", type: "keyword" },
  { keyword: "Assault", type: "keyword", value: 2 },
  {
    effect: {
      keyword: "CanPlayToAttacked",
      target: "self",
      type: "grant-keyword",
    },
    type: "static",
  },
];

export const rengarPouncing: UnitCard = {
  abilities,
  cardNumber: 25,
  cardType: "unit",
  domain: "fury",
  energyCost: 3,
  id: createCardId("sfd-025-221"),
  isChampion: true,
  might: 3,
  name: "Rengar, Pouncing",
  rarity: "rare",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve, including to a battlefield you control.)\n[Assault 2] (+2 [Might] while I'm an attacker.)\nI can be played to a battlefield you're attacking.",
  setId: "SFD",
  tags: ["Rengar"],
};
