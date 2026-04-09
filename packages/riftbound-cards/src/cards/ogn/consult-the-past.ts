import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const consultThePast: SpellCard = {
  cardNumber: 83,
  cardType: "spell",
  domain: "mind",
  energyCost: 4,
  id: createCardId("ogn-083-298"),
  name: "Consult the Past",
  rarity: "common",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\n[Reaction] (Play any time, even before spells and abilities resolve.)\nDraw 2.",
  setId: "OGN",
  timing: "action",
};
