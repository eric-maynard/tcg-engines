import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const garenRugged: UnitCard = {
  cardNumber: 7,
  cardType: "unit",
  domain: "body",
  energyCost: 6,
  id: createCardId("ogs-007-024"),
  isChampion: true,
  might: 5,
  name: "Garen, Rugged",
  rarity: "rare",
  rulesText: "[Assault 2], [Shield 2] (+2 [Might] while I'm an attacker or defender.)",
  setId: "OGS",
  tags: ["Garen"],
};
