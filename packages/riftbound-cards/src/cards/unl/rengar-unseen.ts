import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const rengarUnseen: UnitCard = {
  cardNumber: 24,
  cardType: "unit",
  domain: "fury",
  energyCost: 4,
  id: createCardId("unl-024-219"),
  isChampion: true,
  might: 4,
  name: "Rengar, Unseen",
  rarity: "rare",
  rulesText:
    "[Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.)\n[Assault 2] (+2 [Might] while I'm an attacker.)\n[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)\n[Ganking] (I can move from battlefield to battlefield.)",
  setId: "UNL",
  tags: ["Rengar"],
};
