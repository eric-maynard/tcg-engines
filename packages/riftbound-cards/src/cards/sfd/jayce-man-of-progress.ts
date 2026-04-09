import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const jayceManOfProgress: UnitCard = {
  cardNumber: 84,
  cardType: "unit",
  domain: "mind",
  energyCost: 4,
  id: createCardId("sfd-084-221"),
  isChampion: true,
  might: 4,
  name: "Jayce, Man of Progress",
  rarity: "rare",
  rulesText:
    "When you play me, you may kill a friendly gear. If you do, you may play a gear with Energy cost no more than [7] from hand this turn, ignoring its Energy cost. (You must still pay its Power cost.)",
  setId: "SFD",
  tags: ["Jayce"],
};
