import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const jinxDemolitionist: UnitCard = {
  cardNumber: 30,
  cardType: "unit",
  domain: "fury",
  energyCost: 3,
  id: createCardId("ogn-030-298"),
  isChampion: true,
  might: 4,
  name: "Jinx, Demolitionist",
  rarity: "rare",
  rulesText:
    "[Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.)\n[Assault 2] (+2 [Might] while I'm an attacker.)\nWhen you play me, discard 2.",
  setId: "OGN",
  tags: ["Jinx"],
};
