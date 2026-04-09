import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const productionSurge: SpellCard = {
  cardNumber: 76,
  cardType: "spell",
  domain: "mind",
  energyCost: 4,
  id: createCardId("sfd-076-221"),
  name: "Production Surge",
  rarity: "uncommon",
  rulesText:
    "This costs [2] less if you control a Mech.\nPlay a 3 [Might] Mech unit token to your base.\nDraw 1.",
  setId: "SFD",
  timing: "action",
};
