import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const jaxUnrelenting: UnitCard = {
  cardNumber: 119,
  cardType: "unit",
  domain: "body",
  energyCost: 4,
  id: createCardId("sfd-119-221"),
  isChampion: true,
  might: 3,
  name: "Jax, Unrelenting",
  rarity: "epic",
  rulesText:
    "[Weaponmaster] (When you play me, you may [Equip] one of your Equipment to me for [rainbow] less, even if it's already attached.)\nWhen you attach an Equipment to me, you may pay [1] to draw 1.",
  setId: "SFD",
  tags: ["Jax"],
};
