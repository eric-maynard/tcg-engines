/**
 * playFromZone move — a Discretionary play made under a PLAY PERMISSION
 * (rules 366.1 / 419.1.a / 419.2): "you may play it from your banishment this
 * turn", "you may play cards from your trash", "[Legion] — you may play me from
 * your trash for [3][fury]". The enumerator OFFERS one variant per permitted
 * card (`operations/play-permissions.ts collectPlayPermissions`); the play
 * itself runs through the ONE play pipeline (`play-pipeline.ts beginPlay`, via
 * "permission"): location prompt (355.2), optional / mandatory additional costs,
 * payment of the printed cost or the permission's alternative cost (356.1.a),
 * enter / spell-on-chain.
 *
 * The hand-move family (`playUnit` / `playSpell` / `playGear`) already serves the
 * STANDING trash permissions with full location / cost-variant enumeration, so
 * this move offers the runtime grants and every non-trash zone; a permission
 * play a static already makes legal there is left to those moves.
 */

import type { CardId as CoreCardId, GameMoveDefinitions } from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import { createInteractionState, getTurnState, isLegalTiming } from "../../../chain";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";
import {
  collectPlayPermissions,
  consumePlayPermission,
  type PlayPermission,
  permissionCovers,
} from "../../../operations/play-permissions";
import { selfPlayIsForbidden } from "../../../abilities/play-restrictions";
import { beginPlay, canPerformEffectPlay, type EffectPlaySpec } from "./play-pipeline";
import { reactionWindowOpen } from "./reaction-window";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/** Permissions this move serves (see module doc). */
function servedHere(perm: PlayPermission): boolean {
  return perm.source === "runtime" || perm.zone !== "trash";
}

/** rule 419.3.b — the play bundle a permission play stands for. */
function specFor(perm: PlayPermission, cardId: string, playerId: string): EffectPlaySpec {
  return {
    cardId,
    costMode: perm.cost
      ? { energy: perm.cost.energy ?? 0, kind: "fixed", power: [...(perm.cost.power ?? [])] }
      : perm.costMode === "ignore-all"
        ? { kind: "ignore-all" }
        : perm.costMode === "ignore-energy"
          ? { kind: "ignore-energy" }
          : { kind: "full" },
    location: "prompt",
    playerId,
    via: "permission",
    ...(perm.sourceCardId !== undefined ? { sourceCardId: perm.sourceCardId } : {}),
  };
}

/**
 * rule 419.2 / 358.4 — a permission changes WHERE the card may be played from,
 * not WHEN: a permanent still needs its player's Neutral Open main phase (or a
 * [Reaction] window), a spell its own timing class.
 */
function timingAllows(state: RiftboundGameState, playerId: string, cardId: string): boolean {
  const registry = getGlobalCardRegistry();
  const interaction = state.interaction ?? createInteractionState();
  const turnState = getTurnState(interaction);
  const type = registry.getCardType(cardId);
  if (type === "spell") {
    const timing = registry.getSpellTiming(cardId) ?? "standard";
    if (!isLegalTiming(timing, turnState)) {
      return false;
    }
    return turnState === "neutral-open" ? state.turn.activePlayer === playerId : reactionWindowOpen(state, playerId);
  }
  const standard =
    state.turn.activePlayer === playerId && state.turn.phase === "main" && turnState === "neutral-open";
  if (standard) {
    return true;
  }
  const hasReaction = registry.getSpellTiming(cardId) === "reaction" || registry.hasKeyword(cardId, "Reaction");
  return hasReaction && reactionWindowOpen(state, playerId);
}

/** Every (card, permission) pair `playerId` could play right now through this move. */
function permittedPlays(
  state: RiftboundGameState,
  // biome-ignore lint/suspicious/noExplicitAny: engine move context is framework-typed
  context: any,
  playerId: string,
): { cardId: string; perm: PlayPermission }[] {
  const zones = context.zones;
  const perms = collectPlayPermissions(state, playerId, zones).filter(servedHere);
  if (perms.length === 0) {
    return [];
  }
  const io = { cards: context.cards, counters: context.counters, draft: state, zones };
  const out: { cardId: string; perm: PlayPermission }[] = [];
  const seen = new Set<string>();
  for (const perm of perms) {
    const candidates =
      perm.cardId !== undefined
        ? [perm.cardId]
        : (zones.getCardsInZone(perm.zone, playerId) as readonly string[]).map((id) => id as string);
    for (const cardId of candidates) {
      if (seen.has(cardId)) {
        continue;
      }
      const zone = zones.getCardZone(cardId as CoreCardId) as string | undefined;
      if (zone === undefined || !permissionCovers(perm, cardId, zone)) {
        continue;
      }
      // rule 103 — your permission, your card.
      if ((context.cards.getCardOwner(cardId as CoreCardId) as string | undefined) !== playerId) {
        continue;
      }
      if (selfPlayIsForbidden(state, playerId, cardId) || !timingAllows(state, playerId, cardId)) {
        continue;
      }
      if (!canPerformEffectPlay(io as never, specFor(perm, cardId, playerId))) {
        continue;
      }
      seen.add(cardId);
      out.push({ cardId, perm });
    }
  }
  return out;
}

export const playFromZone: Defs["playFromZone"] = {
  condition: (state, context) => {
    if (state.status !== "playing" || state.pendingChoice) {
      return false;
    }
    const playerId = context.params.playerId as string;
    if (state.cannotPlayCardsThisTurn?.[playerId]) {
      return false;
    }
    const cardId = context.params.cardId as string;
    return permittedPlays(state, context, playerId).some(
      (p) => p.cardId === cardId && (context.params.permissionId === undefined || p.perm.id === context.params.permissionId),
    );
  },
  enumerator: (state, context) => {
    if (state.status !== "playing" || state.pendingChoice) {
      return [];
    }
    const playerId = context.playerId as string;
    if (state.cannotPlayCardsThisTurn?.[playerId]) {
      return [];
    }
    return permittedPlays(state, context, playerId).map(({ cardId, perm }) => ({
      cardId,
      permissionId: perm.id,
      playerId,
    }));
  },
  reducer: (draft, context) => {
    const playerId = context.params.playerId as string;
    const cardId = context.params.cardId as string;
    const match = permittedPlays(draft, context, playerId).find(
      (p) => p.cardId === cardId && (context.params.permissionId === undefined || p.perm.id === context.params.permissionId),
    );
    if (!match) {
      return;
    }
    // rule 419.1 / 354 — the play itself: pending item, this player's location /
    // additional-cost dialog, payment, enter (a Discretionary play, so at once).
    beginPlay(
      { cards: context.cards, counters: context.counters, draft, zones: context.zones },
      specFor(match.perm, cardId, playerId),
      { immediate: true },
    );
    consumePlayPermission(draft, match.perm.id);
  },
};
