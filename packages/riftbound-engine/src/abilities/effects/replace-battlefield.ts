// Effect handler: "replace-battlefield" (rule 438)
import type { CardId as CoreCardId } from "@tcg/core";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { recalculateStaticEffects, type StaticAbilityContext } from "../static-abilities";
import type { EffectHelpers } from "./_helpers";

let replacedSeq = 0;

/**
 * rule 187.7 / 187.8 — battlefield tokens are defined by the rules, not by the
 * card that creates them, so their printed text lives here (the same shape
 * `create-token.ts` uses for named unit/gear tokens).
 */
const BATTLEFIELD_TOKEN_DEFS: Record<string, { name: string; abilities: readonly unknown[] }> = {
  // rule 187.8 — "Bird, Cat, Dog, Poro, and Ivern units here have +1 [Might]."
  brush: {
    abilities: [
      {
        effect: {
          amount: 1,
          target: {
            filter: { tag: ["Bird", "Cat", "Dog", "Poro", "Ivern"] },
            location: "here",
            type: "unit",
          },
          type: "modify-might",
        },
        type: "static",
      },
    ],
    name: "Brush",
  },
};

/**
 * rule 438.1 — the token is created in the replaced card's place: same slot, so
 * the control, the contested state and every unit standing there are untouched.
 * rule 438.5 — the replaced battlefield goes to Banishment ("replaced, not
 * banished"); 438.7 lets a later Swap Back bring it out, so the slot records
 * which card it displaced.
 */
export function handle_replaceBattlefield(
  effect: ExecutableEffect,
  ctx: EffectContext,
  _h: EffectHelpers,
): void {
  const zone = ctx.triggerBattlefieldZone;
  // "THAT battlefield" is the one the firing event named; with no such event
  // there is nothing to replace.
  if (!zone?.startsWith("battlefield-")) {
    return;
  }
  const battlefieldId = zone.slice("battlefield-".length);
  const token = (effect as { token?: { name?: string } }).token;
  const tokenDef = BATTLEFIELD_TOKEN_DEFS[(token?.name ?? "").toLowerCase()];
  if (!tokenDef) {
    return;
  }
  const registry = getGlobalCardRegistry();
  const replacedDef = registry.get(battlefieldId);
  if (!replacedDef || replacedDef.cardType !== "battlefield") {
    return;
  }
  const owner = ctx.cards.getCardOwner(battlefieldId as CoreCardId) ?? ctx.playerId;

  // rule 438.5: the printed battlefield leaves the slot for Banishment as its
  // own object, so it can be swapped back later.
  const replacedId = `replaced-${battlefieldId}-${replacedSeq++}`;
  ctx.createCardInZone?.(replacedId, "banishment", owner);
  registry.register(replacedId, { ...replacedDef, id: replacedId });

  // rule 438.1: the token takes the slot itself — same id, so the units there
  // and the battlefield's controller/points state need no rewriting.
  registry.register(battlefieldId, {
    abilities: [...tokenDef.abilities] as never,
    cardType: "battlefield",
    id: battlefieldId,
    isToken: true,
    name: tokenDef.name,
  });
  ctx.cards.updateCardMeta?.(battlefieldId as CoreCardId, {
    replacedBattlefieldCardId: replacedId,
  } as unknown as Record<string, unknown>);

  // rule 522: the token's aura is continuous — a Poro already standing here is
  // +1 the instant the replacement happens.
  recalculateStaticEffects({
    cards: ctx.cards,
    draft: ctx.draft,
    zones: ctx.zones,
  } as unknown as StaticAbilityContext);
}
