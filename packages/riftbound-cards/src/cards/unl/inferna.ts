import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const inferna: UnitCard = {
  cardNumber: 2,
  cardType: "unit",
  domain: "fury",
  energyCost: 2,
  id: createCardId("unl-002-219"),
  might: 1,
  name: "Inferna",
  rarity: "common",
  rulesText:
    "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)\n[Assault 2] (+2 [Might] while I'm an attacker.)",
  setId: "UNL",
};
