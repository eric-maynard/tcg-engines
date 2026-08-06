/**
 * Pending-choice moves.
 *
 * Handles the "opponent reveals their hand, active player picks a card"
 * flow used by Sabotage, Mindsplitter, and Ashe Focused.
 *
 * A `reveal-hand` effect places a `PendingChoice` on the game state and
 * pauses play. `resolvePendingChoice` is the only legal move while the
 * choice is pending; it validates the pick against the filter, applies
 * the stored effect (recycle / banish / discard), and clears the state.
 */

import type { CardId as CoreCardId, ZoneId as CoreZoneId, GameMoveDefinitions } from "@tcg/core";
import { executeEffect } from "../../abilities/effect-executor";
import type { ExecutableEffect } from "../../abilities/effect-executor";
import { markContestedOnArrival } from "../../abilities/effects/move";
import { fireTriggers } from "../../abilities/trigger-runner";
import { addToChain, createInteractionState } from "../../chain";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type {
  PendingChoice,
  RiftboundCardMeta,
  RiftboundGameState,
  RiftboundMoves,
} from "../../types";
import { buildEffectContext, executeResolvedItem } from "./chain-moves";

/**
 * Returns true when the given card ID is a valid pick for the pending
 * choice (i.e., is in the revealed snapshot and passes the filter).
 */
export function isValidPendingPick(choice: PendingChoice, cardId: string): boolean {
  if (choice.type !== "reveal-and-pick") {
    return false;
  }
  if (!choice.revealed.includes(cardId)) {
    return false;
  }
  const excluded = choice.filter?.excludeCardTypes;
  if (excluded && excluded.length > 0) {
    const def = getGlobalCardRegistry().get(cardId);
    const cardType = def?.cardType;
    if (cardType && excluded.includes(cardType)) {
      return false;
    }
  }
  return true;
}

/**
 * Pick a default (goldfish) card for the choice: the first revealed card
 * that passes the filter. Returns undefined if no valid pick exists.
 */
export function pickDefaultForChoice(choice: PendingChoice): string | number | undefined {
  if (choice.type === "name-card") {
    return choice.options[0];
  }
  if (choice.type === "choose-target" || choice.type === "choose-destination") {
    return choice.options[0];
  }
  if (choice.type === "choose-mode") {
    return choice.options[0];
  }
  if (choice.type === "opt-in") {
    return undefined;
  }
  if (choice.type === "weaponmaster-equip") {
    return undefined;
  }
  return choice.revealed.find((id) => isValidPendingPick(choice, id));
}

/**
 * Returns the target zone a picked card is moved to based on the stored
 * `onPicked` action.
 */
function onPickedTargetZone(
  action: "recycle" | "banish" | "discard" | "draw" | "play",
): CoreZoneId {
  switch (action) {
    case "recycle": {
      return "mainDeck" as CoreZoneId;
    }
    // rule-id: ogn-062-298-look-banish-play — "banish … then play it": the
    // pick goes to banishment first; the play is added to the chain after.
    case "play":
    case "banish": {
      return "banishment" as CoreZoneId;
    }
    case "discard": {
      return "trash" as CoreZoneId;
    }
    case "draw": {
      return "hand" as CoreZoneId;
    }
  }
}

export const pendingChoiceMoves: Partial<
  GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>
