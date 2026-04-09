import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const leblancFragmented: UnitCard = {
  cardNumber: 172,
  cardType: "unit",
  domain: "order",
  energyCost: 3,
  id: createCardId("unl-172-219"),
  isChampion: true,
  might: 3,
  name: "LeBlanc, Fragmented",
  rarity: "rare",
  rulesText:
    "[Assault] (+1 [Might] while I'm an attacker.)\n[Deathknell][&gt;] Draw 1. If it's your Beginning Phase, draw 2 instead. (When I die, get the effect.)",
  setId: "UNL",
  tags: ["LeBlanc"],
};
