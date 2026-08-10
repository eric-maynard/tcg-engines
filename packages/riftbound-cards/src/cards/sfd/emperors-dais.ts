import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Emperor's Dais — sfd-207-221 (Battlefield)
 *
 * When you conquer here, you may pay [1] and return a unit you control
 * here to its owner's hand. If you do, play a 2 [Might] Sand Soldier unit
 * token here.
 *
 * rule 383.3.a / 402.1 — the leading "you may" is decided while the trigger is
 * FINALIZED (declined ⇒ no Chain item); rule 402.2 — "a unit you control here"
 * is the ability's chosen object, named at finalization too. rule 205 / 204.3 —
 * "pay [1] and return a unit …. If you do, …" is NOT a cost within instructions
 * (no "[X] to [Y]" link): paying and returning are game actions performed as
 * the ability RESOLVES (444.2: its controller may still decline to pay then),
 * and "if you do" is a linked instruction (359.3.e.14) — the Sand Soldier is
 * played only when the Energy was paid AND the chosen unit was actually
 * returned (still here and yours; a replaced/impossible return plays nothing).
 */
const abilities: Ability[] = [
  {
    effect: {
      condition: { cost: { energy: 1 }, type: "pay-cost" },
      // The chosen unit is the SUBJECT of the whole instruction: bound at
      // finalization, re-checked as it resolves (359.3.e.5 — bounced or stolen
      // meanwhile ⇒ nothing to return, nothing to pay for, no token).
      target: { controller: "friendly", location: "here", type: "unit" },
      then: {
        effects: [
          {
            target: { controller: "friendly", location: "here", type: "unit" },
            type: "return-to-hand",
          },
          {
            condition: { type: "did-perform" },
            then: {
              location: "here",
              token: { might: 2, name: "Sand Soldier", type: "unit" },
              type: "create-token",
            },
            type: "conditional",
          },
        ],
        type: "sequence",
      },
      type: "conditional",
    },
    optional: true,
    // rule 471.2.a — "When you conquer HERE" is anchored to this battlefield:
    // the same player conquering elsewhere never offers the option.
    trigger: { event: "conquer", location: "here", on: "controller" },
    type: "triggered",
  },
];

export const emperorsDais: BattlefieldCard = {
  abilities,
  cardNumber: 207,
  cardType: "battlefield",
  id: createCardId("sfd-207-221"),
  name: "Emperor's Dais",
  rarity: "uncommon",
  rulesText:
    "When you conquer here, you may pay [1] and return a unit you control here to its owner's hand. If you do, play a 2 [Might] Sand Soldier unit token here.",
  setId: "SFD",
};
