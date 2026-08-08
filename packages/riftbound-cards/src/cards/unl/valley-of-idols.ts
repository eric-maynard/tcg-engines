import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Valley of Idols — unl-218-219 (Battlefield)
 *
 * When a player plays a unit here, they may pay [1] to [Buff] it.
 *
 * rule 190.6.c — "a player … they": the ability is controlled by the player who
 * played the unit (`on: "any-player"` on a battlefieldRow card), so THEY are
 * asked and THEY pay, whoever holds the battlefield.
 * rule 359.2.c — "here" is this battlefield only (`trigger.location`).
 * rule 444.2 — the [1] is an optional cost inside the effect; declining (or
 * being unable to pay) simply skips the buff.
 * rule 702 — [Buff] is a persistent +1 Might marker on the played unit ("it" =
 * `trigger-source`), not a this-turn pump.
 */
const abilities: Ability[] = [
  {
    condition: { cost: { energy: 1 }, type: "pay-cost" },
    effect: { target: { type: "trigger-source" }, type: "buff" },
    optional: true,
    trigger: { event: "play-unit", location: "here", on: "any-player" },
    type: "triggered",
  } as unknown as Ability,
];

export const valleyOfIdols: BattlefieldCard = {
  abilities,
  cardNumber: 218,
  cardType: "battlefield",
  id: createCardId("unl-218-219"),
  name: "Valley of Idols",
  rarity: "uncommon",
  rulesText:
    "When a player plays a unit here, they may pay [1] to [Buff] it. (Give it a +1 [Might] buff if it doesn't have one.)",
  setId: "UNL",
};
