// Effect handler: "counter"
import type { CardId as CoreCardId, ZoneId as CoreZoneId } from "@tcg/core";
import { removeChainItem } from "../../chain";
import { isLegalCounterTarget } from "../../chain/counter-target";
import { itemIsUncounterable } from "../../chain/uncounterable";
import { isImmediateAddEffect } from "../../game-definition/moves/chain/activate-ability";
import { canAffordPower } from "../../game-definition/moves/chain/effect-context";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import { noteCounteredPlay } from "../../operations/plays-this-turn";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers } from "./_helpers";

/**
 * rule 158.1 / 429.3 (sfd-136-221 × ogs-014-024) — whether `payer` could
 * actually meet a "unless its controller pays …" ransom right now. Energy
 * earmarked "use only to play spells/gear" is not spendable on a payment
 * demanded while a spell resolves, so it never counts. An unpayable ransom is
 * no choice at all: the counter simply lands without a prompt.
 */
function ransomIsPayable(
  draft: EffectContext["draft"],
  payer: string,
  cost: Record<string, unknown>,
): boolean {
  const pool = draft.runePools[payer];
  if (!pool) {
    return false;
  }
  const earmarked = Object.values(
    (draft as { restrictedEnergy?: Record<string, Partial<Record<string, number>>> })
      .restrictedEnergy?.[payer] ?? {},
  ).reduce<number>((sum, amount) => sum + (amount ?? 0), 0);
  if (pool.energy - Math.min(earmarked, pool.energy) < ((cost.energy as number) ?? 0)) {
    return false;
  }
  const powerCost = cost.power as string[] | undefined;
  if (powerCost && powerCost.length > 0) {
    const needed: Record<string, number> = {};
    for (const d of powerCost) {
      needed[d] = (needed[d] ?? 0) + 1;
    }
    if (!canAffordPower(pool.power, needed)) {
      return false;
    }
  }
  return true;
}

/**
 * rule 429.3 / 429.3.a (ruling 67afd3e1651019f3) — a pool that is short right
 * now is not the whole story: an [Add] ability may be activated DURING the
 * payment. If the payer controls a ready permanent with an immediate [Add]
 * activated ability, the ransom is still a real choice, so the prompt must be
 * raised instead of the counter landing unopposed.
 */
function payerCanAddResources(ctx: EffectContext, payer: string): boolean {
  const registry = getGlobalCardRegistry();
  const zoneIds: string[] = ["base", "legendZone"];
  const candidates: string[] = [];
  for (const zone of zoneIds) {
    for (const cardId of ctx.zones.getCardsInZone(zone as CoreZoneId, payer as never)) {
      candidates.push(cardId as string);
    }
  }
  for (const bfId of Object.keys(ctx.draft.battlefields ?? {})) {
    for (const cardId of ctx.zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId)) {
      const controller =
        ctx.cards.getCardController?.(cardId) ?? ctx.cards.getCardOwner(cardId);
      if (controller === payer) {
        candidates.push(cardId as string);
      }
    }
  }
  for (const cardId of candidates) {
    // rule 404.1 — an already-exhausted permanent cannot pay an [Exhaust] cost.
    const meta = ctx.cards.getCardMeta?.(cardId as CoreCardId) as
      | { isExhausted?: boolean }
      | undefined;
    if (meta?.isExhausted === true) {
      continue;
    }
    for (const ability of registry.getAbilities(cardId) ?? []) {
      if (ability.type !== "activated" || !isImmediateAddEffect(ability.effect)) {
        continue;
      }
      // rule 429.3 (ogs-014-024 Lux) — energy earmarked "use only to play
      // spells" is never spendable on a payment demanded while a spell
      // resolves, so such an [Add] cannot make the ransom payable.
      if ((ability.effect as { restriction?: unknown } | undefined)?.restriction !== undefined) {
        continue;
      }
      return true;
    }
  }
  return false;
}

/**
 * rule 429.3 (rule-id: ven-039-166) — "if an opponent has played ANOTHER spell
 * this turn": only spells count (units and gear do not), only an opponent's,
 * only this turn (`turnEvents` is cleared at every turn start), and never the
 * spell being countered nor the countering spell itself.
 */
