import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const jhinMurderousArtist: UnitCard = {
  cardNumber: 22,
  cardType: "unit",
  domain: "fury",
  energyCost: 4,
  id: createCardId("unl-022-219"),
  isChampion: true,
  might: 4,
  name: "Jhin, Murderous Artist",
  rarity: "rare",
  rulesText:
    "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)\n[Ganking] (I can move from battlefield to battlefield.)\nWhen I move, [Add] [1][rainbow]. (Abilities that add resources can't be reacted to.)",
  setId: "UNL",
  tags: ["Jhin"],
};
