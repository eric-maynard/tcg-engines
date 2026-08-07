import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Sivir, Ambitious — sfd-120-221
 *
 * [Deflect 2]
 * When I conquer after an attack, if you assigned 5 or more excess damage
 * to enemy units, you may deal that much to an enemy unit.
 *
 * Both abilities come from the parser: the Deflect keyword, and the conquer
 * trigger whose `afterAttack` qualifier, `excess-damage-assigned` condition and
 * `{ variable: "excess-damage" }` damage amount are all shared mechanisms.
 */
export const sivirAmbitious: UnitCard = {
  cardNumber: 120,
  cardType: "unit",
  domain: "body",
  energyCost: 6,
  id: createCardId("sfd-120-221"),
  isChampion: true,
  might: 7,
  name: "Sivir, Ambitious",
  rarity: "epic",
  rulesText:
    "[Deflect 2] (Opponents must pay [rainbow][rainbow] to choose me with a spell or Ability.)\nWhen I conquer after an attack, if you assigned 5 or more excess damage to enemy units, you may deal that much to an enemy unit.",
  setId: "SFD",
  tags: ["Sivir"],
};
