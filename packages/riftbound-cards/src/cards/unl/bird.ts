import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const bird: UnitCard = {
  abilities: [{ keyword: "Deflect", type: "keyword", value: 1 }],
  cardNumber: 2,
  cardType: "unit",
  id: createCardId("unl-t02"),
  isToken: true,
  might: 1,
  name: "Bird",
  rarity: "common",
  rulesText: "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)",
  setId: "UNL",
  // rule 187.7: a 1 [Might] Bird token carries the Bird tag, so tag-filtered
  // auras (Brush: "Bird … units here have +1 [Might]") see it.
  tags: ["Bird"],
};
