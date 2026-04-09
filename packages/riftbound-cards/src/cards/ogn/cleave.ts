import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const cleave: SpellCard = {
  cardNumber: 4,
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  id: createCardId("ogn-004-298"),
  name: "Cleave",
  rarity: "common",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nGive a unit [Assault 3] this turn. (+3 [Might] while it's an attacker.)",
  setId: "OGN",
  timing: "action",
};
