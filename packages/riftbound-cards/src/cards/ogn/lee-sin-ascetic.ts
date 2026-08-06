import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const leeSinAscetic: UnitCard = {
  // rule 702.3 / 426.1.b.2: the one-buff-per-unit cap is lifted here, so the
  // parser's default (which drops the sentence) is replaced explicitly.
  abilities: [
    { keyword: "Shield", type: "keyword", value: 1 },
    { cost: { exhaust: true }, effect: { target: "self", type: "buff" }, type: "activated" },
    { effect: { type: "unlimited-buffs" }, type: "static" },
  ] as Ability[],
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
