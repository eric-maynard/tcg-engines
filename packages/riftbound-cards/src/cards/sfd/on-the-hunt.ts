import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const onTheHunt: SpellCard = {
  cardNumber: 204,
  cardType: "spell",
  domain: ["body", "chaos"],
  energyCost: 1,
  id: createCardId("sfd-204-221"),
  name: "On the Hunt",
  rarity: "epic",
  rulesText: "Ready your units.",
  setId: "SFD",
  timing: "action",
};
