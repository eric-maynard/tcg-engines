/**
 * Contesting a battlefield on arrival (shared by Standard Move and by playing
 * a unit straight to a battlefield, e.g. "You may play me to an open
 * battlefield").
 */

import type { CardId as CoreCardId, ZoneId as CoreZoneId } from "@tcg/core";
import { createInteractionState, startShowdown as startShowdownState } from "../../../chain";
import type { RiftboundCardMeta, RiftboundGameState } from "../../../types";
import { fireTriggers } from "../../../abilities/trigger-runner";
import { isAloneAtLocation } from "./helpers";

type TriggerCtx = Parameters<typeof fireTriggers>[1];

/**
 * rule 190.3.a.1 / 450: a unit arriving at a battlefield its controller does
 * not control makes that battlefield Contested — whether it arrived by a
 * Standard Move or by being played there directly (355.2.b).
 * rule 323.11.a / 323.13: the following cleanup stages the showdown, so open
 * it here; with no opposing units it is a non-combat showdown that, once all
 * players pass, hands control (and the conquer point) to the sole occupant
 * (469.1, 466.5).
 */
export function contestBattlefieldOnArrival(args: {
  arrivingUnitIds: string[];
  /** rule 344.2 — true when a Cleanup begins this showdown, not a player's step. */
  autoBegun?: boolean;
  battlefieldId: string;
  cards: TriggerCtx["cards"];
  counters: TriggerCtx["counters"];
  draft: RiftboundGameState;
  playerId: string;
  zones: TriggerCtx["zones"];
}): void {
  const { arrivingUnitIds, autoBegun, battlefieldId, cards, counters, draft, playerId, zones } = args;
  const bf = draft.battlefields?.[battlefieldId];
  if (!bf || bf.controller === playerId) {
    return;
  }

  const bfZoneId = `battlefield-${battlefieldId}` as CoreZoneId;
  const allUnits = zones.getCardsInZone(bfZoneId) as unknown as string[];
  const ownerOf = (id: string) =>
    (cards.getCardController?.(id as CoreCardId) ??
      cards.getCardOwner(id as CoreCardId)) as string | undefined;
  const hasOpponentUnit = allUnits.some((cardId) => {
    const owner = ownerOf(cardId);
    return owner !== undefined && owner !== playerId;
  });

  if (!bf.contested) {
    bf.contested = true;
    bf.contestedBy = playerId;
    bf.showdownComplete = false;
  }

  const playerIds = Object.keys(draft.players);
  const defender = bf.controller ?? playerIds.find((p) => p !== playerId) ?? playerId;
  const interaction = draft.interaction ?? createInteractionState();
  const started = startShowdownState(
    interaction,
    battlefieldId,
    playerId,
    hasOpponentUnit ? [...new Set([playerId, defender])] : playerIds,
    hasOpponentUnit,
    playerId,
    defender,
  );
  draft.interaction = autoBegun
    ? {
        ...started,
        showdownStack: started.showdownStack.map((sd, i) =>
          i === started.showdownStack.length - 1 ? { ...sd, autoBegun: true } : sd,
        ),
      }
    : started;

  const triggerCtx = { cards, counters, draft, zones } as TriggerCtx;
  // rule 340 / 548.2: "When a showdown begins here" fires for combat and
  // non-combat showdowns alike.
  fireTriggers(
    { battlefieldId, isCombat: hasOpponentUnit, playerId, type: "showdown-begin" },
    triggerCtx,
  );

  if (!hasOpponentUnit) {
    return;
  }

  // rule 625.1.c.1 / 625.1.c.2: opening a combat showdown assigns roles and
  // fires "attack" / "defend".
  for (const unitId of arrivingUnitIds) {
    cards.updateCardMeta?.(
      unitId as CoreCardId,
      { combatRole: "attacker" } as Partial<RiftboundCardMeta>,
    );
    fireTriggers(
      {
        alone: isAloneAtLocation(unitId, playerId, allUnits, ownerOf),
        battlefieldId,
        cardId: unitId,
        owner: playerId,
        type: "attack",
      },
      triggerCtx,
    );
  }
  for (const cardId of allUnits) {
    const owner = ownerOf(cardId);
    if (owner === undefined || owner === playerId) {
      continue;
    }
    cards.updateCardMeta?.(
      cardId as CoreCardId,
      { combatRole: "defender" } as Partial<RiftboundCardMeta>,
    );
    fireTriggers(
      {
        alone: isAloneAtLocation(cardId, owner, allUnits, ownerOf),
        battlefieldId,
        cardId,
        owner,
        type: "defend",
      },
      triggerCtx,
    );
  }
}
