import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const blackRoseDignitary: UnitCard = {
  cardNumber: 152,
  cardType: "unit",
  domain: "order",
  energyCost: 3,
  id: createCardId("unl-152-219"),
  might: 2,
  name: "Black Rose Dignitary",
  rarity: "common",
  rulesText:
    "[Assault] (+1 [Might] while I'm an attacker.)\n[Deathknell][&gt;] Channel 1 rune exhausted. (When I die, get the effect.)",
  setId: "UNL",
};
