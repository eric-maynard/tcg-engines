import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// The trailing "If it's an Equipment, attach it to me" is unique to this card:
// the parser reads both pronouns as `self`, which attaches Akshan to himself
// (a no-op). Spelled out here so the moved gear — the sequence's pendingValue
// — is what gets attached; `attachEquipment` enforces the "if it's an
// Equipment" half (rule 434.1), leaving a non-Equipment gear merely stolen.
const abilities: Ability[] = [
  { keyword: "Weaponmaster", type: "keyword" },
  {
    effect: {
      additionalCost: ":rb_rune_body::rb_rune_body:",
      optional: true,
      type: "additional-cost-option",
    },
    type: "static",
  },
  {
    condition: { type: "paid-additional-cost" },
    effect: {
      effects: [
        { target: { controller: "enemy", type: "gear" }, to: "base", type: "move" },
        { duration: "until-leaves", target: { type: "pending-value" }, type: "take-control" },
        // rule 434: attach the gear we just moved, not Akshan himself.
        { equipment: { type: "pending-value" }, to: "self", type: "attach" },
      ],
      pendingValue: { source: 0 },
      type: "sequence",
    },
    trigger: { event: "play-self" },
    type: "triggered",
  },
] as unknown as Ability[];

export const akshanMischievous: UnitCard = {
  abilities,
  cardNumber: 109,
  cardType: "unit",
  domain: "body",
  energyCost: 4,
  id: createCardId("sfd-109-221"),
  isChampion: true,
  might: 4,
  name: "Akshan, Mischievous",
  rarity: "rare",
  rulesText:
    "[Weaponmaster]\nYou may pay [body][body] as an additional cost to play me.\nWhen you play me, if you paid the additional cost, move an enemy gear to your base. You control it until I leave the board. If it's an Equipment, attach it to me.",
  setId: "SFD",
  tags: ["Akshan"],
};
