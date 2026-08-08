/**
 * The ONE play pipeline (rules 354–359, 419) shared by hand plays and every
 * play-by-effect path.
 *
 *  - {@link enterPlayedPermanent} — the commit step (359.2): the played unit /
 *    gear leaves wherever it was for the board as a NEW object (124.1), enters
 *    exhausted unless Accelerate / an enter-ready effect says otherwise (143.4,
 *    805), is controlled by the player who played it (191.1), fires its play
 *    triggers ONCE with `via` + `from` (419.4.a — "when you play a unit from
 *    your trash", Legion counting), contests a battlefield it arrived at
 *    (190.3.a.1), and offers [Weaponmaster] / [Quick-Draw]. Every path that
 *    puts a played permanent on the board calls it: the `playUnit` / `playGear`
 *    / `playFromChampionZone` / `revealHidden` reducers and every effect play.
 *  - {@link putPlayedSpellOnChain} — the commit step for a spell an effect
 *    plays (354.1): the card goes to the `chain` zone as a spell item.
 *  - {@link beginPlay} — a play an EFFECT instructs (419.3): performer, origin
 *    zone, cost mode (356.1.b), location constraint (355.2 / 462.2.a), optional
 *    additional costs still offered (355.1.a) and mandatory ones still required
 *    (356.1.b), payment through the G4 cost model, then the commit above. Its
 *    dialog is sequenced through `draft.effectPlay` (pure data) so every answer
 *    re-enters {@link continueEffectPlay}.
 *  - {@link playDestinationOptions} — rule 355.2 / 355.4 legal locations for a
 *    permanent a player is putting on the board.
 */

import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState } from "../../../types";
import { fireTriggers } from "../../../abilities/trigger-runner";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";
import { resetObjectState } from "../../../operations/leave-board";
import { noteArrival } from "../../../operations/arrive-at-battlefield";
import { notePlayThisTurn } from "../../../operations/plays-this-turn";
import { battlefieldForbidsUnitPlays } from "../../../abilities/play-restrictions";
import { attachEquipment } from "../../../abilities/effects/_attachment";
import { hasKeyword } from "../movement/helpers";
import {
  cleanupAndFireDeaths,
  type PostMoveCleanupContext,
} from "../../../cleanup/post-move-cleanup";
import { extractBattlefieldId, isBattlefieldZone } from "../../../zones/zone-configs";
import {
  boardEntersReadyGrantApplies,
  consumeEntersReadyReplacement,
  hasStaticEffect,
  staticEnterReadyApplies,
} from "./cost";
import { recordAdditionalCostsPaid } from "./cost-model";
import { applyPlayBattlefieldToken } from "./battlefield-token";
import { offerWeaponmasterEquip } from "./weaponmaster";

/** How the card came to be played (carried on `play-self` / `play-card`). */
export type PlayVia = "hand" | "effect" | "permission" | "hidden" | "flow" | "champion" | "replay";

/** rule 356.1.b — which part of the cost an instructed play still pays. */
export type PlayCostMode =
  | { readonly kind: "full" }
  | { readonly kind: "ignore-all" }
  | { readonly kind: "ignore-energy" }
  | { readonly kind: "ignore-power" }
  | { readonly kind: "reduce"; readonly energy?: number; readonly power?: Readonly<Record<string, number>> };

/**
 * The operation bag every caller can supply (move reducer context, effect
 * context, prompt context). Framework-typed, hence loose.
 */
export interface PlayIO {
  readonly draft: RiftboundGameState;
  // biome-ignore lint/suspicious/noExplicitAny: engine context bags are framework-typed
  readonly cards: any;
  // biome-ignore lint/suspicious/noExplicitAny: engine context bags are framework-typed
  readonly counters: any;
  // biome-ignore lint/suspicious/noExplicitAny: engine context bags are framework-typed
  readonly zones: any;
}

/** True for `base` / `battlefield-<id>` — the board. */
export function isBoardZoneId(zone: string | undefined): boolean {
  return zone === "base" || (typeof zone === "string" && zone.startsWith("battlefield-"));
}

export interface EnterPlayedPermanentSpec {
  readonly cardId: string;
  /** The player who PLAYS the card — its controller once it lands (191.1). */
  readonly playerId: string;
  /** `base` or `battlefield-<id>`. */
  readonly entryZone: string;
  readonly via: PlayVia;
  /** Zone the card is played from; read from the zones when omitted. */
  readonly from?: string;
  /** rule 356.2 — ids of the additional costs this play paid (cost-model ids). */
  readonly paidIds?: readonly string[];
  readonly paidAdditionalCost?: boolean;
  /** rule 805 / 369.3 — Accelerate (or an "if you do, I enter ready" cost) was paid. */
  readonly entersReady?: boolean;
  /** rule 423 (unl-139-219) — "play it … stunned". */
  readonly stun?: boolean;
  /** rule 811.1.d.2 — battlefield the card was facedown at (targets limited to it). */
  readonly fromHiddenAt?: string;
  /**
   * rule 323.13 — whose action made the unit arrive when that is not the
   * player playing it (Bone Skewer: the caster forces the owner's play).
   */
  readonly stagedBy?: string;
  /** Skip the [Weaponmaster] offer (a caller that raises its own prompt first). */
  readonly skipWeaponmaster?: boolean;
}

