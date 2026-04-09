import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const boneSkewer: SpellCard = {
  cardNumber: 139,
  cardType: "spell",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("unl-139-219"),
  name: "Bone Skewer",
  rarity: "rare",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\nChoose a battlefield. An opponent reveals their hand. You may choose a unit from it. They play that unit to that battlefield, ignoring any and all costs. When they do, [Stun] it. (It doesn't deal combat damage this turn.)",
  setId: "UNL",
  timing: "action",
};
