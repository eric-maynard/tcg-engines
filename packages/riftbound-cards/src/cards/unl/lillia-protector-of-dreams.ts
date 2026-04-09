import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const lilliaProtectorOfDreams: UnitCard = {
  cardNumber: 58,
  cardType: "unit",
  domain: "calm",
  energyCost: 5,
  id: createCardId("unl-058-219"),
  isChampion: true,
  might: 4,
  name: "Lillia, Protector of Dreams",
  rarity: "epic",
  rulesText:
    "When you play a token unit, give me +1 [Might] this turn.\nYour token units have [Tank]. (They must be assigned combat damage first.)",
  setId: "UNL",
  tags: ["Lillia"],
};
