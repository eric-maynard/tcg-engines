import type { Ability } from "@tcg/riftbound-types";
import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * rule 434.1.d / 718.4 — the printed +1 [Might] rides the attachment; the
 * Effect Text adds a further +2 only on the turn the attach happened
 * (ruling 0132fdb1a8f4fca8). rule 434.1.f: attaching anew detaches first, so a
 * same-turn re-equip re-stamps the attach instead of stacking — the holder is
 * 2+1+2 = 5, never 7, and drops to 2 while detached (435.1.e).
 * The `attached-this-turn` condition is evaluated against the Equipment itself
 * (not `effectText`'s holder remap), while `affects: "self"` hands the +2 to
 * the unit it is attached to.
 */
const abilities: Ability[] = [
  { cost: { power: ["calm"] }, keyword: "Equip", type: "keyword" },
  {
    affects: "self",
    condition: { type: "attached-this-turn" },
    effect: { amount: 2, type: "modify-might" },
    effectText: true,
    type: "static",
  } as unknown as Ability,
];

export const brutalizer: EquipmentCard = {
  abilities,
  cardNumber: 42,
  cardType: "equipment",
  domain: "calm",
  effectText: "If this was attached to me this turn, I have an additional +2 [Might].",
  energyCost: 2,
  id: createCardId("sfd-042-221"),
  mightBonus: 1,
  name: "Brutalizer",
  rarity: "uncommon",
  rulesText:
    "[Equip] [calm] ([calm]: Attach this to a unit you control.)\nIf this was attached to me this turn, I have an additional +2 [Might].",
  setId: "SFD",
};
