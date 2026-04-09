import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const thermoBeam: SpellCard = {
  cardNumber: 22,
  cardType: "spell",
  domain: "fury",
  energyCost: 5,
  id: createCardId("ogn-022-298"),
  name: "Thermo Beam",
  rarity: "uncommon",
  rulesText: "[Action] (Play on your turn or in showdowns.)\nKill all gear.",
  setId: "OGN",
  timing: "action",
};
