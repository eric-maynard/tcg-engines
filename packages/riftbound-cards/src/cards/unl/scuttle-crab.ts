import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const scuttleCrab: UnitCard = {
  cardNumber: 53,
  cardType: "unit",
  domain: "calm",
  energyCost: 2,
  id: createCardId("unl-053-219"),
  might: 0,
  name: "Scuttle Crab",
  rarity: "rare",
  rulesText:
    "(Units with 0 [Might] can conquer and hold.)\nWhen you play me, draw 1.\n[Deathknell][&gt;] Choose an opponent. They reveal their hand. You can look at their facedown cards this turn. Gain 1 XP. (When I die, get the effects.)",
  setId: "UNL",
};
