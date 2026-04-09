import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const mechanizedMenace: LegendCard = {
  cardNumber: 181,
  cardType: "legend",
  championTag: "Rumble",
  domain: ["fury", "mind"],
  id: createCardId("sfd-181-221"),
  name: "Mechanized Menace",
  rarity: "rare",
  rulesText: "Your Mechs have [Shield]. (+1 [Might] while they're defenders.)",
  setId: "SFD",
};
