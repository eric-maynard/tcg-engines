import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const spriteCall: SpellCard = {
  cardNumber: 94,
  cardType: "spell",
  domain: "mind",
  energyCost: 3,
  id: createCardId("ogn-094-298"),
  name: "Sprite Call",
  rarity: "common",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\n[Action] (Play on your turn or in showdowns.)\nPlay a ready 3 [Might] Sprite unit token with [Temporary]. (Kill it at the start of its controller's Beginning Phase, before scoring.)",
  setId: "OGN",
  timing: "action",
};