/**
 * rule 359.2 — the played permanent becomes a Game Object on the board. The
 * single enter path for units and gear, whatever performed the play.
 * Returns the zone the card actually entered.
 */
export function enterPlayedPermanent(io: PlayIO, spec: EnterPlayedPermanentSpec): string {
  const { draft, cards, counters, zones } = io;
  const { cardId, playerId, via } = spec;
  const registry = getGlobalCardRegistry();
  const cardType = registry.getCardType(cardId) ?? "unit";
  const isUnit = cardType === "unit";
  const from =
    spec.from ?? ((zones.getCardZone?.(cardId as CoreCardId) as string | undefined) ?? "hand");
  const trig = { cards, counters, draft, zones } as unknown as Parameters<typeof fireTriggers>[1];

  // rule 135.2.b.3 / 369.3 (unl-147-219) — "as you play me, add the … battlefield
  // token; if you do, I enter there" replaces where the unit enters.
  const entryZone =
    (isUnit ? applyPlayBattlefieldToken({ cardId, draft, playerId, zones }) : undefined) ??
    spec.entryZone;

  // rule 124.1 / 337.2 — played from a public non-board zone (trash, banishment,
  // deck): whatever it tracked in a previous existence on the board is gone.
  if (
    !isBoardZoneId(from) &&
    from !== "hand" &&
    from !== "chain" &&
    from !== "championZone" &&
    !from.startsWith("facedown")
  ) {
    resetObjectState({ cards, counters, draft, zones }, cardId);
    // `banishedFrom` is last-known information of the OLD object (ven-066-166).
    cards.updateCardMeta?.(cardId as CoreCardId, { banishedFrom: undefined } as Partial<RiftboundCardMeta>);
  }

  zones.moveCard({ cardId: cardId as CoreCardId, targetZoneId: entryZone as CoreZoneId });

  // rule 191.1 / 145.2 — the player who plays a card controls it, even when
  // another player owns it (Kharox, Blind Fury); an owner-performed play
  // (Bone Skewer, Temporal Breach) keeps owner = controller.
  const owner = cards.getCardOwner?.(cardId as CoreCardId) as string | undefined;
  if (owner !== undefined && owner !== playerId) {
    cards.setCardController?.(cardId as CoreCardId, playerId as CorePlayerId);
    const metaNow = cards.getCardMeta?.(cardId as CoreCardId) as Partial<RiftboundCardMeta> | undefined;
    cards.updateCardMeta?.(cardId as CoreCardId, {
      controlEffects: [...(metaNow?.controlEffects ?? []), { controllerId: playerId }],
    } as Partial<RiftboundCardMeta>);
  }

  if (isUnit) {
    // rule 143.4 — units enter exhausted unless: a runtime "next unit you play
    // enters ready" replacement (consumed first so its Buff rider lands —
    // unl-052-219), the card's own / a friendly board "enters ready" static
    // (evaluated at the entry zone — ven-091-166, ogn-011-298), or a paid
    // Accelerate / "if you do, I enter ready" cost (805, 369.3).
    const replacedReady = consumeEntersReadyReplacement(draft, playerId, {
      cardId,
      ctx: { cards, counters, zones },
    });
    const entersReady =
      replacedReady ||
      spec.entersReady === true ||
      (typeof zones.getCardsInZone === "function"
        ? boardEntersReadyGrantApplies(draft, zones, cardId, playerId, cards, entryZone)
        : staticEnterReadyApplies(cardId, draft, playerId, undefined, cards, entryZone));
    counters.setFlag?.(cardId as CoreCardId, "exhausted", !entersReady);
    if (spec.stun === true) {
      counters.setFlag?.(cardId as CoreCardId, "stunned", true);
      cards.updateCardMeta?.(cardId as CoreCardId, { stunned: true } as Partial<RiftboundCardMeta>);
    }
  } else if (hasStaticEffect(cardId, "enters-exhausted")) {
    // Gear enters ready (143.4 is units only) unless "This enters exhausted".
    counters.setFlag?.(cardId as CoreCardId, "exhausted", true);
  }

  // rule 356.2 / 356.4.f.1 — record WHICH additional costs this play paid, then
  // fire the play triggers BEFORE counting the play (a Legion trigger on this
  // card must see only the cards played EARLIER this turn — rule 724).
  const paidAdditionalCost = spec.paidAdditionalCost === true;
  recordAdditionalCostsPaid(draft, cardId, paidAdditionalCost ? [...(spec.paidIds ?? [])] : []);
  if (paidAdditionalCost && (spec.paidIds?.length ?? 0) === 0 && draft.additionalCostsPaid) {
    // A paid cost the caller could not name still counts as "the additional cost was paid".
    (draft.additionalCostsPaid as Record<string, boolean | readonly string[]>)[cardId] = true;
  }
  const canFire = typeof zones.getCardsInZone === "function" && cards && counters;
  if (canFire) {
    fireTriggers(
      {
        cardId,
        from,
        paidAdditionalCost,
        playerId,
        type: "play-self",
        via,
        ...(spec.fromHiddenAt ? { fromHiddenAt: spec.fromHiddenAt } : {}),
      } as Parameters<typeof fireTriggers>[0],
      trig,
    );
    fireTriggers(
      { cardId, cardType: isUnit ? "unit" : "gear", from, playerId, type: "play-card", via } as Parameters<
        typeof fireTriggers
      >[0],
      trig,
    );
    if (spec.stun === true) {
      fireTriggers({ cardId, type: "stun" } as Parameters<typeof fireTriggers>[0], trig);
    }
  }
  if (draft.cardsPlayedThisTurn) {
    draft.cardsPlayedThisTurn[playerId] = (draft.cardsPlayedThisTurn[playerId] ?? 0) + 1;
  }
  // rule 356.4 — identity ledger ("the first gear you play each turn …").
  notePlayThisTurn(draft, playerId, cardId);

  // rule 190.3.a.1 / 323.11.a — a unit played to a battlefield its controller
  // does not control contests it exactly as a Move would; the Cleanup begins
  // the staged Showdown (as `autoBegun` when an effect put it there — 344.2).
  if (isUnit && isBattlefieldZone(entryZone) && canFire) {
    const discretionary = via === "hand" || via === "champion" || via === "hidden" || via === "permission";
    noteArrival(
      { cards, counters, draft, zones },
      {
        at: entryZone,
        cause: "play",
        discretionary,
        stagedBy: spec.stagedBy ?? playerId,
        unitIds: [cardId],
      },
    );
    // rule 464.2.c.3.a — a unit a player plays into an ongoing combat at a
    // battlefield they hold gains its designation at the next Cleanup.
    if (discretionary && typeof counters.getCounter === "function") {
      cleanupAndFireDeaths(draft, { cards, counters, zones } as unknown as PostMoveCleanupContext);
    }
  }

  if (!canFire) {
    return entryZone;
  }
  if (isUnit) {
    // rule 821.1.c (ven-041-166 / sfd-127-221) — [Weaponmaster] offers its
    // discounted Equip on every play of the unit, from hand or by effect.
    if (spec.skipWeaponmaster !== true) {
      offerWeaponmasterEquip(draft as never, zones as never, playerId, cardId, cards as never);
    }
  } else if (hasKeyword(cardId, "Quick-Draw", (id) => cards.getCardMeta(id))) {
    // rule 819.1.d (sfd-054-221) — [Quick-Draw]: "When you play it, attach it
    // to a unit you control": forced with one friendly unit, prompted with more.
    const zoneIds = ["base", ...Object.keys(draft.battlefields ?? {}).map((bf) => `battlefield-${bf}`)];
    const units: string[] = [];
    for (const zoneId of zoneIds) {
      for (const id of zones.getCardsInZone(zoneId as CoreZoneId, playerId as CorePlayerId)) {
        if (registry.get(id as string)?.cardType === "unit") {
          units.push(id as string);
        }
      }
    }
    if (units.length === 1) {
      attachEquipment({ cards, counters, draft, playerId, zones } as never, cardId, units[0] as string);
    } else if (units.length > 1 && !draft.pendingChoice) {
      draft.pendingChoice = {
        effect: { holderCandidates: units, type: "attach" },
        options: units,
        playerId,
        remaining: 1,
        sourceCardId: cardId,
        type: "choose-target",
      } as RiftboundGameState["pendingChoice"];
    }
  }
  return entryZone;
}

