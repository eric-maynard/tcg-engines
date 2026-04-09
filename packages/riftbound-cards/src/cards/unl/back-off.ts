import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const backOff: SpellCard = {
  cardNumber: 42,
  cardType: "spell",
  domain: "calm",
  energyCost: 3,
  id: createCardId("unl-042-219"),
  name: "Back Off",
  rarity: "uncommon",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\n[Action] (Play on your turn or in showdowns.)\n[Stun] a unit. (It doesn't deal combat damage this turn.)\nIf you played this from your hand, draw 1.",
  setId: "UNL",
  timing: "action",
};
