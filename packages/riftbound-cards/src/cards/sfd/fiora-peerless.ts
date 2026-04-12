import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Fiora, Peerless — sfd-110-221
 *
 * When I attack or defend one on one, double my Might this combat.
 *
 * Two triggered abilities covering attack and defend, both gated on
 * the alone-in-combat condition.
 */
const abilities: Ability[] = [
  {
    condition: { role: "attacking", type: "alone-in-combat" },
    effect: { duration: "combat", target: "self", type: "double-might" },
    trigger: { event: "attack", on: "self" },
    type: "triggered",
  },
  {
    condition: { role: "defending", type: "alone-in-combat" },
    effect: { duration: "combat", target: "self", type: "double-might" },
    trigger: { event: "defend", on: "self" },
    type: "triggered",
  },
];

export const fioraPeerless: UnitCard = {
  abilities,
  cardNumber: 110,
  cardType: "unit",
  domain: "body",
  energyCost: 3,
  id: createCardId("sfd-110-221"),
  isChampion: true,
  might: 3,
  name: "Fiora, Peerless",
  rarity: "rare",
  rulesText: "When I attack or defend one on one, double my Might this combat.",
  setId: "SFD",
  tags: ["Fiora"],
};
