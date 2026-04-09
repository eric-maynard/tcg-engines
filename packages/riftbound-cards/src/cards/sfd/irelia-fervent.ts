import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const ireliaFervent: UnitCard = {
  cardNumber: 57,
  cardType: "unit",
  domain: "calm",
  energyCost: 5,
  id: createCardId("sfd-057-221"),
  isChampion: true,
  might: 4,
  name: "Irelia, Fervent",
  rarity: "epic",
  rulesText:
    "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)\nWhen you choose or ready me, give me +1 [Might] this turn.",
  setId: "SFD",
  tags: ["Irelia"],
};
