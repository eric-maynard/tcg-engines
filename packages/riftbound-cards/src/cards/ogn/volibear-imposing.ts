import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const volibearImposing: UnitCard = {
  cardNumber: 158,
  cardType: "unit",
  domain: "body",
  energyCost: 12,
  id: createCardId("ogn-158-298"),
  isChampion: true,
  might: 10,
  name: "Volibear, Imposing",
  rarity: "rare",
  rulesText:
    "[Shield 3] (+3 [Might] while I'm a defender.)\n[Tank] (I must be assigned combat damage first.)\nWhen an opponent moves to a battlefield other than mine, draw 1. (Bases are not battlefield.)",
  setId: "OGN",
  tags: ["Volibear"],
};
