import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const sunlitGuardian: UnitCard = {
  cardNumber: 54,
  cardType: "unit",
  domain: "calm",
  energyCost: 3,
  id: createCardId("ogn-054-298"),
  might: 3,
  name: "Sunlit Guardian",
  rarity: "common",
  rulesText:
    "[Shield] (+1 [Might] while I'm a defender.)\n[Tank] (I must be assigned combat damage first.)",
  setId: "OGN",
};
