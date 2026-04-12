import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Forge of the Fluft — sfd-208-221
 *
 * "While you control this battlefield, friendly legends have
 *  '[Exhaust]: Attach an Equipment you control to a unit you control.'"
 *
 * Modeled as a static grant of an AttachEquipmentAbility keyword to friendly
 * legends while the battlefield is controlled. The engine reads the keyword
 * as an activated-ability grant.
 */
const abilities: Ability[] = [
  {
    condition: { type: "while-at-battlefield" },
    effect: {
      keyword: "GrantAttachActivated",
      target: {
        controller: "friendly",
        type: "legend",
      },
      type: "grant-keyword",
    },
    type: "static",
  },
];

export const forgeOfTheFluft: BattlefieldCard = {
  abilities,
  cardNumber: 208,
  cardType: "battlefield",
  id: createCardId("sfd-208-221"),
  name: "Forge of the Fluft",
  rarity: "uncommon",
  rulesText:
    "While you control this battlefield, friendly legends have &quot;[Exhaust]: Attach an Equipment you control to a unit you control.&quot;",
  setId: "SFD",
};
