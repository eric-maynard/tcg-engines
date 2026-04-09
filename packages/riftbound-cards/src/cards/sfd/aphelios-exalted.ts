import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const apheliosExalted: UnitCard = {
  cardNumber: 49,
  cardType: "unit",
  domain: "calm",
  energyCost: 4,
  id: createCardId("sfd-049-221"),
  isChampion: true,
  might: 4,
  name: "Aphelios, Exalted",
  rarity: "rare",
  rulesText:
    "When you attach an Equipment to me, choose one that hasn't been chosen this turn —Ready 2 runes.Channel 1 rune exhausted.Buff a friendly unit.",
  setId: "SFD",
  tags: ["Aphelios"],
};
