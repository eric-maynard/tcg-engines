import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const soulHarvest: SpellCard = {
  cardNumber: 159,
  cardType: "spell",
  domain: "order",
  energyCost: 2,
  id: createCardId("unl-159-219"),
  name: "Soul Harvest",
  rarity: "common",
  rulesText: "Kill a unit at a battlefield with 3 [Might] or less.",
  setId: "UNL",
  timing: "action",
};
