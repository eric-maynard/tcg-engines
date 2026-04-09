import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const spriteFountain: GearCard = {
  cardNumber: 78,
  cardType: "gear",
  domain: "mind",
  energyCost: 2,
  id: createCardId("unl-078-219"),
  name: "Sprite Fountain",
  rarity: "uncommon",
  rulesText:
    "[Temporary] (Kill this at the start of its controller's Beginning Phase, before scoring.)\nWhen you play this, play a ready 3 [Might] Sprite unit token with [Temporary] to your base.\n[Deathknell][&gt;] Repeat this gear's play effect. (When this dies, get the effect.)",
  setId: "UNL",
};
