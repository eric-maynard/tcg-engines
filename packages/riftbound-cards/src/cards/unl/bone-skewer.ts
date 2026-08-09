import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Bone Skewer — unl-139-219 (Action spell)
 *
 * [Hidden]
 * Choose a battlefield. An opponent reveals their hand. You may choose
 * a unit from it. They play that unit to that battlefield, ignoring any
 * and all costs. When they do, [Stun] it.
 *
 * rule 419.3 / 811.1.c.1 — the chosen battlefield is where the picked unit is
 * played; its OWNER plays it (control stays with them) for no cost at all
 * (356.5.a) and it arrives stunned (423). "You may choose" makes the pick
 * declinable (355.13).
 */
const abilities: Ability[] = [
  { keyword: "Hidden", type: "keyword" },
  {
    effect: {
      chooseBattlefield: true,
      filter: { cardTypes: ["unit"] },
      onPicked: "play",
      optional: true,
      playIgnoreCost: true,
      playStun: true,
      target: { type: "player", which: "opponent" },
      type: "reveal-hand",
    },
    timing: "action",
    type: "spell",
  },
];

export const boneSkewer: SpellCard = {
  abilities,
  cardNumber: 139,
  cardType: "spell",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("unl-139-219"),
  name: "Bone Skewer",
  rarity: "rare",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [0].)\nChoose a battlefield. An opponent reveals their hand. You may choose a unit from it. They play that unit to that battlefield, ignoring any and all costs. When they do, [Stun] it. (It doesn't deal combat damage this turn.)",
  setId: "UNL",
  timing: "action",
};