function counterGateMet(
  gate: Record<string, unknown>,
  ctx: EffectContext,
  targetId: string | undefined,
): boolean {
  if (gate.type !== "opponent-played-another-spell") {
    return true;
  }
  const targetController =
    targetId === undefined
      ? undefined
      : (ctx.cards.getCardController?.(targetId as CoreCardId) ??
        ctx.cards.getCardOwner(targetId as CoreCardId));
  const byPlayer = (ctx.draft.turnEvents ?? {}) as Record<string, readonly string[]>;
  for (const [playerId, events] of Object.entries(byPlayer)) {
    if (playerId === ctx.playerId) {
      continue;
    }
    let played = events.filter((event) => event === SPELL_PLAYED).length;
    // "ANOTHER": the spell being answered is itself one of this turn's plays
    // (it is still on the chain), so it never satisfies its own gate.
    if (playerId === targetController) {
      played -= 1;
    }
    if (played > 0) {
      return true;
    }
  }
  return false;
}

/** Pushed by `playSpell` for every spell put on the chain (rule 425.1.b). */
const SPELL_PLAYED = "played-spell";

export function handle_counter(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  // Counter a spell — mark the next item on the chain as countered
  // So its effect is skipped during resolution (rule 543)
  const chain = ctx.draft.interaction?.chain;
  if (chain && chain.items.length > 0) {
    // The item below the counter on the stack is the target
    // (counter was on top, already popped; the new top is the target)
    const { items } = chain;
    if (items.length > 0) {
      // rule-id: sfd-206-221 — "Counter a spell": the target is the topmost
      // un-countered SPELL beneath this item (never a triggered/activated
      // ability sitting above it, and never the countering spell itself),
      // sharing the play-time gate's legality check (isLegalCounterTarget).
      const counterSpec = effect as { target?: unknown };
      let targetItem: (typeof items)[number] | undefined;
      // rule-id: ogn-064-298 (rule 355.8) — the spell to counter was chosen
      // at play time and travels as boundTargets[0]; honour it rather than
      // defaulting to the topmost item when several spells are pending.
      const boundId = ctx.boundTargets?.[0];
      const boundOnChain =
        boundId !== undefined && items.some((it) => it && it.cardId === boundId);
      // rule 359.3.e.2 / 359.3.e.7 (sfd-136-221) — a locked spell that has
      // already left the chain (an earlier [Repeat] execution countered it)
      // leaves THIS instruction with no legal target: it does nothing. It must
      // never slide onto the next spell down, which was never named at play
      // time (rule 355.15).
      if (
        boundId !== undefined &&
        !boundOnChain &&
        getGlobalCardRegistry().getCardType(boundId) === "spell"
      ) {
        return;
      }
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        if (
          !isLegalCounterTarget(counterSpec, item, ctx.sourceCardId, {
            controllerOf: (id) =>
              ctx.cards.getCardController?.(id as CoreCardId) ??
              ctx.cards.getCardOwner(id as CoreCardId),
            playerId: ctx.playerId,
            zoneOf: (id) => ctx.zones.getCardZone(id as CoreCardId),
          })
        )
          continue;
        if (boundOnChain && item.cardId !== boundId) continue;
        targetItem = item;
        break;
      }
      // rule 359.3.e.14.a (ven-015-166 × unl-190-219) — "that spell" is the
      // spell this counter ACTUALLY countered. An ignored counter (an
      // uncounterable or already-countered target, an unmet gate, a paid
      // ransom) leaves it unset, so every instruction LINKED to the counter
      // — Lullaby's "its controller can't play spells this turn", Riposte's
      // "+Might equal to that spell's cost" — is ignored with it.
      ctx.draft.lastCounterTargetId = undefined;
      // rule 429.3 (rule-id: ven-039-166) — a counter carrying its own gate
      // does nothing at all when the gate is false: the target resolves.
      const gate = (effect as { condition?: Record<string, unknown> }).condition;
      if (gate !== undefined && !counterGateMet(gate, ctx, targetItem?.cardId)) {
        return;
      }
      // rule 158.1 (sfd-136-221) — "Counter a spell unless its controller pays
      // [N]": the ransom is a payment made WHILE this effect resolves, not an
      // additional cost, so cost-reduction statics never touch it. Pause and
      // ask the targeted spell's controller; declining re-enters this handler
      // with the `unless` clause stripped and the counter lands.
      const ransomCost = (effect as { unless?: Record<string, unknown> }).unless;
      // rule 727.1.c.2 (ven-069-166) — the shield is sampled NOW, as the
      // counter executes, not when the target was played.
      const shielded = itemIsUncounterable(targetItem, ctx);
      if (ransomCost && targetItem && !targetItem.countered && !shielded) {
        const payer =
          ctx.cards.getCardController?.(targetItem.cardId as CoreCardId) ??
          ctx.cards.getCardOwner(targetItem.cardId as CoreCardId);
        if (
          payer &&
          (ransomIsPayable(ctx.draft, payer, ransomCost) || payerCanAddResources(ctx, payer))
        ) {
          const { unless: _dropped, ...withoutUnless } = effect as Record<string, unknown>;
          ctx.draft.pendingChoice = {
            counterRansom: {
              boundTargets: ctx.boundTargets ? [...ctx.boundTargets] : undefined,
              effect: withoutUnless,
              sourcePlayerId: ctx.playerId,
            },
            playerId: payer,
            resolved: { optInCost: ransomCost },
            sourceCardId: ctx.sourceCardId,
            type: "opt-in",
          } as typeof ctx.draft.pendingChoice;
          return;
        }
      }
      // rule-id: ven-015-166 — "This can't be countered." (rule 544): the
      // counter resolves but has no effect on an uncounterable item.
      if (targetItem && !targetItem.countered && !shielded) {
        // Mutate in-place (we're inside an Immer draft)
        (targetItem as { countered: boolean }).countered = true;
        // rule 412 (ruling 5807cc9df8627167) — a countered spell never
        // resolves, so "when you play your Nth card in a turn" skips its
        // ordinal and the NEXT card played is that turn's Nth. The play still
        // counts for non-triggered bookkeeping (419.4.b — Legion, "played
        // another spell this turn"), so only the ordinal is voided.
        if (targetItem.type === "spell") {
          const spellController =
            ctx.cards.getCardController?.(targetItem.cardId as CoreCardId) ??
            ctx.cards.getCardOwner(targetItem.cardId as CoreCardId);
          const ordinal = (
            ctx.draft as { spellPlayOrdinals?: Record<string, number> }
          ).spellPlayOrdinals?.[targetItem.cardId];
          if (spellController && ordinal !== undefined) {
            noteCounteredPlay(ctx.draft, spellController, ordinal);
          }
        }
        // rule-id: sfd-206-221 — remember "that spell" for follow-up steps, since
        // a countered spell no longer sits on the chain to be read back.
        ctx.draft.lastCounterTargetId = targetItem.cardId;
        // rule-id: unl-131-219 — "Return it to its owner's hand instead of
        // putting it in their trash": redirect where the countered spell
        // settles when it leaves the chain.
        // rule 829.1.b.1 / 370.2 / 372 — a spell played via [Flow] carries a
        // delayed "banish it instead" replacement on leaving the chain; it wins
        // over "to hand instead of trash" whichever order the two apply. Same
        // for a spell played with a "recycle it after you play it" rider
        // (Fizz, Kai'Sa — `resolveTo: "mainDeck"`; ruling 54eaac53e28fa48f):
        // rule 372 lets the owner order the two replacements, but either
        // order ends with the spell recycled.
        if (
          (effect as { destination?: string }).destination === "hand" &&
          targetItem.type === "spell" &&
          targetItem.resolveTo !== "banishment" &&
          targetItem.resolveTo !== "mainDeck"
        ) {
          (targetItem as { resolveTo?: string }).resolveTo = "hand";
        }
        // rule-id: ogn-064-298 (rule 425.1.a / 425.1.a.1) — a countered card
        // is cleared from the chain and put in its settle zone as part of
        // being countered, not deferred to the next all-pass resolution.
        const { cardId, id, resolveTo, type } = targetItem;
        if (
          type === "spell" &&
          ctx.zones.getCardZone(cardId as CoreCardId) === "chain"
        ) {
          ctx.zones.moveCard({
            cardId: cardId as CoreCardId,
            targetZoneId: (resolveTo ?? "trash") as CoreZoneId,
          });
        }
        if (ctx.draft.interaction) {
          ctx.draft.interaction = removeChainItem(ctx.draft.interaction, id);
        }
      }
    }
  }
}
