import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const smokeAndMirrors: SpellCard = {
  cardNumber: 83,
  cardType: "spell",
  domain: "mind",
  energyCost: 2,
  id: createCardId("unl-083-219"),
  name: "Smoke and Mirrors",
  rarity: "rare",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\n[Action] (Play on your turn or in showdowns.)\nChoose a unit you control and another unit you control at a different location. If at least one of them has [Temporary], move each to the other's location. Draw 1.",
  setId: "UNL",
  timing: "action",
};
