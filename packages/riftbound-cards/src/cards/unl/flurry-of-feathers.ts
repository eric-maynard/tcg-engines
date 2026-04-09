import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const flurryOfFeathers: SpellCard = {
  cardNumber: 44,
  cardType: "spell",
  domain: "calm",
  energyCost: 4,
  id: createCardId("unl-044-219"),
  name: "Flurry of Feathers",
  rarity: "uncommon",
  rulesText:
    "[Reaction]\nChoose one —Counter a spell.Play four 1 [Might] Bird unit tokens with [Deflect]. (Opponents must pay [rainbow] to choose them with a spell or ability.)",
  setId: "UNL",
  timing: "reaction",
};
