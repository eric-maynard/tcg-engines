import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Forge of the Fluft — sfd-208-221
 *
 * "While you control this battlefield, friendly legends have
 *  '[Exhaust]: Attach an Equipment you control to a unit you control.'"
 *
 * rule 364 / 135.4.b — a conditional static grant: while someone controls the
 * Forge, THAT player's legends HAVE the activated ability printed inline on the
 * grant (rule 740.1.a — "you" is the battlefield's controller, not its owner),
 * and lose it the moment control changes. The granted text is `granted-only`, so the
 * battlefield never activates it itself; the host legend pays [Exhaust] alone
 * (rule 434 — the attach pays no [Equip] cost; 434.1.f moves an already
 * attached Equipment to the new unit).
 */
const abilities: Ability[] = [
  {
    condition: { type: "control-battlefield" },
    effect: {
      // The granted text is printed inline here and exposed by the registry at
      // `abilityIndex` (the card itself has exactly this one printed ability).
      ability: {
        cost: { exhaust: true },
        effect: {
          equipment: { controller: "friendly", type: "equipment" },
          holder: "bound",
          target: { controller: "friendly", type: "unit" },
          type: "attach",
        },
        restrictions: [{ type: "granted-only" }],
        type: "activated",
      },
      abilityIndex: 1,
      duration: "static",
      target: { controller: "friendly", location: "anywhere", type: "legend" },
      type: "grant-ability",
    },
    type: "static",
  },
] as unknown as Ability[];

export const forgeOfTheFluft: BattlefieldCard = {
  abilities,
  cardNumber: 208,
  cardType: "battlefield",
  id: createCardId("sfd-208-221"),
  name: "Forge of the Fluft",
  rarity: "uncommon",
  rulesText:
    "While you control this battlefield, friendly legends have &quot;[Exhaust]: Attach an Equipment you control to a unit you control.&quot;",
  setId: "SFD",
};
