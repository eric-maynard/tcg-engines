import type { Ability } from "@tcg/riftbound-types";
import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Deceiver — unl-199-219 (Legend · LeBlanc)
 *
 * "When you conquer or hold, you may discard 1 and exhaust me to play a ready
 *  Reflection unit token there. It becomes a copy of another unit there. Give
 *  it [Temporary]."
 *
 * The phrasing is unique to this card, so the payload is written out rather
 * than parsed.
 */
const abilities: Ability[] = [
  {
    // rule 383.3.b.1: "discard 1 and exhaust me TO …" is the trigger's base
    // cost — paid at finalization, before anyone gets priority, and the offer
    // cannot be taken at all when either half is unpayable.
    condition: { cost: { discard: 1, exhaust: true }, type: "pay-cost" },
    effect: {
      // rule 387 / 359.2: "It becomes a copy of another unit there" is a
      // REFLEXIVE follow-up sentence, so its object is named only as that
      // instruction RESOLVES — it is not one of the item's finalization-time
      // choices (383.3.b). The opponent gets priority first and may change
      // what is standing there before the copy happens.
      chooseAtResolution: true,
      // "there" = the battlefield that was conquered/held.
      location: "here",
      // rule 184.1: "ready" overrides the enter-exhausted default.
      ready: true,
      // rule 477.1.b: "a copy of ANOTHER unit there".
      target: { excludeSelf: true, location: "here", type: "unit" },
      token: {
        // rule 477.1.b.1: `CopyOnPlay` makes the minted instance take the
        // chosen unit's name/Might/text instead of the literal token stats.
        // rule 816 / 477.2.a: "Give IT [Temporary]" names the token, and a
        // granted keyword rides on top of the copied traits.
        keywords: ["CopyOnPlay", "Temporary"],
        // rule 187.6: a Reflection is a domainless 0-Might unit token.
        might: 0,
        name: "Reflection",
        type: "unit",
      },
      type: "create-token",
    },
    // rule 383.3.a: the leading "you may" is decided at finalization.
    optional: true,
    trigger: { event: "conquer-or-hold", on: "controller" },
    type: "triggered",
  },
];

export const deceiver: LegendCard = {
  abilities,
  cardNumber: 199,
  cardType: "legend",
  championTag: "LeBlanc",
  domain: ["mind", "order"],
  id: createCardId("unl-199-219"),
  name: "Deceiver",
  rarity: "rare",
  rulesText:
    "When you conquer or hold, you may discard 1 and exhaust me to play a ready Reflection unit token there. It becomes a copy of another unit there. Give it [Temporary].",
  setId: "UNL",
};
