import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const alphaStrike: SpellCard = {
  cardNumber: 192,
  cardType: "spell",
  domain: ["calm", "body"],
  energyCost: 3,
  id: createCardId("unl-192-219"),
  name: "Alpha Strike",
  rarity: "epic",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nChoose a friendly unit. It deals damage equal to its Might split among enemy units at battlefields. Then for each unit this kills, do this: Gain 1 XP.",
  setId: "UNL",
  timing: "action",
};
