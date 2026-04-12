import type { Ability } from "@tcg/riftbound-types";
import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Sprite Fountain — unl-078-219 (Gear)
 *
 * [Temporary]
 * When you play this, play a ready 3 [Might] Sprite unit token with
 * [Temporary] to your base.
 * [Deathknell][>] Repeat this gear's play effect.
 */
const spriteTokenEffect = {
  location: "base" as const,
  ready: true,
  token: {
    keywords: ["Temporary"],
    might: 3,
    name: "Sprite",
    type: "unit" as const,
  },
  type: "create-token" as const,
};

const abilities: Ability[] = [
  { keyword: "Temporary", type: "keyword" },
  {
    effect: spriteTokenEffect,
    trigger: { event: "play-self" },
    type: "triggered",
  },
  {
    effect: spriteTokenEffect,
    keyword: "Deathknell",
    type: "keyword",
  },
];

export const spriteFountain: GearCard = {
  abilities,
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
