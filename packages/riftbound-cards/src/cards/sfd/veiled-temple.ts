import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const veiledTemple: BattlefieldCard = {
  // The parser stops at "ready a friendly gear"; the trailing conditional
  // "If it's an Equipment, you may detach it." is unique to this card, so the
  // whole ability is spelled out here. rule 435: detaching unlinks the
  // Equipment (435.1.e drops the Might Bonus) and 435.4.a recalls it to base
  // at the next Cleanup.
  abilities: [
    {
      effect: {
        mayDetachEquipment: { equipment: { type: "equipment" }, type: "detach" },
        target: { controller: "friendly", type: "gear" },
        type: "ready",
      },
      optional: true,
      trigger: { event: "conquer", location: "here", on: "controller" },
      type: "triggered",
    },
  ],
  cardNumber: 221,
  cardType: "battlefield",
  id: createCardId("sfd-221-221"),
  name: "Veiled Temple",
  rarity: "uncommon",
  rulesText:
    "When you conquer here, you may ready a friendly gear. If it's an Equipment, you may detach it.",
  setId: "SFD",
};
