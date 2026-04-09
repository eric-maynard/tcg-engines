import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const leeSinAscetic: UnitCard = {
  cardNumber: 78,
  cardType: "unit",
  domain: "calm",
  energyCost: 5,
  id: createCardId("ogn-078-298"),
  isChampion: true,
  might: 5,
  name: "Lee Sin, Ascetic",
  rarity: "epic",
  rulesText:
    "[Shield] (+1 [Might] while I'm a defender.)\n[Exhaust]: Buff me. (I get a +1 [Might] buff.)\nI can have any number of buffs.",
  setId: "OGN",
  tags: ["Lee Sin"],
};
