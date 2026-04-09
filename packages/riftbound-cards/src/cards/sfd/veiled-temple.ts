import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const veiledTemple: BattlefieldCard = {
  cardNumber: 221,
  cardType: "battlefield",
  id: createCardId("sfd-221-221"),
  name: "Veiled Temple",
  rarity: "uncommon",
  rulesText:
    "When you conquer here, you may ready a friendly gear. If it's an Equipment, you may detach it.",
  setId: "SFD",
};
