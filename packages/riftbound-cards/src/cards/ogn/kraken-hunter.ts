import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const krakenHunter: UnitCard = {
  cardNumber: 150,
  cardType: "unit",
  domain: "body",
  energyCost: 3,
  id: createCardId("ogn-150-298"),
  might: 5,
  name: "Kraken Hunter",
  rarity: "rare",
  rulesText:
    "[Accelerate] (You may pay [1][body] as an additional cost to have me enter ready.)\n[Assault] (+1 [Might] while I'm an attacker.)\nAs you play me, you may spend any number of buffs as an additional cost. Reduce my cost by [body] for each buff you spend.",
  setId: "OGN",
};