/**
 * rule 355.2 / 355.4 / 462.2.a — where `playerId` may put a permanent they are
 * playing: their base or a battlefield they control (never one that forbids
 * unit plays — sfd-216-221), plus any location an effect explicitly grants
 * ("you may play it here" — 355.2.b). `only` replaces the list outright (a
 * forced "play it here / to the same location").
 */
export function playDestinationOptions(
  draft: RiftboundGameState,
  playerId: string,
  cardId: string,
  spec?: { readonly only?: readonly string[]; readonly extra?: readonly string[] },
): string[] {
  const isUnit = getGlobalCardRegistry().getCardType(cardId) !== "gear";
  const legal = (zone: string): boolean =>
    !isUnit || !zone.startsWith("battlefield-") || !battlefieldForbidsUnitPlays(extractBattlefieldId(zone) ?? "");
  if (spec?.only) {
    return spec.only.filter(legal);
  }
  // rule 143.1.a.1 — gear is played to base only.
  if (!isUnit) {
    return ["base"];
  }
  const out = [
    "base",
    ...Object.entries(draft.battlefields ?? {})
      .filter(([, bf]) => bf.controller === playerId)
      .map(([bfId]) => `battlefield-${bfId}`),
  ];
  for (const zone of spec?.extra ?? []) {
    if (!out.includes(zone)) {
      out.push(zone);
    }
  }
  return out.filter(legal);
}
