import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// rule-id: unl-200-219 — parseAbilities cannot match a might-less unit token,
// so the Reflection create-token is hand-authored here (mirrors keeper-of-masks).
// CopyOnPlay marks the token for the runtime's copy-target resolution.
// rule-id: unl-200-219 — Temporary is baked into the token def (sprite-queen
// pattern) rather than granted via a follow-up step: getTargetIds() prefers
// ctx.boundTargets — the chosen source unit — over any sequence pending-value,
// so a separate grant-keyword would land on the original, not the token.
const abilities: Ability[] = [
  {
    effect: {
      location: "base",
      ready: true,
      token: {
        keywords: ["CopyOnPlay", "Temporary"],
        might: 0,
        name: "Reflection",
        type: "unit",
      },
      type: "create-token",
    },
    timing: "action",
    type: "spell",
  },
];

export const mirrorImage: SpellCard = {
  abilities,
  cardNumber: 200,
  cardType: "spell",
  domain: ["mind", "order"],
  energyCost: 3,
  id: createCardId("unl-200-219"),
  name: "Mirror Image",
  rarity: "epic",
  rulesText:
    "Choose a unit. Play a ready Reflection unit token to your base. It becomes a copy of that unit. Give it [Temporary]. (Kill it at the start of its controller's Beginning Phase, before scoring.)",
  setId: "UNL",
  timing: "action",
};
