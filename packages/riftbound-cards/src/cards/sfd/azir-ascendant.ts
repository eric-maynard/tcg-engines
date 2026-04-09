import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const azirAscendant: UnitCard = {
  cardNumber: 50,
  cardType: "unit",
  domain: "calm",
  energyCost: 6,
  id: createCardId("sfd-050-221"),
  isChampion: true,
  might: 6,
  name: "Azir, Ascendant",
  rarity: "rare",
  rulesText:
    "[calm]: [Action] — Choose a unit you control. Move me to its location and it to my original location. If it's equipped, you may attach one of its Equipment to me. Use only once per turn.",
  setId: "SFD",
  tags: ["Azir"],
};
