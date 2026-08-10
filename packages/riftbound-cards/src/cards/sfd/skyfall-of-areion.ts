import type { Ability } from "@tcg/riftbound-types";
import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Skyfall of Areion — sfd-030-221 (Equipment)
 *
 * "[Equip] [1][fury] ([1][fury]: Attach this to a unit you control.)
 *  My hold effects are also conquer effects, and vice versa."
 *
 * rule 136.2.d / 718 — the Effect Text is appended to the WEARER, so "my"
 * means the wearer: the `hold-conquer-equivalence` static makes the trigger
 * runner mirror every hold-triggered ability of the unit (printed, or
 * conferred by another attached Equipment such as Trinity Force) onto conquer
 * and vice versa. The phrasing is unique to this card, so the ability is
 * spelled out here rather than taught to the parser.
 */
const abilities: Ability[] = [
  { cost: { energy: 1, power: ["fury"] }, keyword: "Equip", type: "keyword" },
  { effect: { type: "hold-conquer-equivalence" }, effectText: true, type: "static" },
];

export const skyfallOfAreion: EquipmentCard = {
  abilities,
  cardNumber: 30,
  cardType: "equipment",
  domain: "fury",
  effectText: "My hold effects are also conquer effects, and vice versa.",
  energyCost: 3,
  id: createCardId("sfd-030-221"),
  mightBonus: 2,
  name: "Skyfall of Areion",
  rarity: "epic",
  rulesText:
    "[Equip] [1][fury] ([1][fury]: Attach this to a unit you control.)\nMy hold effects are also conquer effects, and vice versa.",
  setId: "SFD",
};