> = {
  resolvePendingChoice: {
    condition: (state, context) => {
      const choice = state.pendingChoice;
      if (!choice) {
        return false;
      }
      if (choice.type === "weaponmaster-equip") {
        // rule-id: ven-041-166-weaponmaster-on-play-equip
        if (choice.playerId !== context.params.playerId) {
          return false;
        }
        return (
          context.params.accept === false ||
          choice.options.includes(context.params.pickedCardId as string)
        );
      }
      if (choice.type === "opt-in") {
        // Rule 583 (unl-021-219): controller may accept or decline.
        return (
          choice.playerId === context.params.playerId &&
          typeof context.params.accept === "boolean"
        );
      }
      if (choice.type === "choose-mode") {
        if (choice.playerId !== context.params.playerId) {
          return false;
        }
        return choice.options.includes(context.params.pickedMode as number);
      }
      if (choice.type === "choose-target") {
        if (choice.playerId !== context.params.playerId) {
          return false;
        }
        return choice.options.includes(context.params.pickedCardId as string);
      }
      if (choice.type === "choose-destination") {
        if (choice.playerId !== context.params.playerId) {
          return false;
        }
        return choice.options.includes(context.params.pickedZoneId as string);
      }
      if (choice.prompter !== context.params.playerId) {
        return false;
      }
      if (choice.type === "name-card") {
        // Rule 762: any legal card name is valid; the enumerated `options`
        // are the names known to this game's registry.
        const name = context.params.pickedName;
        return typeof name === "string" && choice.options.includes(name);
      }
      // rule-id: ogn-235-298-vision-optional-recycle
      if (choice.optional && context.params.accept === false) {
        return true;
      }
      return isValidPendingPick(choice, context.params.pickedCardId as string);
    },
    enumerator: (state, context) => {
      const choice = state.pendingChoice;
      if (!choice) {
        return [];
      }
      if (choice.type === "weaponmaster-equip") {
        if (choice.playerId !== (context.playerId as string)) {
          return [];
        }
        return [
          ...choice.options.map((eq) => ({
            pickedCardId: eq,
            playerId: context.playerId as string,
          })),
          { accept: false, playerId: context.playerId as string },
        ];
      }
      if (choice.type === "opt-in") {
        if (choice.playerId !== (context.playerId as string)) {
          return [];
        }
        return [
          { accept: true, playerId: context.playerId as string },
          { accept: false, playerId: context.playerId as string },
        ];
      }
      if (choice.type === "choose-mode") {
        if (choice.playerId !== (context.playerId as string)) {
          return [];
        }
        return choice.options.map((idx) => ({
          pickedMode: idx,
          playerId: context.playerId as string,
        }));
      }
      if (choice.type === "choose-target") {
        if (choice.playerId !== (context.playerId as string)) {
          return [];
        }
        return choice.options.map((cardId) => ({
          pickedCardId: cardId,
          playerId: context.playerId as string,
        }));
      }
      if (choice.type === "choose-destination") {
        if (choice.playerId !== (context.playerId as string)) {
          return [];
        }
        return choice.options.map((zoneId) => ({
          pickedZoneId: zoneId,
          playerId: context.playerId as string,
        }));
      }
      if (choice.prompter !== (context.playerId as string)) {
        return [];
      }
      if (choice.type === "name-card") {
        return choice.options.map((name) => ({
          pickedName: name,
          playerId: context.playerId as string,
        }));
      }
      const results: { playerId: string; pickedCardId?: string; accept?: boolean }[] = [];
      for (const cardId of choice.revealed) {
        if (isValidPendingPick(choice, cardId)) {
          results.push({
            pickedCardId: cardId,
            playerId: context.playerId as string,
          });
        }
      }
      // rule-id: ogn-235-298-vision-optional-recycle — "You may recycle it"
      // must offer a decline path that leaves the card on top.
      if (choice.optional) {
        results.push({ accept: false, playerId: context.playerId as string });
      }
      return results;
    },
    reducer: (draft, context) => {
      const choice = draft.pendingChoice;
      if (!choice) {
        return;
      }

      if (choice.type === "weaponmaster-equip") {
        // rule-id: ven-041-166-weaponmaster-on-play-equip
        // "You may Equip one of your Equipment to me … even if it's already
        // attached." Decline (`accept:false`) clears the prompt; a pick
        // detaches from any prior holder and re-attaches to the Weaponmaster.
        draft.pendingChoice = undefined;
        const picked = context.params.pickedCardId as string | undefined;
        if (context.params.accept === false || !picked || !choice.options.includes(picked)) {
          return;
        }
        const registry = getGlobalCardRegistry();
        const priorMeta = context.cards.getCardMeta(picked as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        const priorHolder = priorMeta?.attachedTo;
        if (priorHolder && priorHolder !== choice.unitId) {
          const holderMeta = context.cards.getCardMeta(priorHolder as CoreCardId) as
            | Partial<RiftboundCardMeta>
            | undefined;
          context.cards.updateCardMeta(priorHolder as CoreCardId, {
            equippedWith: (holderMeta?.equippedWith ?? []).filter((id) => id !== picked),
          } as Partial<RiftboundCardMeta>);
        }
        const equipDef = registry.get(picked);
        const newEquipMeta: Partial<RiftboundCardMeta> = { attachedTo: choice.unitId };
        if (equipDef?.copyAttachedUnitText) {
          newEquipMeta.copiedFromCardId = choice.unitId;
        }
        context.cards.updateCardMeta(picked as CoreCardId, newEquipMeta);
        const unitMeta = context.cards.getCardMeta(choice.unitId as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        const already = unitMeta?.equippedWith ?? [];
        if (!already.includes(picked)) {
          context.cards.updateCardMeta(choice.unitId as CoreCardId, {
            equippedWith: [...already, picked],
          } as Partial<RiftboundCardMeta>);
        }
        fireTriggers(
          {
            cardId: choice.unitId,
            equipmentId: picked,
            playerId: choice.playerId,
            type: "attach-equipment",
          },
          { cards: context.cards, counters: context.counters, draft, zones: context.zones },
        );
        return;
      }

      if (choice.type === "opt-in") {
        // Rule 583 (unl-021-219): on accept, resume executeResolvedItem with
        // the optional flag cleared so target selection etc. proceeds normally;
        // on decline the trigger fizzles.
        draft.pendingChoice = undefined;
        if (context.params.accept === true) {
          executeResolvedItem(
            choice.resolved as Parameters<typeof executeResolvedItem>[0],
            draft,
            context,
          );
        }
        return;
      }

      if (choice.type === "choose-mode") {
        // Rule 355.8 (unl-182-219): execute the picked modal option; when
        // `notChosenThisTurn` is set, record the index on the source card's
        // meta so subsequent Repeat casts exclude it.
        const idx = context.params.pickedMode as number;
        if (!choice.options.includes(idx)) {
          return;
        }
        const modalOptions =
          (choice.effect as { options?: { effect: unknown }[] } | undefined)?.options ?? [];
        const picked = modalOptions[idx]?.effect;
        draft.pendingChoice = undefined;
        if (choice.notChosenThisTurn) {
          const prior =
            (
              context.cards.getCardMeta(choice.sourceCardId as CoreCardId) as
                | Partial<RiftboundCardMeta>
                | undefined
            )?.modesChosenThisTurn ?? [];
          context.cards.updateCardMeta(choice.sourceCardId as CoreCardId, {
            modesChosenThisTurn: [...prior, idx],
          } as Partial<RiftboundCardMeta>);
        }
        if (picked) {
          const effectCtx = buildEffectContext(
            draft,
            choice.playerId,
            choice.sourceCardId,
            context,
          );
          executeEffect(picked as ExecutableEffect, effectCtx);
        }
        return;
      }

      if (choice.type === "choose-target") {
        const picked = context.params.pickedCardId as string;
        if (!choice.options.includes(picked)) {
          return;
        }
        // Rule 355.14.h (unl-192-219): a choose-target carrying boundTargets is
        // a split-target DROP prompt — remove the picked id and re-execute so
        // the split handler re-evaluates might vs remaining-target count.
        // Rule 355.14.e/f/g: with `assign` set it is instead a resolution-time
        // damage-distribution pick — APPEND the picked id (one occurrence per
        // surplus point) so the split handler credits it +1.
        const boundTargets = choice.assign
          ? [...(choice.boundTargets ?? []), picked]
          : choice.boundTargets
            ? choice.boundTargets.filter((id) => id !== picked)
            : [picked];
        draft.pendingChoice = undefined;
        const effectCtx = {
          ...buildEffectContext(draft, choice.playerId, choice.sourceCardId, context),
          boundTargets,
        };
        executeEffect(choice.effect as ExecutableEffect, effectCtx);
        return;
      }

      if (choice.type === "choose-destination") {
        const zoneId = context.params.pickedZoneId as string;
        if (!choice.options.includes(zoneId)) {
          return;
        }
        // rule-id: unl-204-219-owner-chooses-top-or-bottom — owner-choice
        // recycle surfaces mainDeck-top / mainDeck-bottom as destinations.
        if (zoneId === "mainDeck-top" || zoneId === "mainDeck-bottom") {
          context.counters.clearAllCounters(choice.cardId as CoreCardId);
          context.zones.moveCard({
            cardId: choice.cardId as CoreCardId,
            position: zoneId === "mainDeck-top" ? "top" : "bottom",
            targetZoneId: "mainDeck" as CoreZoneId,
          });
          draft.pendingChoice = undefined;
          return;
        }
        // Rule 323.6 / 355.2 / 355.4 (rule-id: unl-184-219-choose-destination-zone-id,
        // sfd-200-221-choose-destination-battlefield):
        // the move/to:"choose" executor already emits ZONE ids (base /
        // battlefield-<bfId>); only prefix a bare battlefield id so we never
        // produce battlefield-battlefield-<bfId>.
        const targetZoneId =
          zoneId === "base" || zoneId.startsWith("battlefield-")
            ? zoneId
            : `battlefield-${zoneId}`;
        context.zones.moveCard({
          cardId: choice.cardId as CoreCardId,
          targetZoneId: targetZoneId as CoreZoneId,
        });
        // rule-id: unl-144-219 — Rule 450: arriving at a non-controlled
        // battlefield applies Contested so combat is staged.
        markContestedOnArrival(draft, targetZoneId, choice.playerId);
        draft.pendingChoice = undefined;
        return;
      }

      if (choice.type === "name-card") {
        // Rule 762 / 383.2.b: record the chosen name on the source card so
        // linked abilities ("cards with that name") can read it.
        const name = context.params.pickedName;
        if (typeof name !== "string" || !choice.options.includes(name)) {
          return;
        }
        context.cards.updateCardMeta(choice.sourceCardId as CoreCardId, {
          namedCard: name,
        } as Partial<RiftboundCardMeta>);
        draft.pendingChoice = undefined;
        return;
      }

      // rule-id: ogn-235-298-vision-optional-recycle — declining leaves the
      // revealed card(s) where they are (on top of the deck for Vision).
      if (choice.optional && context.params.accept === false) {
        // rule-id: ogn-062-298-look-decline-recycle — a declined look that
        // says "Recycle the remaining cards" still recycles every revealed
        // card; only Vision-like looks (no onRest) leave them on top.
        if (choice.onRest === "recycle") {
          for (const restId of choice.revealed) {
            context.zones.moveCard({
              cardId: restId as CoreCardId,
              position: "bottom",
              targetZoneId: "mainDeck" as CoreZoneId,
            });
          }
        }
        draft.pendingChoice = undefined;
        return;
      }

      const { pickedCardId } = context.params;

      if (!isValidPendingPick(choice, pickedCardId as string)) {
        return;
      }

      const targetZoneId = onPickedTargetZone(choice.onPicked);
      const moveParams: {
        cardId: CoreCardId;
        targetZoneId: CoreZoneId;
        position?: "top" | "bottom";
      } = {
        cardId: pickedCardId as CoreCardId,
        targetZoneId,
      };
      // Recycle → bottom of main deck (rule: recycle places at bottom).
      if (choice.onPicked === "recycle") {
        moveParams.position = "bottom";
      }
      context.counters.clearAllCounters(pickedCardId as CoreCardId);
      context.zones.moveCard(moveParams);

      // Rule ogn-006-298: emit the discard event so "When you discard me…"
      // self-triggers (Flame Chompers) can fire. Guarded so unit-test stubs
      // that omit the full zone bag don't crash.
      if (choice.onPicked === "discard" && typeof context.zones.getCardsInZone === "function") {
        fireTriggers(
          { cardId: pickedCardId as string, playerId: choice.revealer, type: "discard" },
          { cards: context.cards, counters: context.counters, draft, zones: context.zones },
        );
      }

      // rule-id: ogn-062-298-look-banish-play — "banish a unit from among
      // them, then play it, reducing its cost by [N]": pay the discounted
      // cost from the prompter's pool and add the play to the chain (rule
      // 354.2/354.3) so its owner chooses a location when it finalizes.
      if (choice.onPicked === "play") {
        const pool = draft.runePools[choice.prompter];
        if (pool) {
          const cost = getGlobalCardRegistry().getCostToDeduct(pickedCardId as string);
          const energy = Math.max(0, cost.energy - (choice.playEnergyReduction ?? 0));
          pool.energy = Math.max(0, pool.energy - energy);
          for (const [domain, amount] of Object.entries(cost.power)) {
            const key = domain as keyof typeof pool.power;
            pool.power[key] = Math.max(0, (pool.power[key] ?? 0) - (amount ?? 0));
          }
        }
        draft.interaction = addToChain(
          draft.interaction ?? createInteractionState(),
          {
            cardId: pickedCardId as string,
            controller: choice.prompter,
            effect: { target: pickedCardId as string, to: "choose", type: "move" },
            triggered: true,
            type: "ability",
          },
          Object.keys(draft.players),
        );
      }

      // Rule 435 (ogn-174-298): look/Vision recycles the unpicked cards.
      if (choice.onRest === "recycle") {
        for (const restId of choice.revealed) {
          if (restId === pickedCardId) continue;
          context.zones.moveCard({
            cardId: restId as CoreCardId,
            position: "bottom",
            targetZoneId: "mainDeck" as CoreZoneId,
          });
        }
      }

      // Clear the pending choice so play can resume.
      draft.pendingChoice = undefined;

      // Resume the originating effect's `then` clause (e.g. discard 1 → draw 1).
      if (choice.then) {
        const effectCtx = buildEffectContext(
          draft,
          choice.prompter,
          choice.sourceCardId ?? "",
          context,
        );
        executeEffect(choice.then as ExecutableEffect, effectCtx);
      }
    },
  },
};
