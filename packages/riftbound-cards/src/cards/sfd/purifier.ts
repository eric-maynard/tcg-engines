import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const purifier: LegendCard = {
  cardNumber: 183,
  cardType: "legend",
  championTag: "Lucian",
  domain: ["fury", "body"],
  id: createCardId("sfd-183-221"),
  name: "Purifier",
  rarity: "rare",
  rulesText: "Your Equipment each give [Assault]. (+1 [Might] while equipped unit is an attacker.)",
  setId: "SFD",
};
