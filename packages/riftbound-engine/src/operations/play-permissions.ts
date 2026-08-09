/**
 * Play permissions (rules 366.1 / 419.1.a) — WHO may play WHICH card from a
 * zone other than their hand / Champion Zone, and for what cost.
 *
 * `draft.playPermissions[]` holds the runtime grants effects write ("you may
 * play it from your banishment this turn"); the standing ones printed on cards
 * are derived on the fly: a friendly permanent's "You may play cards from your
 * trash" (ven-022-166 Endless Riches) and a trash card's own "[Legion] — you
 * may play me from your trash for [3][fury]" (unl-025-219 Undying Legion).
 * `collectPlayPermissions` is the ONE reader; the `playFromZone` move
 * (`moves/play/play-from-zone.ts`) enumerates the plays it allows and performs
 * them through the play pipeline (`via: "permission"`).
 */

import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import type { RiftboundGameState } from "../types";
import { hasPlayFromTrashGrant } from "../game-definition/moves/play/cost";
import { getSelfTrashPlayCost } from "../game-definition/moves/play/self-trash-play";
import { getGlobalCardRegistry } from "./card-lookup";

export interface PlayPermission {
  readonly id: string;
  /** The player who may make the play. */
  readonly playerId: string;
  /** The zone the card is played from (`trash`, `banishment`, …). */
  readonly zone: string;
  /** A specific card … */
  readonly cardId?: string;
  /** … or every card of `playerId`'s in `zone` matching this (absent filter = any card). */
  readonly filter?: { readonly cardType?: string | readonly string[]; readonly name?: string; readonly tag?: string };
  /** rule 356.1.a — "play it for [cost]": replaces the printed cost. */
  readonly cost?: { readonly energy?: number; readonly power?: readonly string[] };
  /** rule 356.1.b — a waived component instead of a replacement cost. */
  readonly costMode?: "ignore-all" | "ignore-energy";
  readonly sourceCardId?: string;
  /** `turn` grants lapse when the turn they were granted on ends. */
  readonly expires: "turn" | "permanent";
  readonly grantedOnTurn?: number;
  /** Removed once used (a "you may play it" about one card). */
  readonly once?: boolean;
  /** Where the permission comes from; the hand-move family already serves the static trash ones. */
  readonly source: "runtime" | "static-board" | "static-self";
}

type Holder = { playPermissions?: PlayPermission[] };

/** rule 366.1 — an effect grants a permission. */
export function grantPlayPermission(
  draft: RiftboundGameState,
  perm: Omit<PlayPermission, "id" | "source" | "grantedOnTurn"> & { id?: string },
): PlayPermission {
  const holder = draft as unknown as Holder;
  holder.playPermissions ??= [];
  const granted: PlayPermission = {
    ...perm,
    grantedOnTurn: draft.turn?.number,
    id: perm.id ?? `perm-${holder.playPermissions.length + 1}-${perm.cardId ?? perm.zone}`,
    source: "runtime",
  };
  holder.playPermissions.push(granted);
  return granted;
}

/** Drop a used one-shot permission. */
export function consumePlayPermission(draft: RiftboundGameState, id: string): void {
  const holder = draft as unknown as Holder;
  if (!holder.playPermissions) {
    return;
  }
  holder.playPermissions = holder.playPermissions.filter((p) => p.id !== id || p.once !== true);
}

/** Runtime grants still in force for `playerId` (turn grants lapse with their turn). */
export function runtimePlayPermissions(state: RiftboundGameState, playerId?: string): PlayPermission[] {
  const all = (state as unknown as Holder).playPermissions ?? [];
  const turn = state.turn?.number;
  return all.filter(
    (p) =>
      (playerId === undefined || p.playerId === playerId) &&
      (p.expires !== "turn" || p.grantedOnTurn === undefined || p.grantedOnTurn === turn),
  );
}

type ZonesLike = {
  getCardsInZone: (zone: CoreZoneId, player?: CorePlayerId) => readonly CoreCardId[];
  getCardZone?: (cardId: CoreCardId) => string | undefined;
};

/**
 * Every permission `playerId` currently has: runtime grants + the standing
 * ones printed on cards (board-wide trash grant, a trash card's own permission).
 */
export function collectPlayPermissions(
  state: RiftboundGameState,
  playerId: string,
  zones: ZonesLike,
): PlayPermission[] {
  const out: PlayPermission[] = [...runtimePlayPermissions(state, playerId)];
  if (hasPlayFromTrashGrant(state, zones as never, playerId)) {
    out.push({ expires: "permanent", id: "static-trash-grant", playerId, source: "static-board", zone: "trash" });
  }
  for (const raw of zones.getCardsInZone("trash" as CoreZoneId, playerId as CorePlayerId)) {
    const cardId = raw as string;
    const cost = getSelfTrashPlayCost(state, playerId, cardId);
    if (cost) {
      out.push({
        cardId,
        cost,
        expires: "permanent",
        id: `static-self-${cardId}`,
        playerId,
        source: "static-self",
        sourceCardId: cardId,
        zone: "trash",
      });
    }
  }
  return out;
}

/** Does `perm` cover `cardId` (owned by `playerId`) sitting in `zone`? */
export function permissionCovers(perm: PlayPermission, cardId: string, zone: string): boolean {
  if (perm.zone !== zone) {
    return false;
  }
  if (perm.cardId !== undefined) {
    return perm.cardId === cardId;
  }
  const f = perm.filter;
  if (!f) {
    return true;
  }
  const def = getGlobalCardRegistry().get(cardId) as { cardType?: string; name?: string; tags?: readonly string[] } | undefined;
  if (f.cardType !== undefined) {
    const want = Array.isArray(f.cardType) ? f.cardType : [f.cardType];
    const type = def?.cardType === "equipment" ? "gear" : def?.cardType;
    if (!want.includes(type ?? "") && !(def?.cardType === "equipment" && want.includes("equipment"))) {
      return false;
    }
  }
  if (f.name !== undefined && def?.name !== f.name) {
    return false;
  }
  if (f.tag !== undefined && !(def?.tags ?? []).includes(f.tag)) {
    return false;
  }
  return true;
}

/** The permissions (if any) under which `playerId` may play `cardId` from where it is now. */
export function permissionsForCard(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
  zones: ZonesLike,
): PlayPermission[] {
  const zone = zones.getCardZone?.(cardId as CoreCardId);
  if (zone === undefined) {
    return [];
  }
  return collectPlayPermissions(state, playerId, zones).filter((p) => permissionCovers(p, cardId, zone));
}
