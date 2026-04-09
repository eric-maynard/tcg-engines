import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const grimResolve: SpellCard = {
  cardNumber: 95,
  cardType: "spell",
  domain: "body",
  energyCost: 2,
  id: createCardId("unl-095-219"),
  name: "Grim Resolve",
  rarity: "common",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nGive a friendly unit +3 [Might] this turn. When it wins a combat this turn, gain 2 XP.",
  setId: "UNL",
  timing: "action",
};
