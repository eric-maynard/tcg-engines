import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const vexCheerless: UnitCard = {
  cardNumber: 146,
  cardType: "unit",
  domain: "chaos",
  energyCost: 5,
  id: createCardId("sfd-146-221"),
  isChampion: true,
  might: 5,
  name: "Vex, Cheerless",
  rarity: "rare",
  rulesText:
    "While I'm in combat, friendly spells cost [1][rainbow] less to a minimum of [1], and enemy spells cost [1][rainbow] more.",
  setId: "SFD",
  tags: ["Vex"],
};
