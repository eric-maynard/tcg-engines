/**
 * playSpell move (split from cards.ts).
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import { resolveTarget } from "../../../abilities/target-resolver";
import { addToChain, createInteractionState, getTurnState, isLegalTiming } from "../../../chain";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";
import type { CostExtras } from "./cost";
import {
  getOptionalPlayCost,
  createMetaAccessor,
  getCardEffectiveMight,
  getPotentialRuneEnergy,
  canAffordCard,
  deductCost,
} from "./cost";
import type { SpellEffectTargetShape } from "./targeting";
import {
  findAmountReferenceTarget,
  findSequenceLeadTarget,
  findSplitDamageEffect,
  enumerateSubsetsUpTo,
  spellEffectHasLegalTargets,
} from "./targeting";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * Play a spell (rule 146-151)
 */
export const playSpell: Defs["playSpell"] = {
  condition: (state, context) => {
    if (state.status !== "playing") {
      return false;
    }
    if (state.pendingChoice) {
      return false;
    }

    const zone = context.zones.getCardZone(context.params.cardId as CoreCardId);
    // rule-id: ven-049-166 — [Flow] lets the owner play a spell from their
    // trash for its Flow cost. viaFlow is only legal from the trash zone on
    // a card that carries a Flow keyword; non-Flow plays remain hand-only.
    const viaFlow = context.params.viaFlow === true;
    if (viaFlow) {
      if (zone !== "trash") {
        return false;
      }
      if (!getGlobalCardRegistry().getSpellFlowCost(context.params.cardId)) {
        return false;
      }
    } else if (zone !== "hand") {
      return false;
    }

    // Rule 103 / 555: only the card's owner may play it.
    const owner = context.cards.getCardOwner(context.params.cardId as CoreCardId);
    if (owner !== context.params.playerId) {
      return false;
    }

    // Rule: Repeat cost is only valid on spells that have a defined
    // `repeat` cost on their spell ability. Reject repeatCount > 0 for
    // Spells without Repeat.
    const reqRepeatCount = Math.max(0, context.params.repeatCount ?? 0);
    if (reqRepeatCount > 0) {
      const registryCheck = getGlobalCardRegistry();
      if (!registryCheck.getSpellRepeatCost(context.params.cardId)) {
        return false;
      }
    }

    // rule-id: ven-083-166 — a spell's optional "you may pay [X] as an
    // additional cost" (rule 560) is only legal when the card declares one
    // and the caster can afford base + extra.
    let spellAdditionalCost: CostExtras["additionalCost"];
    if (context.params.paidAdditionalCost) {
      const optional = getOptionalPlayCost(context.params.cardId);
      if (optional?.kind !== "pay") {
        return false;
      }
      spellAdditionalCost = optional.cost ?? {};
    }

    if (
      !canAffordCard(
        state,
        context.params.playerId,
        context.params.cardId,
        {
          additionalCost: spellAdditionalCost,
          // rule-id: ven-055-166 — friendly "your spells cost less" statics.
          board: { cards: context.cards, zones: context.zones },
          repeatCount: reqRepeatCount,
          targets: context.params.targets,
          viaFlow,
          xAmount: context.params.xAmount,
        },
        createMetaAccessor(context.cards),
        getPotentialRuneEnergy(context.zones, context.counters, context.params.playerId),
      )
    ) {
      return false;
    }

    const interaction = state.interaction ?? createInteractionState();
    const turnState = getTurnState(interaction);
    const registry = getGlobalCardRegistry();
    const timing = (registry.getSpellTiming(context.params.cardId) ?? "action") as
      | "action"
      | "reaction";

    if (!isLegalTiming(timing, turnState)) {
      return false;
    }

    // Rule 530: in Neutral Open state, only the active player holds
    // Priority, so only they may play an Action-timed spell. Reaction
    // Spells can be played by any relevant player in a Closed state.
    if (timing === "action" && turnState === "neutral-open") {
      if (state.turn.activePlayer !== context.params.playerId) {
        return false;
      }
    }

    // Rule 355.8 / 419.2.a: gate on caster-chosen targets (including modal options).
    const abilities = registry.getAbilities(context.params.cardId) ?? [];
    const spellAbility = abilities.find((a: { type: string }) => a.type === "spell");
    if (
      !spellEffectHasLegalTargets(spellAbility?.effect as SpellEffectTargetShape | undefined, {
        cards: {
          getCardOwner: (c) => context.cards.getCardOwner(c),
        },
        draft: state,
        playerId: context.params.playerId as string,
        sourceCardId: context.params.cardId as string,
        zones: {
          getCardZone: (c) => context.zones.getCardZone(c),
          getCardsInZone: (z, p) => context.zones.getCardsInZone(z, p),
        },
      })
    ) {
      return false;
    }

    return true;
  },
  enumerator: (state, context) => {
    if (state.status !== "playing") {
      return [];
    }
    if (state.pendingChoice) {
      return [];
    }

    const registry = getGlobalCardRegistry();
    const interaction = state.interaction ?? createInteractionState();
    const turnState = getTurnState(interaction);
    const pool = state.runePools[context.playerId as string];
    if (!pool) {
      return [];
    }
    // Rule 357.1.a: credit ready runes as available energy for enumeration.
    const potential = getPotentialRuneEnergy(
      context.zones,
      context.counters,
      context.playerId as string,
    );
    // rule-id: ven-055-166 — friendly "your spells cost less" statics must be
    // visible to the enumerator, so gate on canAffordCard with board access
    // rather than the printed-cost-only registry.canAfford.
    const board = { cards: context.cards, zones: context.zones };
    const metaForAfford = createMetaAccessor(context.cards);

    const handCards = context.zones.getCardsInZone(
      "hand" as CoreZoneId,
      context.playerId as CorePlayerId,
    );

    const results: {
      playerId: string;
      cardId: string;
      targets?: string[];
      repeatCount?: number;
      viaFlow?: boolean;
      paidAdditionalCost?: boolean;
      additionalCostSpec?: { energy?: number; power?: readonly string[] };
    }[] = [];
    for (const cardId of handCards) {
      const def = registry.get(cardId as string);
      if (!def || def.cardType !== "spell") {
        continue;
      }
      if (
        !canAffordCard(
          state,
          context.playerId as string,
          cardId as string,
          { board },
          metaForAfford,
          potential,
        )
      ) {
        continue;
      }

      // Check spell timing is legal in current turn state (rule 553)
      const timing = (registry.getSpellTiming(cardId as string) ?? "action") as
        | "action"
        | "reaction";
      if (!isLegalTiming(timing, turnState)) {
        continue;
      }

      // Rule 355.8 / 419.2.a: gate on caster-chosen targets (including modal options).
      const abilities = registry.getAbilities(cardId as string) ?? [];
      const spellAbility = abilities.find((a: { type: string }) => a.type === "spell");
      const spellEffect = spellAbility?.effect as SpellEffectTargetShape | undefined;
      const resolverCtx = {
        cards: {
          getCardMeta: (c: CoreCardId) => context.cards.getCardMeta?.(c),
          getCardOwner: (c: CoreCardId) => context.cards.getCardOwner(c),
        },
        draft: state,
        playerId: context.playerId as string,
        sourceCardId: cardId as string,
        zones: {
          getCardZone: (c: CoreCardId) => context.zones.getCardZone(c),
          getCardsInZone: (z: CoreZoneId, p?: CorePlayerId) => context.zones.getCardsInZone(z, p),
        },
      };
      if (!spellEffectHasLegalTargets(spellEffect, resolverCtx)) {
        continue;
      }

      // Rule 355.8: targets are chosen when the spell is PLAYED. For a
      // single-card target descriptor, enumerate one legal Play per valid
      // target so the caster picks. Programmatic selections (quantity:"all"),
      // player/battlefield targets, and self are not caster-chosen.
      // Rule 355.14.a: an amount:{might:<selector>} reference is also a
      // caster-chosen play-time target (unl-192-219).
      const refTgt = findAmountReferenceTarget(spellEffect);
      // rule-id: sfd-017-221 (rule 355.8) — a `sequence` spell's caster-chosen
      // target lives on its lead sub-effect; lift it so the caster picks.
      const tgt = spellEffect?.target ?? refTgt ?? findSequenceLeadTarget(spellEffect);
      const isCardTarget =
        tgt !== undefined &&
        typeof tgt !== "string" &&
        tgt.type !== "self" &&
        tgt.type !== "player" &&
        tgt.type !== "battlefield" &&
        tgt.quantity !== "all";
      const baseVariants: { playerId: string; cardId: string; targets?: string[] }[] = [];
      // rule-id: ven-083-166 (Rampage) / rule 355.8 — "choose a friendly
      // unit and an enemy unit": a `fight` effect names TWO caster-chosen
      // targets (attacker + defender). Enumerate one Play per legal pair so
      // both are locked on the chain item as targets [attacker, defender].
      const fightAtk =
        spellEffect?.type === "fight" && typeof spellEffect.attacker === "object"
          ? spellEffect.attacker
          : undefined;
      const fightDef =
        spellEffect?.type === "fight" && typeof spellEffect.defender === "object"
          ? spellEffect.defender
          : undefined;
      if (!isCardTarget && fightAtk && fightDef) {
        const attackers = resolveTarget(
          { ...fightAtk, quantity: "all" } as Parameters<typeof resolveTarget>[0],
          resolverCtx,
        );
        const defenders = resolveTarget(
          { ...fightDef, quantity: "all" } as Parameters<typeof resolveTarget>[0],
          resolverCtx,
        );
        for (const a of attackers) {
          for (const d of defenders) {
            if (a === d) continue;
            baseVariants.push({
              cardId: cardId as string,
              playerId: context.playerId as string,
              targets: [a as string, d as string],
            });
          }
        }
      } else if (isCardTarget) {
        // rule-id: unl-107-219 — a Might-reference descriptor carries no
        // quantity; surface EVERY legal reference so the caster picks which
        // friendly unit is compared (resolveTarget defaults to the first).
        // rule-id: unl-204-219 (rule 355.8) — same for a plain single-card
        // target: the descriptor's quantity caps how many are CHOSEN, not the
        // candidate pool, so enumerate every legal candidate.
        const validTargets = resolveTarget(
          { ...tgt, quantity: "all" } as Parameters<typeof resolveTarget>[0],
          resolverCtx,
        );
        // Rule 355.14.b/c / 355.15 (unl-192-219): when the enumerated target
        // is the might-reference of a split-damage effect, the caster ALSO
        // chooses up to N enemy split targets at finalization (N = ref's
        // current Might; zero is legal). Enumerate every subset so all
        // choices are locked on the chain item before opponents respond.
        const splitEffect = refTgt ? findSplitDamageEffect(spellEffect) : undefined;
        const splitDesc =
          splitEffect?.target && typeof splitEffect.target !== "string"
            ? splitEffect.target
            : undefined;
        // rule-id: sfd-080-221 (rule 355.13) — "up to N <units>": the caster
        // picks 0..N targets at play time, so enumerate every subset (the
        // empty one included) rather than one Play per single candidate.
        // "at the same location" (location:"here" on a spell) constrains a
        // multi-pick to units sharing one zone.
        const qty = tgt.quantity;
        const upToN =
          !splitDesc && typeof qty === "object" && qty.upTo !== undefined && qty.atLeast === undefined
            ? qty.upTo
            : undefined;
        if (upToN !== undefined) {
          const sameLocation = (tgt as { location?: string }).location === "here";
          for (const subset of enumerateSubsetsUpTo(validTargets as string[], upToN)) {
            if (sameLocation && subset.length > 1) {
              const zone = context.zones.getCardZone(subset[0] as CoreCardId);
              if (!subset.every((id) => context.zones.getCardZone(id as CoreCardId) === zone)) {
                continue;
              }
            }
            baseVariants.push({
              cardId: cardId as string,
              playerId: context.playerId as string,
              targets: subset,
            });
          }
        } else {
          for (const targetId of validTargets) {
            if (splitDesc) {
              const n = getCardEffectiveMight(targetId as string, (c) =>
                context.cards.getCardMeta?.(c),
              );
              const splitPool = resolveTarget(
                { ...splitDesc, quantity: "all" } as Parameters<typeof resolveTarget>[0],
                resolverCtx,
              );
              for (const subset of enumerateSubsetsUpTo(splitPool, n)) {
                baseVariants.push({
                  cardId: cardId as string,
                  playerId: context.playerId as string,
                  targets: [targetId as string, ...subset],
                });
              }
            } else {
              baseVariants.push({
                cardId: cardId as string,
                playerId: context.playerId as string,
                targets: [targetId as string],
              });
            }
          }
        }
      } else {
        baseVariants.push({
          cardId: cardId as string,
          playerId: context.playerId as string,
        });
      }
      results.push(...baseVariants);

      // rule-id: ven-083-166 / rule 560 — "you may pay [X] as an additional
      // cost": enumerate a paid variant per base play so the caster can
      // elect it; the spell's `paid-additional-cost` conditional reads the
      // outcome at resolution.
      const optionalPay = getOptionalPlayCost(cardId as string);
      if (optionalPay?.kind === "pay") {
        const extra = optionalPay.cost ?? {};
        const metaForPay = createMetaAccessor(context.cards);
        for (const base of baseVariants) {
          if (
            canAffordCard(
              state,
              context.playerId as string,
              cardId as string,
              { additionalCost: extra, board, targets: base.targets },
              metaForPay,
              potential,
            )
          ) {
            results.push({
              ...base,
              additionalCostSpec: { energy: extra.energy ?? 0, power: extra.power ?? [] },
              paidAdditionalCost: true,
            });
          }
        }
      }

      // unl-182-219 [Repeat]: the additional cost is paid at cast time, so
      // enumerate one variant per affordable repeatCount alongside the base
      // play. Skip when every tier is free of energy AND power to avoid an
      // unbounded loop (rule 820.1.c.2 / 820.3 — canAffordCard bounds n
      // once any tier charges a resource).
      const repeatCost = registry.getSpellRepeatCost(cardId as string);
      if (repeatCost?.some((t) => t.energy > 0 || t.power.length > 0)) {
        const meta = createMetaAccessor(context.cards);
        for (const base of baseVariants) {
          for (let n = 1; ; n++) {
            if (
              !canAffordCard(
                state,
                context.playerId as string,
                cardId as string,
                { board, repeatCount: n, targets: base.targets },
                meta,
                potential,
              )
            ) {
              break;
            }
            results.push({ ...base, repeatCount: n });
          }
        }
      }
    }

    // rule-id: ven-049-166 — [Flow]: enumerate spells in the owner's trash
    // that carry a Flow cost keyword as playable via their alternate cost.
    const trashCards = context.zones.getCardsInZone(
      "trash" as CoreZoneId,
      context.playerId as CorePlayerId,
    );
    const meta = createMetaAccessor(context.cards);
    for (const cardId of trashCards) {
      const def = registry.get(cardId as string);
      if (!def || def.cardType !== "spell") {
        continue;
      }
      if (!registry.getSpellFlowCost(cardId as string)) {
        continue;
      }
      if (
        !canAffordCard(state, context.playerId as string, cardId as string, { board, viaFlow: true }, meta, potential)
      ) {
        continue;
      }
      const timing = (registry.getSpellTiming(cardId as string) ?? "action") as
        | "action"
        | "reaction";
      if (!isLegalTiming(timing, turnState)) {
        continue;
      }
      if (timing === "action" && turnState === "neutral-open") {
        if (state.turn.activePlayer !== (context.playerId as string)) {
          continue;
        }
      }
      const abilities = registry.getAbilities(cardId as string) ?? [];
      const spellAbility = abilities.find((a: { type: string }) => a.type === "spell");
      const spellEffect = spellAbility?.effect as SpellEffectTargetShape | undefined;
      const resolverCtx = {
        cards: {
          getCardMeta: (c: CoreCardId) => context.cards.getCardMeta?.(c),
          getCardOwner: (c: CoreCardId) => context.cards.getCardOwner(c),
        },
        draft: state,
        playerId: context.playerId as string,
        sourceCardId: cardId as string,
        zones: {
          getCardZone: (c: CoreCardId) => context.zones.getCardZone(c),
          getCardsInZone: (z: CoreZoneId, p?: CorePlayerId) => context.zones.getCardsInZone(z, p),
        },
      };
      if (!spellEffectHasLegalTargets(spellEffect, resolverCtx)) {
        continue;
      }
      // rule-id: sfd-017-221 (rule 355.8) — lift a sequence's lead target.
      const tgt = spellEffect?.target ?? findSequenceLeadTarget(spellEffect);
      const isCardTarget =
        tgt !== undefined &&
        typeof tgt !== "string" &&
        tgt.type !== "self" &&
        tgt.type !== "player" &&
        tgt.type !== "battlefield" &&
        tgt.quantity !== "all";
      if (isCardTarget) {
        // rule-id: unl-204-219 (rule 355.8) — enumerate every legal
        // candidate, not just the first (resolveTarget defaults count to 1).
        const validTargets = resolveTarget(
          { ...tgt, quantity: "all" } as Parameters<typeof resolveTarget>[0],
          resolverCtx,
        );
        for (const targetId of validTargets) {
          results.push({
            cardId: cardId as string,
            playerId: context.playerId as string,
            targets: [targetId as string],
            viaFlow: true,
          });
        }
      } else {
        results.push({
          cardId: cardId as string,
          playerId: context.playerId as string,
          viaFlow: true,
        });
      }
    }
    return results;
  },
  reducer: (draft, context) => {
    const { cardId, playerId, targets, xAmount, repeatCount, viaFlow, paidAdditionalCost } =
      context.params;
    const { zones } = context;

    // rule-id: ven-083-166 / rule 560 — re-derive the optional additional
    // cost from the card definition (never trust client-supplied specs) and
    // record whether it was actually paid so the spell's
    // `paid-additional-cost` conditional can read it at resolution.
    let spellAdditionalCost: CostExtras["additionalCost"];
    if (paidAdditionalCost) {
      const optional = getOptionalPlayCost(cardId);
      if (optional?.kind === "pay") {
        spellAdditionalCost = optional.cost ?? {};
      }
    }
    if (!draft.additionalCostsPaid) {
      draft.additionalCostsPaid = {};
    }
    draft.additionalCostsPaid[cardId] = spellAdditionalCost !== undefined;

    const repeatN = Math.max(0, repeatCount ?? 0);
    deductCost(
      draft,
      playerId,
      cardId,
      {
        additionalCost: spellAdditionalCost,
        // rule-id: ven-055-166 — friendly "your spells cost less" statics.
        board: { cards: context.cards, zones: context.zones },
        repeatCount: repeatN,
        targets,
        viaFlow: viaFlow === true,
        xAmount,
      },
      createMetaAccessor(context.cards),
    );

    // Look up spell effect from card definition
    const registry = getGlobalCardRegistry();
    const abilities = registry.getAbilities(cardId) ?? [];
    const spellAbility = abilities.find((a) => a.type === "spell");
    const spellEffect = spellAbility?.effect;

    // For X-cost spells, wrap the effect so the chosen X value travels
    // With it through the chain. The effect executor reads `variables.x`
    // When resolving `{ variable: "x" }` amount expressions.
    // For Repeat spells, we wrap the effect in a `sequence` that
    // Repeats the original effect (1 + repeatCount) times. This
    // Executes during chain resolution exactly once per repeat.
    const xValue = Math.max(0, xAmount ?? 0);
    let effectToStore: unknown = spellEffect;
    if (spellEffect && repeatN > 0) {
      const repeatedEffects = Array.from({ length: 1 + repeatN }, () => spellEffect);
      effectToStore = {
        effects: repeatedEffects,
        type: "sequence",
      };
    }
    if (xValue > 0 && effectToStore) {
      effectToStore = {
        ...(effectToStore as Record<string, unknown>),
        _variables: { x: xValue },
      };
    }

    // Add spell to the chain (rule 537)
    const interaction = draft.interaction ?? createInteractionState();
    const turnOrder = Object.keys(draft.players);
    draft.interaction = addToChain(
      interaction,
      {
        cardId,
        controller: playerId,
        effect: effectToStore,
        // rule-id: ven-049-166 — a spell played via [Flow] from the trash is
        // banished instead of returning to the trash.
        resolveTo: viaFlow ? "banishment" : "trash",
        targets,
        type: "spell",
      },
      turnOrder,
    );

    // Rule 419.4.a: play-spell / play-card triggers fire when the spell
    // RESOLVES (not here) — see executeResolvedItem in chain-moves.ts.
    // Firing here would trigger e.g. Abandoned Hall even on countered
    // spells (425.1.b).

    // Rule 724 (Legion) tracker: count this spell play so subsequent
    // Cards can satisfy their Legion conditions.
    if (draft.cardsPlayedThisTurn) {
      draft.cardsPlayedThisTurn[playerId] = (draft.cardsPlayedThisTurn[playerId] ?? 0) + 1;
    }

    // rule-id: unl-007-219 — the spell card physically sits on the chain
    // while pending; chain-moves places it in `resolveTo` when it leaves
    // the chain (resolved or countered), not at play time.
    zones.moveCard({
      cardId: cardId as CoreCardId,
      targetZoneId: "chain" as CoreZoneId,
    });
  },
};
