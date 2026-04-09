import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const immortalPhoenix: UnitCard = {
  cardNumber: 37,
  cardType: "unit",
  domain: "fury",
  energyCost: 3,
  id: createCardId("ogn-037-298"),
  might: 3,
  name: "Immortal Phoenix",
  rarity: "epic",
  rulesText:
    "[Assault 2] (+2 [Might] while I'm an attacker.)\nWhen you kill a unit with a spell, you may pay [1][fury] to play me from your trash.",
  setId: "OGN",
};
