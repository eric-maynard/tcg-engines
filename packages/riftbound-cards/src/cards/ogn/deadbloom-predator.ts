import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const deadbloomPredator: UnitCard = {
  cardNumber: 161,
  cardType: "unit",
  domain: "body",
  energyCost: 8,
  id: createCardId("ogn-161-298"),
  might: 8,
  name: "Deadbloom Predator",
  rarity: "epic",
  rulesText:
    "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)\nYou may play me to an occupied enemy battlefield.",
  setId: "OGN",
};
