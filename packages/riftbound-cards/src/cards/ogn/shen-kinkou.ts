import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const shenKinkou: UnitCard = {
  cardNumber: 241,
  cardType: "unit",
  domain: "order",
  energyCost: 3,
  id: createCardId("ogn-241-298"),
  isChampion: true,
  might: 3,
  name: "Shen, Kinkou",
  rarity: "rare",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve, including to a battlefield you control.)\n[Shield 2] (+2 [Might] while I'm a defender.)\n[Tank] (I must be assigned combat damage first.)",
  setId: "OGN",
  tags: ["Shen"],
};
