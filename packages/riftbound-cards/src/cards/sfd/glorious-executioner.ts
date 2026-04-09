import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const gloriousExecutioner: LegendCard = {
  cardNumber: 185,
  cardType: "legend",
  championTag: "Draven",
  domain: ["fury", "chaos"],
  id: createCardId("sfd-185-221"),
  name: "Glorious Executioner",
  rarity: "rare",
  rulesText: "When you win a combat, draw 1. (You win if only your units remain after combat.)",
  setId: "SFD",
};
