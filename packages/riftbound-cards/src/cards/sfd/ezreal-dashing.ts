import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Ezreal, Dashing — sfd-082-221
 *
 * When I attack or defend, deal damage equal to my Might to an enemy
 * unit here.
 * I don't deal combat damage.
 * [mind]: [Action] — Move me to your base.
 *
 * Three abilities:
 *  1. Triggered (attack OR defend): deal self-might damage to an enemy here
 *  2. Static: grant "NoCombatDamage" keyword to self
 *  3. Activated: pay mind power, move self to base
 *
 * FIXME: "When I attack or defend" requires two trigger entries — we use
 * two triggered abilities since the trigger shape is a single event.
 */
const abilities: Ability[] = [
  {
    effect: {
      amount: { might: "self" },
      target: {
        controller: "enemy",
        location: "here",
        type: "unit",
      },
      type: "damage",
    },
    trigger: { event: "attack", on: "self" },
    type: "triggered",
  },
  {
    effect: {
      amount: { might: "self" },
      target: {
        controller: "enemy",
        location: "here",
        type: "unit",
      },
      type: "damage",
    },
    trigger: { event: "defend", on: "self" },
    type: "triggered",
  },
  {
    effect: {
      duration: "permanent",
      keyword: "NoCombatDamage",
      target: "self",
      type: "grant-keyword",
    },
    type: "static",
  },
  {
    cost: { power: ["mind"] },
    effect: { target: "self", to: "base", type: "move" },
    timing: "action",
    type: "activated",
  },
];

export const ezrealDashing: UnitCard = {
  abilities,
  cardNumber: 82,
  cardType: "unit",
  domain: "mind",
  energyCost: 4,
  id: createCardId("sfd-082-221"),
  isChampion: true,
  might: 3,
  name: "Ezreal, Dashing",
  rarity: "rare",
  rulesText:
    "When I attack or defend, deal damage equal to my Might to an enemy unit here.\nI don't deal combat damage.\n[mind]: [Action] — Move me to your base.",
  setId: "SFD",
  tags: ["Ezreal"],
};
