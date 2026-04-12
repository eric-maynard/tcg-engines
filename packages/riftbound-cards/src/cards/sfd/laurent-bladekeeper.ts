import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Laurent Bladekeeper — sfd-096-221
 *
 * Ganking (I can move from battlefield to battlefield.)
 *
 * Note: the card text writes "Ganking" without brackets — the parser
 * treats unbracketed keywords as raw. Hand-author the keyword here.
 */
const abilities: Ability[] = [{ keyword: "Ganking", type: "keyword" }];

export const laurentBladekeeper: UnitCard = {
  abilities,
  cardNumber: 96,
  cardType: "unit",
  domain: "body",
  energyCost: 3,
  id: createCardId("sfd-096-221"),
  might: 3,
  name: "Laurent Bladekeeper",
  rarity: "common",
  rulesText: "Ganking (I can move from battlefield to battlefield.)",
  setId: "SFD",
};
