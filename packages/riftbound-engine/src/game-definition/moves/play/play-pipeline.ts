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
import { resolveTarget } from "../../../abilities/target-resolver";
import { orderBatchTriggersByTurnOrder, resetObjectState } from "../../../operations/leave-board";
import { noteArrival } from "../../../operations/arrive-at-battlefield";
import { controlsBattlefield } from "../../../operations/battlefield-control";
import { notePlayThisTurn } from "../../../operations/plays-this-turn";
import { battlefieldForbidsUnitPlays } from "../../../abilities/play-restrictions";
import { attachEquipment } from "../../../abilities/effects/_attachment";
import { hasKeyword } from "../movement/helpers";
import { collectSequenceTargetSlots, pairEffectRoles } from "./targeting";
import {
  cleanupAndFireDeaths,
  type PostMoveCleanupContext,
} from "../../../cleanup/post-move-cleanup";
import {
  extractBattlefieldId,
  isBattlefieldZone,
} from "../../../zones/zone-configs";
import {
  addToChain,
  createInteractionState,
  getActiveShowdown,
  removeChainItem,
} from "../../../chain";
import { executeEffect } from "../../../abilities/effect-executor";
import { buildEffectContext } from "../chain/effect-context";
import { executeResolvedItem } from "../chain/resolve";
import {
  type CostExtras,
  battlefieldHasEnemyUnits,
  battlefieldIsAttackedBy,
  battlefieldIsOccupiedEnemy,
  battlefieldIsOpen,
  battlefieldMatchesOccupiedPermission,
  battlefieldRedirectPowerFor,
  boardEntersReadyGrantApplies,
  canPayResourceCost,
  canPlayToAttackedBattlefield,
  canPlayToEnemyOccupiedBattlefield,
  canPlayToOccupiedEnemyBattlefield,
  canPlayToOpenBattlefield,
  computePlayResourceCost,
  consumeEntersReadyReplacement,
  createMetaAccessor,
  getEffectiveSpellRepeatCost,
  getOccupiedBattlefieldPermission,
  getOptionalPlayCost,
  getSacrificeCostDiscount,
  hasStaticEffect,
  opponentsRestrictedToBase,
  payResourceCost,
  playOnlyToConqueredBattlefield,
  staticEnterReadyApplies,
} from "./cost";
import { ADDITIONAL_COST_IDS, recordAdditionalCostsPaid } from "./cost-model";
import {
  type UnitPlayOption,
  type UnitPlayOrigin,
  computeUnitPlayOptions,
  payUnitPlayCosts,
} from "./play-options";
import { spellEffectHasLegalTargets } from "./targeting";
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
  // rule 383.3.d — `play-self`, `play-card` and the stun event are separate
  // publications of ONE play, so every trigger they raise triggered
  // SIMULTANEOUSLY and their controller may still order them (Evelynn's own
  // play trigger vs. Star Spring's "when a player plays a unit here").
  const chainLenBeforePlayTriggers = draft.interaction?.chain?.items.length ?? 0;
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
    // rule 383.3.d.1 — `play-self` and `play-card` publish ONE play, so their
    // triggers are simultaneous: the turn player appends first, everyone else in
    // turn order, regardless of which publication raised them (also collapses
    // the per-event batch stamps).
    orderBatchTriggersByTurnOrder(draft, chainLenBeforePlayTriggers);
    // The from-Hidden publication of the SAME play happens after this call
    // returns (`hide.ts`), so hand it the batch these triggers share.
    (draft as { lastPlayTriggerBatch?: string }).lastPlayTriggerBatch =
      draft.interaction?.chain?.items[chainLenBeforePlayTriggers]?.triggerBatch;
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

  // rule 361 / 142.4.c / 320–323 (unl-118-219 Elder Dragon) — a permanent whose
  // passive REDEFINES LETHAL DAMAGE ("any amount of your damage is enough to
  // kill enemy units") applies the instant it is on the board, so the state
  // check has to run here: the units it has just made lethally damaged die
  // before the play trigger picks its targets and before anyone gets priority.
  // Every other arrival is already covered by the cleanup the surrounding move
  // / chain resolution runs.
  const redefinesLethal = (registry.getAbilities(cardId) ?? []).some((a) => {
    const ability = a as { type?: string; effect?: { type?: string } };
    return ability.type === "static" && ability.effect?.type === "lethal-damage-modifier";
  });
  if (redefinesLethal && canFire && typeof counters.getCounter === "function") {
    cleanupAndFireDeaths(draft, { cards, counters, zones } as unknown as PostMoveCleanupContext);
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
    // rule 108.2 / 718.5.e — "a unit you CONTROL": a unit this player controls
    // but another player owns is a legal wearer; one they own but do not
    // control is not. Scan every player's board zones, filter by CONTROLLER.
    const controllerOfUnit = (id: string) =>
      (cards.getCardController?.(id as CoreCardId) ?? cards.getCardOwner(id as CoreCardId)) as
        | string
        | undefined;
    const units: string[] = [];
    for (const pid of Object.keys(draft.players ?? {})) {
      for (const zoneId of zoneIds) {
        for (const id of zones.getCardsInZone(zoneId as CoreZoneId, pid as CorePlayerId)) {
          if (
            registry.get(id as string)?.cardType === "unit" &&
            controllerOfUnit(id as string) === playerId
          ) {
            units.push(id as string);
          }
        }
      }
    }
    // rule 819.1.d / 383.4.a.2 — the attach is a TRIGGERED ability, not part of
    // the gear's own resolution: the Gear itself resolves at once (337.2) and
    // the attach goes on the Chain as a Pending item above whatever is already
    // there. Its unit is chosen at finalization (337.1 / 355.5), then both
    // players may respond to it before it resolves (337.4) — rule 818.2 /
    // 819.1.d attach-equipment triggers still fire, from the `attach` handler.
    if (units.length > 0) {
      draft.interaction = addToChain(
        draft.interaction ?? createInteractionState(),
        {
          cardId,
          controller: playerId,
          effect: {
            holderCandidates: units,
            target: { filter: { idIn: units }, quantity: 1, type: "permanent" },
            type: "attach",
          } as never,
          status: "pending",
          triggered: true,
          type: "ability",
        },
        Object.keys(draft.players ?? {}),
      );
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
  spec?: {
    readonly only?: readonly string[];
    readonly extra?: readonly string[];
    readonly io?: PlayIO;
    readonly sourceCardId?: string;
  },
): string[] {
  const type = getGlobalCardRegistry().getCardType(cardId);
  const isUnit = type !== "gear" && type !== "equipment";
  // rule 054.1 / 054.2 (sfd-015-221 Perched Grimwyrm) — "play me ONLY to a
  // battlefield you conquered this turn" is a property of the CARD, so it
  // narrows an effect-instructed play too. When the instruction names a fixed
  // destination the card forbids (base), nothing is legal → 055 / 358.3.a.
  const conqueredOnly = isUnit && playOnlyToConqueredBattlefield(cardId);
  const conquered = draft.conqueredThisTurn?.[playerId] ?? [];
  // rule 054.1 / 355.2 (ogn-070-298 Mageseeker Warden) — "opponents can only
  // play units to their base" narrows every play, not just the one from hand:
  // an effect that INSTRUCTS a play (419.3) may not put the unit at a
  // battlefield either, and with no legal location left the instruction is
  // simply skipped (358.3.a / 419.3.c).
  const restrictedToBase =
    isUnit &&
    typeof spec?.io?.zones?.getCardsInZone === "function" &&
    opponentsRestrictedToBase(draft, spec.io.zones, playerId);
  const legal = (zone: string): boolean => {
    if (isUnit && restrictedToBase && zone.startsWith("battlefield-")) {
      return false;
    }
    if (
      isUnit &&
      zone.startsWith("battlefield-") &&
      battlefieldForbidsUnitPlays(extractBattlefieldId(zone) ?? "")
    ) {
      return false;
    }
    if (conqueredOnly) {
      const bfId = extractBattlefieldId(zone);
      return bfId !== undefined && conquered.includes(bfId);
    }
    return true;
  };
  if (spec?.only) {
    return spec.only.filter(legal);
  }
  // rule 143.1.a.1 — gear is played to base only.
  if (!isUnit) {
    return ["base"];
  }
  const out = [
    "base",
    // rule 355.2.a / 190.4.c / 323.6 (official clarification 9a32c2cc829f221a — Cruel
    // Patron, Baited Hook, Arcane Shift, Glasc Mixologist): "a battlefield you
    // control" is the RECORDED controller. Control lapses only in an Open-State
    // Cleanup, so a battlefield this very effect (or its cost) just emptied is
    // still a legal destination while the play is pending — operations/battlefield-control.ts.
    ...Object.entries(draft.battlefields ?? {})
      .filter(([bfId]) => controlsBattlefield(draft, bfId, playerId))
      .map(([bfId]) => `battlefield-${bfId}`),
  ];
  for (const zone of spec?.extra ?? []) {
    if (!out.includes(zone)) {
      out.push(zone);
    }
  }
  return out.filter(legal);
}

// ===========================================================================
// Spells an effect plays
// ===========================================================================

/**
 * rule 354.1 / 419.3 — a spell an effect plays goes on the Chain like any
 * other spell play: `playerId` controls it, its targets are chosen as it is
 * finalized/resolves, and when it leaves the Chain it goes to `resolveTo`
 * (rule 594 "then recycle it" → the Main Deck). Counts as a card played (724).
 */
export function putPlayedSpellOnChain(
  io: PlayIO,
  spec: {
    cardId: string;
    playerId: string;
    resolveTo?: "trash" | "mainDeck" | "banishment";
    via?: PlayVia;
    /** rule 820 — extra executions bought with an elected [Repeat] (0 = none). */
    repeatCount?: number;
  },
): void {
  const { draft, zones } = io;
  const spellEffect = (getGlobalCardRegistry().getAbilities(spec.cardId) ?? []).find(
    (a) => a.type === "spell",
  )?.effect;
  // rule 820.2 / 820.3.a — an elected [Repeat] runs the SAME instructions again
  // from ONE Chain item, and each execution owns its own choices (820.2.a). The
  // executions must be on the item BEFORE it is finalized, so finalization asks
  // a target slot per execution and charges [Deflect] per choice (809.1.c).
  const repeatN = Math.max(0, spec.repeatCount ?? 0);
  const chainEffect =
    repeatN > 0 && spellEffect
      ? {
          _repeatExecutions: true,
          effects: Array.from({ length: 1 + repeatN }, () => structuredClone(spellEffect)),
          type: "sequence",
        }
      : spellEffect;
  zones.moveCard({ cardId: spec.cardId as CoreCardId, targetZoneId: "chain" as CoreZoneId });
  (draft as { interaction?: RiftboundGameState["interaction"] }).interaction = addToChain(
    draft.interaction ?? createInteractionState(),
    {
      cardId: spec.cardId,
      controller: spec.playerId,
      effect: chainEffect,
      resolveTo: spec.resolveTo ?? "trash",
      type: "spell",
    },
    Object.keys(draft.players),
  );
  // rule-id: sfd-140-221 (rules 370.2 / 372) — remember the "recycle it after
  // you play it" rider while the spell sits on the chain: it replaces where the
  // card goes as it leaves the chain, including a self-banish step run by the
  // spell's own resolution ("Banish this.").
  const riderState = draft as { recycleRiderCardIds?: Record<string, boolean> };
  riderState.recycleRiderCardIds ??= {};
  if (spec.resolveTo === "mainDeck") {
    riderState.recycleRiderCardIds[spec.cardId] = true;
  } else {
    delete riderState.recycleRiderCardIds[spec.cardId];
  }
  if (draft.cardsPlayedThisTurn) {
    draft.cardsPlayedThisTurn[spec.playerId] = (draft.cardsPlayedThisTurn[spec.playerId] ?? 0) + 1;
  }
  notePlayThisTurn(draft, spec.playerId, spec.cardId);
  // rule 820.2.a / 809.1.c — with [Repeat] elected each execution names its OWN
  // object, so the play asks one target slot per execution (and owes [Deflect]
  // per choice) instead of one shared target for all of them. rule 419.3.b /
  // 355.5: a ROLE-PAIR spell an effect plays ("a friendly unit and an enemy
  // unit … they deal damage to each other") must name its pair as it is played
  // too, repeated or not — the engine may not bind the roles on its own.
  const roles = spellExecutionRoles(spellEffect as SpellTargetShape | undefined);
  if (roles.length > 0 && (repeatN > 0 || roles.length > 1)) {
    const items = draft.interaction?.chain?.items;
    const item = items?.[items.length - 1];
    if (item && item.cardId === spec.cardId) {
      (item as { repeatTargetSlots?: number; repeatRoleCount?: number }).repeatTargetSlots =
        roles.length * (1 + repeatN);
      (item as { repeatRoleCount?: number }).repeatRoleCount = roles.length;
      continueRepeatSpellSlots(io);
      return;
    }
  }
  bindPlayedSpellTarget(io, spec.cardId, spec.playerId, spellEffect as SpellTargetShape | undefined);
}

/**
 * rule 355.5 / 820.2.a — the caster-chosen role descriptors ONE execution of a
 * spell names, in the order they are asked: a `fight` names [attacker,
 * defender], a two-role spell (swap-might / swap-locations / "increase its
 * Might to another unit's") names [first, second], and everything else names at
 * most one object.
 */
function spellExecutionRoles(spellEffect: SpellTargetShape | undefined): readonly unknown[] {
  const effect = spellEffect as
    | {
        type?: string;
        attacker?: unknown;
        defender?: unknown;
        target?: unknown;
      }
    | undefined;
  if (!effect) {
    return [];
  }
  if (
    effect.type === "fight" &&
    typeof effect.attacker === "object" &&
    effect.attacker !== null &&
    typeof effect.defender === "object" &&
    effect.defender !== null
  ) {
    return [effect.attacker, effect.defender];
  }
  const pair = pairEffectRoles(effect as Parameters<typeof pairEffectRoles>[0]);
  if (pair) {
    return [pair.first, pair.second];
  }
  if (singleObjectSpellTarget(spellEffect)) {
    return [effect.target];
  }
  // rule 820.2.a (rule-id: sfd-023-221 Piercing Light) — a SEQUENCE spell
  // ("Deal 2 to a unit at a battlefield, then deal 2 to up to one other unit")
  // names EVERY caster-chosen slot of one execution as it is played, exactly as
  // a hand cast does. Without this an effect-played [Repeat] bound one shared
  // target set and the second execution hit nothing new.
  // rule 355.5 — the same walk runs WITHOUT a [Repeat] too: one execution's
  // slots are still play-time choices, never deferred to resolution.
  const slots =
    collectSequenceTargetSlots(effect as Parameters<typeof collectSequenceTargetSlots>[0]) ?? [];
  return slots.length > 0 && slots.every((s) => isCasterChosenSlot(s)) ? slots : [];
}

/** A descriptor one execution names on its own: a single caster-chosen object (possibly "up to one"). */
function isCasterChosenSlot(descriptor: unknown): boolean {
  const d = descriptor as { quantity?: { upTo?: number }; type?: string } | undefined;
  if (d === undefined || typeof d !== "object") {
    return false;
  }
  const singular = d.quantity === undefined || d.quantity.upTo === 1;
  return singular && !["battlefield", "player", "self", "trigger-source"].includes(d.type ?? "");
}

/** A spell whose whole effect names exactly ONE caster-chosen object per execution. */
function singleObjectSpellTarget(spellEffect: SpellTargetShape | undefined): boolean {
  const descriptor = spellEffect?.target as
    | { quantity?: unknown; type?: string }
    | undefined;
  return (
    descriptor !== undefined &&
    typeof descriptor === "object" &&
    descriptor.quantity === undefined &&
    !["self", "player", "battlefield", "trigger-source"].includes(descriptor.type ?? "")
  );
}

/**
 * rule 820.2.a — walks the per-execution target slots of a [Repeat]ed spell an
 * effect played: slot i is the object execution i names, each one a fresh
 * choice that owes its own [Deflect] surcharge (809.1.c). Called again after
 * every pick until the item holds one target per execution, at which point the
 * executions are marked `independentTargets` so execution i hits target i.
 */
export function continueRepeatSpellSlots(io: PlayIO): void {
  const { draft } = io;
  if (draft.pendingChoice) {
    return;
  }
  const items = draft.interaction?.chain?.items as
    | { id: string; cardId: string; controller: string; effect?: unknown; targets?: readonly string[]; repeatTargetSlots?: number; repeatRoleCount?: number; repeatSlotSkips?: readonly number[] }[]
    | undefined;
  const idx = items?.findIndex((it) => typeof it.repeatTargetSlots === "number") ?? -1;
  if (!items || idx < 0) {
    return;
  }
  const item = items[idx] as NonNullable<(typeof items)[number]>;
  const need = item.repeatTargetSlots ?? 0;
  const picked = item.targets ?? [];
  // rule 355.13 — a declined "up to one …" slot names nothing, so the walk
  // tracks the slots ANSWERED (picked + declined), not just the ids bound.
  const skips = item.repeatSlotSkips ?? [];
  const answered = picked.length + skips.length;
  const spellEffect = (getGlobalCardRegistry().getAbilities(item.cardId) ?? []).find(
    (a) => a.type === "spell",
  )?.effect as SpellTargetShape | undefined;
  const roles = spellExecutionRoles(spellEffect);
  const roleCount = Math.max(1, item.repeatRoleCount ?? 1);
  const roleIndex = answered % roleCount;
  const descriptor = roles[roleIndex] ?? spellEffect?.target;
  // rule 355.9 / 355.13 — the roles of ONE execution name DIFFERENT objects (a
  // unit cannot fight itself, "one OTHER unit" is not the one just named), so
  // the partners this execution already named are off this slot's list.
  const skippedBeforeExec = skips.filter((s) => s < answered - roleIndex).length;
  const partners = picked.slice(answered - roleIndex - skippedBeforeExec);
  const sameZoneOf =
    (descriptor as { location?: unknown } | undefined)?.location === "same" && partners[0] !== undefined
      ? (io.zones?.getCardZone?.(partners[0] as CoreCardId) as string | undefined)
      : undefined;
  const options =
    answered < need && descriptor !== undefined && typeof io.zones?.getCardsInZone === "function"
      ? (resolveTarget(
          { ...(descriptor as object), quantity: "all" } as Parameters<typeof resolveTarget>[0],
          {
            cards: io.cards,
            choosing: true,
            draft,
            playerId: item.controller,
            ...(sameZoneOf === undefined ? {} : { sameZone: sameZoneOf, sourceZone: sameZoneOf }),
            sourceCardId: item.cardId,
            zones: io.zones,
          } as Parameters<typeof resolveTarget>[1],
        ) as string[]).filter((id) => !partners.includes(id))
      : [];
  // rule 355.13 / 355.8 — an "up to one" slot may legally name nothing, so it
  // is offered with a decline; an OPTIONAL slot with no candidate left is
  // simply skipped and the walk moves on to the next slot.
  const optionalSlot =
    typeof (descriptor as { quantity?: { upTo?: number } } | undefined)?.quantity?.upTo === "number";
  if (options.length === 0 && optionalSlot && answered < need) {
    items[idx] = { ...item, repeatSlotSkips: [...skips, answered] } as (typeof items)[number];
    continueRepeatSpellSlots(io);
    return;
  }
  if (options.length === 0) {
    // Done (or nothing left to name): the walk is over.
    const {
      repeatRoleCount: _dropRoles,
      repeatSlotSkips: _dropSkips,
      repeatTargetSlots: _drop,
      ...rest
    } = item;
    const complete = answered === need && need > roleCount && rest.effect !== undefined;
    // rule 820.2.a — execution i acts on the objects IT named: a one-object
    // spell reads slot i positionally, a role-pair spell hands each copy of the
    // instructions its own [first, second] slice.
    const executionEffect =
      complete && roleCount > 1
        ? sliceRepeatExecutionTargets(rest.effect, repeatExecutionSlices(picked, skips, need, roleCount))
        : complete
          ? { ...(rest.effect as object), independentTargets: true }
          : undefined;
    items[idx] = {
      ...rest,
      ...(executionEffect === undefined ? {} : { effect: executionEffect }),
    } as (typeof items)[number];
    return;
  }
  draft.pendingChoice = {
    bindSlotIndex: answered,
    bindToChainItemId: item.id,
    deflectTax: true as const,
    effect: spellEffect,
    options,
    playerId: item.controller,
    remaining: 1,
    ...(optionalSlot ? { optional: true as const, repeatSlot: true as const } : {}),
    sourceCardId: item.cardId,
    type: "choose-target",
  } as unknown as typeof draft.pendingChoice;
}

/**
 * rule 820.2.a / 355.13 — the ids each execution actually named, in order:
 * declined ("up to one …") slots consume a slot but no id, so the flat
 * play-time list is dealt back out execution by execution.
 */
function repeatExecutionSlices(
  picked: readonly string[],
  skips: readonly number[],
  need: number,
  roleCount: number,
): readonly (readonly string[])[] {
  const out: string[][] = [];
  let cursor = 0;
  for (let slot = 0; slot < need; slot++) {
    if (slot % roleCount === 0) {
      out.push([]);
    }
    if (skips.includes(slot)) {
      continue;
    }
    const id = picked[cursor];
    cursor += 1;
    if (id !== undefined) {
      (out[out.length - 1] as string[]).push(id);
    }
  }
  return out;
}

/**
 * rule 820.2.a — hand each copy of a [Repeat]ed role-pair spell the slice of the
 * play-time target list its own execution named, exactly as a hand cast does.
 */
function sliceRepeatExecutionTargets(
  effect: unknown,
  slices: readonly (readonly string[])[],
): unknown {
  const copies = (effect as { effects?: unknown[] } | undefined)?.effects;
  if (!Array.isArray(copies)) {
    return effect;
  }
  return {
    ...(effect as object),
    effects: copies.map((copy, i) => ({
      boundTargetsOverride: [...(slices[i] ?? [])],
      effects: [copy],
      type: "sequence",
    })),
  };
}

interface SpellTargetShape {
  readonly target?: unknown;
}

/**
 * rule 419.3.b / 355.5 / 355.8 (rule-id: sfd-140-221 Fizz) — a spell an EFFECT
 * plays still runs every step of the play process, so any target it names is
 * chosen as it goes on the Chain, never deferred to resolution: an item may
 * only sit on the Chain once valid choices exist for all of its targets, and
 * the opponent must be able to see them before responding. One legal object
 * locks itself; several park a `choose-target` bound to the new item, exactly
 * like a play-time slot.
 */
export function bindPlayedSpellTarget(
  io: PlayIO,
  cardId: string,
  playerId: string,
  spellEffect: SpellTargetShape | undefined,
): void {
  const { draft } = io;
  const items = draft.interaction?.chain?.items;
  const item = items?.[items.length - 1];
  if (!item || item.cardId !== cardId || !spellEffect) {
    return;
  }
  // rule 355.5 / 402.2 — the same choice planning a hand cast / a finalized
  // trigger uses (sequence lead targets, "X then Y", fight defenders, Deflect
  // surcharges): the single caster-chosen object is bound onto the item now, or
  // a `choose-target` bound to the item is parked for the performer.
  if (typeof io.zones?.getCardsInZone === "function" && typeof io.cards?.getCardOwner === "function") {
    if (draft.pendingChoice) {
      return;
    }
    const outcome = executeResolvedItem(item as never, draft, io as never, { finalizeOnly: true });
    if (draft.pendingChoice) {
      return;
    }
    if (outcome?.targets !== undefined && outcome.targets.length > 0) {
      (item as { targets?: readonly string[] }).targets = [...outcome.targets];
      // rule 355.6 / 383.4.b.2 — "when you choose me" fires as the spell is finalized.
      for (const targetId of outcome.targets) {
        if (draft.battlefields?.[targetId] !== undefined) {
          continue;
        }
        fireTriggers(
          { cardId: targetId, chooserId: playerId, sourceType: "spell", type: "choose" },
          { cards: io.cards, counters: io.counters, draft, zones: io.zones } as never,
        );
      }
    }
    return;
  }
  const descriptor = spellEffect?.target;
  if (
    !descriptor ||
    typeof descriptor !== "object" ||
    (descriptor as { quantity?: unknown }).quantity === "all" ||
    ["self", "player", "battlefield", "trigger-source"].includes(
      (descriptor as { type?: string }).type ?? "",
    )
  ) {
    return;
  }
  const options = resolveTarget(
    { ...(descriptor as object), quantity: "all" } as Parameters<typeof resolveTarget>[0],
    {
      cards: io.cards,
      choosing: true,
      draft,
      playerId,
      sourceCardId: cardId,
      zones: io.zones,
    } as Parameters<typeof resolveTarget>[1],
  ) as string[];
  if (options.length === 0) {
    return;
  }
  if (options.length === 1) {
    (item as { targets?: readonly string[] }).targets = [options[0] as string];
    return;
  }
  if (draft.pendingChoice) {
    return;
  }
  draft.pendingChoice = {
    bindToChainItemId: item.id,
    effect: spellEffect,
    options,
    playerId,
    remaining: 1,
    sourceCardId: cardId,
    type: "choose-target",
  } as unknown as typeof draft.pendingChoice;
}

// ===========================================================================
// Plays an effect instructs (rule 419.3) — beginPlay / continueEffectPlay
// ===========================================================================

/**
 * rule 355.2 / 355.2.b / 462.2.a — where the instructed play may put the
 * permanent: a fixed zone ("play it here" / "to their base"), a restricted list
 * ("to a battlefield you control"), the default valid locations plus granted
 * extras ("you may play it here"), or the location the OLD object left
 * ("its owner plays it to the same location" — last-known information).
 */
export type PlayLocationSpec =
  | "prompt"
  | "same-as-lki"
  | { readonly fixed: string }
  | { readonly only: readonly string[] }
  | { readonly extra: readonly string[] };

/** The play bundle carried on the pending Chain item (pure data — rule 354.2). */
export interface EffectPlaySpec {
  readonly cardId: string;
  /** The PERFORMER: the player the effect instructs to play the card (controller / owner / opponent). */
  readonly playerId: string;
  readonly via: PlayVia;
  readonly costMode: PlayCostMode | { readonly kind: "ignore-any-and-all" } | { readonly kind: "fixed"; readonly energy?: number; readonly power?: readonly string[] };
  readonly location?: PlayLocationSpec;
  /** rule 128.6 / "you may play" — the performer may decline the whole play. */
  readonly declinable?: boolean;
  /**
   * rule 357.1.a / 429.3.a / 444.2.c (ruling cac9ff02562631c6, ogn-194-298
   * Nocturne) — this play was ACCEPTED at a "you may play it" confirm, so it
   * still owes its performer a Pay step: a rune they could recycle is Power
   * they can bring, and the play is admitted on that basis exactly as the
   * declinable offer was. Without it the accepted respawn (`declinable: false`)
   * would be judged unaffordable and dropped, stranding the card.
   */
  readonly payWindow?: boolean;
  /** The instructing card (prompt source / `then` source). */
  readonly sourceCardId?: string;
  /** rule 323.13 — whose action stages the arrival when it is not the performer. */
  readonly stagedBy?: string;
  /** rule 423 — "… play it stunned". */
  readonly stun?: boolean;
  /** Effect run after the card is played, with the played card bound (`then` / "if you do"). */
  readonly then?: unknown;
  /** rule 594 — a spell played this way is recycled instead of trashed when it leaves the Chain. */
  readonly recycleAfter?: boolean;
  /** Set false to skip the optional-additional-cost offer (a caller that already asked). */
  readonly offerOptionalCosts?: boolean;
}

/** rule 820.1.c.1 — the offer id an elected [Repeat] carries on an instructed play. */
const REPEAT_COST_ID = "repeat";

/** rule 356.2.b — an optional additional resource cost the performer may elect (already discounted). */
interface OptionalCostOffer {
  readonly id: string;
  readonly energy: number;
  readonly power: readonly string[];
  readonly entersReady: boolean;
  /** rule 820.1.c — extra executions bought when this offer is the spell's [Repeat]. */
  readonly repeatCount?: number;
}

/** Dialog progress recorded on the pending item between answers. */
interface EffectPlayProgress {
  readonly from: string;
  readonly confirmed?: boolean;
  readonly location?: string;
  /** undefined = not decided yet; null = declined / not offered. */
  readonly optional?: OptionalCostOffer | null;
  /** The offer as it was put to the performer (its answer copies it). */
  readonly offered?: OptionalCostOffer;
  /** Objects paying a mandatory additional cost (kill a friendly unit …). */
  readonly mandatoryObjects?: readonly string[];
  readonly mandatoryAsked?: boolean;
  /**
   * rule 356.2.b — objects paying the card's OPTIONAL "kill a friendly unit"
   * additional cost. undefined = not decided yet; null = declined / none.
   */
  readonly killObjects?: readonly string[] | null;
  readonly killAsked?: boolean;
  /**
   * rule 357.1.a / 429.3.a (ruling cac9ff02562631c6) — the recyclable-rune PAY
   * confirm was already put to the performer once. Distinct from `confirmed`
   * (the "you may play it" DECLINE question, 128.6): accepting the decline
   * question is not a pay attempt, so it must not suppress the pay window the
   * dialog owes the performer later (Nocturne accepted while Stacked Deck was
   * still resolving, then paid once it finished).
   */
  readonly payAsked?: boolean;
}

/** The Chain item of a card an effect is playing (type "permanent"/"spell", status pending). */
export interface PendingPlayItem {
  readonly id: string;
  readonly type: "permanent" | "spell";
  readonly cardId: string;
  readonly controller: string;
  readonly status: "pending";
  readonly triggered: true;
  readonly play: EffectPlaySpec & { readonly progress: EffectPlayProgress };
  readonly finalizeAfter?: readonly string[];
}

export function isPendingPlayItem(item: unknown): item is PendingPlayItem {
  const it = item as { play?: unknown; status?: unknown } | undefined;
  return !!it && typeof it.play === "object" && it.play !== null && it.status === "pending";
}

function pendingPlayItems(draft: RiftboundGameState): PendingPlayItem[] {
  return ((draft.interaction?.chain?.items ?? []) as unknown[]).filter(isPendingPlayItem);
}

function patchPlayItem(draft: RiftboundGameState, itemId: string, progress: Partial<EffectPlayProgress>): void {
  const items = draft.interaction?.chain?.items as unknown[] | undefined;
  const idx = items?.findIndex((it) => (it as { id?: string }).id === itemId) ?? -1;
  if (!items || idx < 0) {
    return;
  }
  const item = items[idx] as PendingPlayItem;
  items[idx] = { ...item, play: { ...item.play, progress: { ...item.play.progress, ...progress } } };
}

/**
 * rule 354.1 / 354.2 — append the card as a Pending Item on the Chain and put
 * the card itself in the `chain` zone (limbo). Never passes Focus when it later
 * leaves an otherwise empty Chain (it was not a Discretionary play — 346.1).
 */
function appendPendingPlayItem(draft: RiftboundGameState, spec: EffectPlaySpec, from: string): string {
  const state = draft.interaction ?? createInteractionState();
  const id = `chain-${state.nextChainItemId}`;
  const isSpell = getGlobalCardRegistry().getCardType(spec.cardId) === "spell";
  const item: PendingPlayItem = {
    cardId: spec.cardId,
    controller: spec.playerId,
    id,
    play: { ...spec, progress: { from } },
    status: "pending",
    triggered: true,
    type: isSpell ? "spell" : "permanent",
  };
  const existing = state.chain?.items ?? [];
  const activeShowdown = getActiveShowdown(state);
  (draft as { interaction?: RiftboundGameState["interaction"] }).interaction = {
    ...state,
    chain: {
      active: true,
      activePlayer: state.chain?.activePlayer ?? spec.playerId,
      items: [...existing, item as never],
      openedByTrigger: state.chain ? state.chain.openedByTrigger : true,
      passedPlayers: [],
      relevantPlayers: state.chain?.relevantPlayers ?? activeShowdown?.relevantPlayers ?? Object.keys(draft.players),
      turnOrder: state.chain?.turnOrder ?? Object.keys(draft.players),
    },
    nextChainItemId: state.nextChainItemId + 1,
  } as RiftboundGameState["interaction"];
  return id;
}

/** rule 358.5 / 419.3.c — the play cannot happen: the card returns where it was and the item leaves. */
function abortEffectPlay(io: PlayIO, item: PendingPlayItem): void {
  const { draft, zones } = io;
  const from = item.play.progress.from;
  if ((zones.getCardZone?.(item.cardId as CoreCardId) as string | undefined) === "chain") {
    zones.moveCard({
      cardId: item.cardId as CoreCardId,
      targetZoneId: (from.startsWith("facedown") ? "trash" : from) as CoreZoneId,
    });
  }
  if (draft.interaction) {
    (draft as { interaction?: RiftboundGameState["interaction"] }).interaction = removeChainItem(draft.interaction, item.id);
  }
}

/**
 * rule 356.2 / 355.2.b (ven-157-166 Dragon Roost) — the extra pips a
 * DESTINATION battlefield charges to make itself a Valid location for this
 * play. The permission comes from the battlefield, not the played card, so it
 * applies to an effect-play exactly as it does to a hand play (419.3.b); a
 * battlefield the performer already controls is Valid for free (355.2.a).
 */
function redirectPipsFor(
  draft: RiftboundGameState,
  spec: EffectPlaySpec,
  location: string | undefined,
): readonly string[] | undefined {
  if (!location || !isBattlefieldZone(location)) {
    return undefined;
  }
  const bfId = extractBattlefieldId(location);
  if (!bfId || draft.battlefields?.[bfId]?.controller === spec.playerId) {
    return undefined;
  }
  return battlefieldRedirectPowerFor(bfId, spec.cardId);
}

/** rule 356.1.a / 356.1.b / 356.5.a — the instruction's cost mode as `CostExtras`. */
function costExtrasFor(
  io: PlayIO,
  spec: EffectPlaySpec,
  optional?: OptionalCostOffer | null,
  location?: string,
  killVictim?: string,
): { extras: CostExtras; free: boolean } {
  const board =
    typeof io.zones?.getCardsInZone === "function" && typeof io.cards?.getCardOwner === "function"
      ? { cards: io.cards, zones: io.zones }
      : undefined;
  const mode = spec.costMode;
  const extras: CostExtras = { ...(board ? { board } : {}) };
  let free = false;
  switch (mode.kind) {
    case "ignore-any-and-all":
      // rule 356.5.a — total cost [0], additional costs included.
      free = true;
      break;
    case "ignore-all":
      // rule 356.1.b.1 — base Energy AND Power set to zero; increases still apply (356.1.b.3).
      extras.altCost = { energy: 0, power: [] };
      break;
    case "ignore-energy":
      extras.ignoreEnergyCost = true;
      break;
    case "ignore-power":
      extras.altCost = { energy: getGlobalCardRegistry().getEnergyCost(spec.cardId) ?? 0, power: [] };
      break;
    case "reduce":
      // rule 356.1.b (ruling 3033614648d458b6, ogn-113-298 Void Rush) — the
      // instruction's "reducing its cost by [N]" discounts the card's BASE
      // Energy only: whatever it does not use is lost, it never pays an
      // additional cost the performer elects on top (a [Repeat] tier).
      extras.additionalCost = {
        energy: -(optional?.id === REPEAT_COST_ID
          ? Math.min(mode.energy ?? 0, getGlobalCardRegistry().getEnergyCost(spec.cardId) ?? 0)
          : (mode.energy ?? 0)),
      };
      if (mode.power) {
        extras.waivePower = { ...mode.power };
      }
      break;
    case "fixed":
      // rule 356.1.a — "play it for [Cost]" replaces the base cost.
      extras.altCost = { energy: mode.energy ?? 0, power: [...(mode.power ?? [])] };
      break;
    default:
      break;
  }
  if (optional && !free) {
    if (optional.id === REPEAT_COST_ID) {
      // rule 820.1.c.1 / 356.2.b.1 — an elected [Repeat] is priced by the ONE
      // cost model (tiers, "[Repeat] costs less" statics, discounts that may
      // eat into it — 356.4.f), exactly as on a hand cast.
      extras.repeatCount = (extras.repeatCount ?? 0) + (optional.repeatCount ?? 1);
    } else {
      extras.additionalCost = {
        energy: (extras.additionalCost?.energy ?? 0) + optional.energy,
        power: [...(extras.additionalCost?.power ?? []), ...optional.power],
      };
    }
  }
  // rule-id: unl-170-219 (rules 356.1.c, 356.4.d.1) — electing the optional
  // "kill a friendly unit" cost discounts the play by the victim's PRINTED
  // cost; the kill itself is paid in step 4 (357.2).
  if (killVictim && !free) {
    const discount = getSacrificeCostDiscount(spec.cardId, killVictim);
    if (discount) {
      extras.additionalCost = {
        energy: (extras.additionalCost?.energy ?? 0) - discount.energy,
        power: [...(extras.additionalCost?.power ?? [])],
      };
      for (const [domain, pips] of Object.entries(discount.power)) {
        extras.waivePower = {
          ...(extras.waivePower ?? {}),
          [domain]: (extras.waivePower?.[domain] ?? 0) + (pips ?? 0),
        };
      }
    }
  }
  // rule 356.2.b.1 — the destination's own additional cost is added AFTER the
  // base cost is fixed, so a base discounted to 0 still pays it.
  const redirect = free ? undefined : redirectPipsFor(io.draft, spec, location);
  if (redirect) {
    extras.additionalCost = {
      energy: extras.additionalCost?.energy ?? 0,
      power: [...(extras.additionalCost?.power ?? []), ...redirect],
    };
  }
  return { extras, free };
}

/**
 * rule 419.2.a / 355.8 — could `playerId` complete this play right now under
 * the instruction's cost mode (a mandatory additional cost payable, a spell
 * with a legal target, the remaining cost affordable)? Callers use it to drop
 * ineligible candidates BEFORE offering them (419.3.c).
 */
export function canPerformEffectPlay(io: PlayIO, spec: EffectPlaySpec): boolean {
  const { draft } = io;
  const registry = getGlobalCardRegistry();
  if (draft.cannotPlayCardsThisTurn?.[spec.playerId] === true) {
    return false;
  }
  const cardType = registry.getCardType(spec.cardId);
  if (cardType === "spell") {
    const spellEffect = (registry.getAbilities(spec.cardId) ?? []).find((a) => a.type === "spell")?.effect;
    if (
      typeof io.zones?.getCardsInZone === "function" &&
      !spellEffectHasLegalTargets(spellEffect as never, {
        cards: io.cards,
        choosing: true,
        draft,
        playerId: spec.playerId,
        sourceCardId: spec.cardId,
        zones: io.zones,
      } as never)
    ) {
      return false;
    }
  } else if (cardType !== "unit" && cardType !== "gear" && cardType !== "equipment") {
    return false;
  } else {
    // rule 355–358 / 419.2.a — a PERMANENT: the one play-options model decides
    // (a legal location left after restrictions, a mandatory cost payable, the
    // total — optional elections included — affordable from the pool).
    const from = (io.zones.getCardZone?.(spec.cardId as CoreCardId) as string | undefined) ?? "hand";
    if (typeof io.zones?.getCardsInZone !== "function") {
      // A caller without board readers (unit-test stubs): default locations, pool check only.
      const { extras, free } = instructionCost(spec);
      return (
        free ||
        draft.runePools[spec.playerId] === undefined ||
        canPayResourceCost(draft, spec.playerId, spec.cardId, computePlayResourceCost(draft, spec.playerId, spec.cardId, extras as CostExtras, undefined, false))
      );
    }
    if (permanentEffectPlayOptions(io, spec, from).length > 0) {
      return true;
    }
    // rule 429.3.a / 444.2.c (ruling cac9ff02562631c6, ogn-194-298 Nocturne) — a
    // DECLINABLE instructed play opens a confirm prompt that is itself the play's
    // Pay step, and rune [Add] abilities stay usable inside it: a rune the
    // performer could recycle right then is Power they can bring.
    return (
      (spec.declinable === true || spec.payWindow === true) &&
      permanentEffectPlayOptions(io, spec, from, withRecyclableRunes(io, spec.playerId)).length > 0
    );
  }
  const { extras, free } = costExtrasFor(io, spec);
  if (free || draft.runePools[spec.playerId] === undefined) {
    return true;
  }
  const meta = typeof io.cards?.getCardMeta === "function" ? createMetaAccessor(io.cards) : undefined;
  const cost = computePlayResourceCost(draft, spec.playerId, spec.cardId, extras, meta, false);
  if (canPayResourceCost(draft, spec.playerId, spec.cardId, cost)) {
    return true;
  }
  // rule 429.3.a / 444.2.c (ruling cac9ff02562631c6) — a DECLINABLE instructed
  // play's confirm prompt is its Pay step; recyclable runes count (see above).
  return (
    (spec.declinable === true || spec.payWindow === true) &&
    canPayResourceCost(withRecyclableRunes(io, spec.playerId), spec.playerId, spec.cardId, cost)
  );
}

// ---------------------------------------------------------------------------
// Permanents an effect plays — the play-options model (origin "effect")
// ---------------------------------------------------------------------------

/** rule 356.2.b — the optional-cost elections the instructed-play dialog can ask its performer about. */
const EFFECT_DIALOG_OPTIONAL_IDS: readonly string[] = [
  ADDITIONAL_COST_IDS.accelerate,
  ADDITIONAL_COST_IDS.accelerateGranted,
  ADDITIONAL_COST_IDS.pay,
  ADDITIONAL_COST_IDS.kill,
];
const RESOURCE_OPTIONAL_IDS: readonly string[] = [
  ADDITIONAL_COST_IDS.accelerate,
  ADDITIONAL_COST_IDS.accelerateGranted,
  ADDITIONAL_COST_IDS.pay,
];

/** rule 356.1.a / 356.1.b / 356.5.a — the instruction's base-cost overrides for the model. */
function instructionCost(spec: EffectPlaySpec): { extras: Partial<CostExtras>; free: boolean } {
  const mode = spec.costMode;
  switch (mode.kind) {
    case "ignore-any-and-all":
      return { extras: {}, free: true };
    case "ignore-all":
      return { extras: { altCost: { energy: 0, power: [] } }, free: false };
    case "ignore-energy":
      return { extras: { ignoreEnergyCost: true }, free: false };
    case "ignore-power":
      return { extras: { altCost: { energy: getGlobalCardRegistry().getEnergyCost(spec.cardId) ?? 0, power: [] } }, free: false };
    case "reduce":
      return {
        extras: {
          additionalCost: { energy: -(mode.energy ?? 0) },
          ...(mode.power ? { waivePower: { ...mode.power } } : {}),
        },
        free: false,
      };
    case "fixed":
      return { extras: { altCost: { energy: mode.energy ?? 0, power: [...(mode.power ?? [])] } }, free: false };
    default:
      return { extras: {}, free: false };
  }
}

/**
 * rule 355.2 — every location the INSTRUCTION allows for this permanent (a fixed
 * zone, a restricted list, or the defaults plus the card's own granted
 * locations plus battlefields that sell themselves as a destination —
 * ven-157-166); restrictions and prices are the model's business.
 */
function locationCandidatesFor(io: PlayIO, spec: EffectPlaySpec): string[] {
  const { draft, cards } = io;
  const loc = spec.location ?? "prompt";
  if (loc === "same-as-lki") {
    const lki = (cards.getCardMeta?.(spec.cardId as CoreCardId) as { banishedFrom?: string } | undefined)?.banishedFrom;
    return lki && isBoardZoneId(lki) ? playDestinationOptions(draft, spec.playerId, spec.cardId, { io, only: [lki] }) : [];
  }
  if (loc !== "prompt" && "fixed" in loc) {
    return playDestinationOptions(draft, spec.playerId, spec.cardId, { io, only: [loc.fixed] });
  }
  if (loc !== "prompt" && "only" in loc) {
    return playDestinationOptions(draft, spec.playerId, spec.cardId, { io, only: loc.only });
  }
  const out = playDestinationOptions(draft, spec.playerId, spec.cardId, {
    extra: [...(loc === "prompt" ? [] : loc.extra), ...selfGrantedPlayLocations(io, spec)],
    io,
    sourceCardId: spec.sourceCardId,
  });
  if (getGlobalCardRegistry().getCardType(spec.cardId) === "unit") {
    for (const bfId of Object.keys(draft.battlefields ?? {})) {
      const zone = `battlefield-${bfId}`;
      if (!out.includes(zone) && battlefieldRedirectPowerFor(bfId, spec.cardId)) {
        out.push(zone);
      }
    }
  }
  return out;
}

function effectPlayOrigin(io: PlayIO, spec: EffectPlaySpec, from: string): UnitPlayOrigin {
  const { extras, free } = instructionCost(spec);
  return {
    destinations: locationCandidatesFor(io, spec),
    extras,
    free,
    from,
    kind: "effect",
    optionalCostIds: EFFECT_DIALOG_OPTIONAL_IDS,
    ...(spec.offerOptionalCosts === false ? { offerOptionalCosts: false } : {}),
  };
}

/** Every legal, payable (location × cost election) of this instructed permanent play. */
function permanentEffectPlayOptions(
  io: PlayIO,
  spec: EffectPlaySpec,
  from: string,
  state: RiftboundGameState = io.draft,
): UnitPlayOption[] {
  if (typeof io.zones?.getCardsInZone !== "function") {
    return [];
  }
  return computeUnitPlayOptions(state, io, spec.playerId, spec.cardId, effectPlayOrigin(io, spec, from));
}

function objectOf(option: UnitPlayOption, id: string): string | undefined {
  const v = option.selection.paid?.[id];
  return v === undefined || v === true ? undefined : (v.objects ?? [])[0];
}

function pays(option: UnitPlayOption, id: string): boolean {
  return option.selection.paid?.[id] !== undefined;
}


/** The Power half of a play cost as opt-in pips (named Domains first, then any-Domain). */
function powerPipsOf(cost: ReturnType<typeof computePlayResourceCost>): string[] {
  const pips: string[] = [];
  for (const [domain, n] of Object.entries(cost.named)) {
    for (let i = 0; i < (n ?? 0); i++) {
      pips.push(domain);
    }
  }
  for (let i = 0; i < cost.any + (cost.hybrid?.n ?? 0); i++) {
    pips.push("rainbow");
  }
  return pips;
}

/**
 * rule 164.2.b (rule 594) — the Power the performer's Rune Pool could still
 * Add: every rune there (ready or exhausted) recycles for 1 Power of its own
 * Domain. Returns a projected state used only for affordability questions.
 */
function withRecyclableRunes(io: PlayIO, playerId: string): RiftboundGameState {
  const { draft } = io;
  const pool = draft.runePools[playerId];
  if (!pool || typeof io.zones?.getCardsInZone !== "function") {
    return draft;
  }
  const registry = getGlobalCardRegistry();
  const power: Record<string, number> = { ...(pool.power as Record<string, number>) };
  for (const runeId of io.zones.getCardsInZone("runePool" as CoreZoneId, playerId as CorePlayerId)) {
    const domain = registry.get(runeId as string)?.domain;
    const d = Array.isArray(domain) ? domain[0] : domain;
    if (d) {
      power[d] = (power[d] ?? 0) + 1;
    }
  }
  return { ...draft, runePools: { ...draft.runePools, [playerId]: { ...pool, power } } } as RiftboundGameState;
}







/**
 * rule 355.2.b (ogn-161-298 Deadbloom Predator) — "You may play me to an
 * occupied enemy battlefield" is a property of the CARD, not of the hand play,
 * so an effect that plays it (Dazzling Aurora's end-of-turn dig) offers the
 * same extra locations the `playUnit` enumerator does. Gear stays base-only
 * (rule 149.2).
 */
function selfGrantedPlayLocations(io: PlayIO, spec: EffectPlaySpec): string[] {
  const { draft, zones } = io;
  // Occupancy needs a real zone reader; a caller that supplies none (unit-test
  // stubs) simply gets the default destinations.
  if (
    getGlobalCardRegistry().getCardType(spec.cardId) !== "unit" ||
    typeof zones?.getCardsInZone !== "function"
  ) {
    return [];
  }
  const openOk = canPlayToOpenBattlefield(draft, zones, spec.cardId, spec.playerId);
  const enemyOk = canPlayToOccupiedEnemyBattlefield(spec.cardId);
  // rule 355.2 (unl-120-219 Rengar, Trophy Hunter) — "I can be played to a
  // battlefield where there are enemy units" needs no enemy CONTROL of the
  // battlefield, so it is a separate permission from `enemyOk`.
  const enemyUnitsOk = canPlayToEnemyOccupiedBattlefield(spec.cardId);
  const attackedOk = canPlayToAttackedBattlefield(spec.cardId);
  // rule 355.2 / 740.2.a (unl-117-219 Arachnoid Horror) — "can be played to an
  // occupied battlefield if an enemy unit is alone there", whether the card
  // says it about itself (live even from banishment — 366.1) or a permanent on
  // this player's board grants it to every friendly unit. Each unit of a
  // multi-unit instructed play runs its own steps (419.3.b), so this is read
  // afresh per play and sees units that entered earlier in the same resolution.
  const occupiedPermission = getOccupiedBattlefieldPermission(draft, zones, spec.cardId, spec.playerId);
  if (!openOk && !enemyOk && !enemyUnitsOk && !attackedOk && occupiedPermission === undefined) {
    return [];
  }
  const getController = (id: CoreCardId): string | undefined =>
    (io.cards.getCardController?.(id) as string | undefined) ??
    (io.cards.getCardOwner?.(id) as string | undefined);
  const out: string[] = [];
  for (const bfId of Object.keys(draft.battlefields ?? {})) {
    if (
      (openOk && battlefieldIsOpen(draft, zones, bfId)) ||
      (enemyOk && battlefieldIsOccupiedEnemy(draft, zones, bfId, spec.playerId)) ||
      (enemyUnitsOk && battlefieldHasEnemyUnits(zones, getController, bfId, spec.playerId)) ||
      (attackedOk && battlefieldIsAttackedBy(draft, bfId, spec.playerId)) ||
      (occupiedPermission !== undefined &&
        battlefieldMatchesOccupiedPermission(zones, getController, bfId, spec.playerId, occupiedPermission))
    ) {
      out.push(`battlefield-${bfId}`);
    }
  }
  return out;
}



/**
 * rule 419.3.b / 820.1.c.1 / 356.2.b.1 (rule-id: sfd-080-221 Bellows Breath ×
 * sfd-140-221 Fizz) — a spell an EFFECT plays runs every step of the play
 * process, Make Choices included, so its printed (or granted) [Repeat] is
 * offered there exactly as on a hand cast. One extra execution is offered at a
 * time, and only while the rest of the play stays payable with it (357.3).
 * Tiers that ask for a DISCARD are not offered here — the instructed-play
 * dialog has no pitch step.
 */
function payableRepeatCost(io: PlayIO, spec: EffectPlaySpec): OptionalCostOffer | undefined {
  const { draft, cards, zones } = io;
  if (spec.offerOptionalCosts === false) {
    return undefined;
  }
  const board =
    typeof zones?.getCardsInZone === "function" && typeof cards?.getCardOwner === "function"
      ? { cards, zones }
      : undefined;
  const tiers = getEffectiveSpellRepeatCost(draft, spec.playerId, spec.cardId, board);
  const tier = tiers?.[0];
  if (!tier || (tier as { discard?: number }).discard) {
    return undefined;
  }
  const offer: OptionalCostOffer = {
    energy: tier.energy ?? 0,
    entersReady: false,
    id: REPEAT_COST_ID,
    power: [...(tier.power ?? [])],
    repeatCount: 1,
  };
  const { extras, free } = costExtrasFor(io, spec, offer);
  if (free || draft.runePools[spec.playerId] === undefined) {
    return offer;
  }
  const meta = typeof cards?.getCardMeta === "function" ? createMetaAccessor(cards) : undefined;
  return canPayResourceCost(
    draft,
    spec.playerId,
    spec.cardId,
    computePlayResourceCost(draft, spec.playerId, spec.cardId, extras, meta, false),
  )
    ? offer
    : undefined;
}

/**
 * rule 356.4.f — what electing `offer` ACTUALLY adds to this play's Total Cost.
 * Additional costs join the total BEFORE discounts, so a discount that
 * overflowed the printed Energy cost (Reinforce's "reducing its cost by [5]")
 * keeps eating the optional Energy half. The opt-in prompt must gate on that
 * INCREMENTAL Energy, not on the printed [1]: an optional cost discounted to
 * nothing is still electable and still counts as paid (rule 356.4.f.1).
 */
function optionalCostIncrementEnergy(
  io: PlayIO,
  spec: EffectPlaySpec,
  offer: OptionalCostOffer,
  location?: string,
): number {
  const { draft, cards } = io;
  if (offer.energy <= 0 || draft.runePools[spec.playerId] === undefined) {
    return offer.energy;
  }
  const meta = typeof cards?.getCardMeta === "function" ? createMetaAccessor(cards) : undefined;
  const priced = (opt?: OptionalCostOffer): number => {
    const { extras, free } = costExtrasFor(io, spec, opt, location);
    return free
      ? 0
      : computePlayResourceCost(draft, spec.playerId, spec.cardId, extras, meta, false).energy;
  };
  return Math.max(0, Math.min(offer.energy, priced(offer) - priced()));
}

/**
 * rule 419.3 — an effect instructs `spec.playerId` to play `spec.cardId`.
 * The card goes to the Chain as a Pending Item at once (354.1–354.2); the rest
 * of the play — location (355.2), optional additional costs (355.1.a),
 * mandatory additional costs (356.2.a), payment (357), entering the board /
 * the spell becoming a Chain item (359) — runs when the enclosing effect has
 * finished resolving (354.3): the move wrapper's `finalizePendingItems` pass
 * reaches the item, oldest first (337.1.b), and calls
 * {@link continueEffectPlay}. Returns the item id, or undefined when the play
 * is impossible right now (419.2.a / 419.3.c — nothing happens).
 */
export function beginPlay(
  io: PlayIO,
  spec: EffectPlaySpec,
  opts?: {
    /**
     * Continue the play at once when nothing older is pending and no prompt is
     * open — for an instruction whose own later steps read the played card
     * ("Play an Equipment …, then attach it to me"). Otherwise (and by default)
     * the enclosing effect finishes first (354.3) and the move wrapper's
     * finalization pass continues the play.
     */
    readonly immediate?: boolean;
  },
): { readonly itemId: string; readonly outcome: "pending" | "prompted" | "done" } | undefined {
  if (!canPerformEffectPlay(io, spec)) {
    return undefined;
  }
  // rule 128.6 / "you may play …" — the decision to play comes first; the card
  // only goes to the Chain (354.1) once its player has chosen to play it.
  if (spec.declinable === true && !io.draft.pendingChoice) {
    io.draft.pendingChoice = {
      // rule 357.1.a / 429.3.a — accepting is not paying: the play keeps its
      // Pay step (and the runes that can feed it) once it is a Pending Item.
      playConfirmSpec: { ...spec, declinable: false, payWindow: true },
      // rule 354.3 (rule-id: ogn-062-298 Reinforce × ogn-194-298 Nocturne) —
      // saying yes to "you may play me" does not jump the queue: the play is
      // continued at once only when THIS call asked for it. An instructed play
      // accepted while an effect is still resolving stays a Pending Item until
      // that effect (and the older items it queued) has finished.
      playConfirmImmediate: opts?.immediate === true,
      playerId: spec.playerId,
      resolved: { cardId: spec.cardId, controller: spec.playerId, type: "ability" },
      sourceCardId: spec.sourceCardId ?? spec.cardId,
      type: "opt-in",
    } as unknown as RiftboundGameState["pendingChoice"];
    return { itemId: "", outcome: "prompted" };
  }
  const olderPending = ((io.draft.interaction?.chain?.items ?? []) as { status?: string }[]).some(
    (it) => it.status === "pending",
  );
  const from = (io.zones.getCardZone?.(spec.cardId as CoreCardId) as string | undefined) ?? "hand";
  const itemId = appendPendingPlayItem(io.draft, spec, from);
  // rule 354 step 1 / 354.2 — beginning the play MOVES the card out of the zone
  // it was in and onto the Chain: while Pending it is a Chain item, no longer a
  // card sitting in the trash (or in the hand/deck it left). A card in
  // banishment still waits there — that pile is where an effect that banished
  // it goes looking if the play is aborted.
  if (from === "hand" || from === "mainDeck" || from === "trash" || from.startsWith("facedown")) {
    io.zones.moveCard({ cardId: spec.cardId as CoreCardId, targetZoneId: "chain" as CoreZoneId });
  }
  if (opts?.immediate === true && !olderPending && !io.draft.pendingChoice) {
    const item = pendingPlayItems(io.draft).find((it) => it.id === itemId);
    if (item) {
      return { itemId, outcome: continueEffectPlay(io, item) };
    }
  }
  return { itemId, outcome: "pending" };
}

/**
 * Finalize (and, for a permanent, immediately resolve — 337.2) the oldest
 * pending instructed play. Called by `finalizePendingItems`; every prompt it
 * raises names the item (`playItemId`) and its answer is written back by
 * `resolvePendingChoice` before this runs again. Returns "prompted" when it is
 * waiting for an answer, "done" when the item left the Chain.
 */
export function continueEffectPlay(io: PlayIO, item: PendingPlayItem): "prompted" | "done" {
  const { draft } = io;
  const spec = item.play;
  const progress = spec.progress;
  const registry = getGlobalCardRegistry();
  const isSpell = registry.getCardType(spec.cardId) === "spell";

  // rule 358.3.a — a player who can't play cards this turn skips the instruction.
  if (draft.cannotPlayCardsThisTurn?.[spec.playerId] === true) {
    abortEffectPlay(io, item);
    return "done";
  }

  // rule 128.6 / "you may play it" — the performer may decline outright.
  if (spec.declinable === true && progress.confirmed === undefined) {
    draft.pendingChoice = {
      playConfirm: true,
      playItemId: item.id,
      playerId: spec.playerId,
      resolved: { cardId: spec.cardId, controller: spec.playerId, type: "ability" },
      sourceCardId: spec.sourceCardId ?? spec.cardId,
      type: "opt-in",
    } as unknown as RiftboundGameState["pendingChoice"];
    return "prompted";
  }
  if (progress.confirmed === false) {
    abortEffectPlay(io, item);
    return "done";
  }

  let enteredAt: string | undefined;
  if (!isSpell) {
    // rule 355–358 — a PERMANENT: every remaining question of the dialog is a
    // FILTER over the one play-options model (origin "effect"): the legal
    // locations are its distinct destinations, the objects that may pay a
    // mandatory / optional kill are the objects its options name there, an
    // optional resource cost is offered iff an option pays it, and what is paid
    // is the surviving option's own total (357) — never a separate computation.
    const outcome = continuePermanentEffectPlay(io, item);
    if (outcome !== "entered") {
      return outcome;
    }
    enteredAt = (io.zones.getCardZone?.(spec.cardId as CoreCardId) as string | undefined) ?? undefined;
  } else {
    // rule 355.1.a / 820.1.c.1 — a spell's own riders are play params on a hand
    // cast, but the ONE election an instructed play still owes its performer is
    // its [Repeat] additional cost.
    let optional = progress.optional;
    if (optional === undefined) {
      const offer = payableRepeatCost(io, spec);
      if (offer && progress.offered === undefined) {
        patchPlayItem(draft, item.id, { offered: offer });
        const free = spec.costMode.kind === "ignore-any-and-all";
        // rule 356.4.f — gate on what the election really costs on top of the
        // (already discounted) play, not on the printed amount.
        const owedEnergy = free ? 0 : optionalCostIncrementEnergy(io, spec, offer);
        draft.pendingChoice = {
          playCostId: offer.id,
          playItemId: item.id,
          playerId: spec.playerId,
          resolved: {
            cardId: spec.cardId,
            controller: spec.playerId,
            ...(free || (owedEnergy === 0 && offer.power.length === 0)
              ? {}
              : { optInCost: { energy: owedEnergy, power: [...offer.power] } }),
            type: "ability",
          },
          sourceCardId: spec.cardId,
          type: "opt-in",
        } as unknown as RiftboundGameState["pendingChoice"];
        return "prompted";
      }
      optional = null;
      patchPlayItem(draft, item.id, { optional: null });
    }

    // rule 357 — pay through the ONE cost computation.
    const { extras, free } = costExtrasFor(io, spec, optional ?? undefined);
    const meta = typeof io.cards?.getCardMeta === "function" ? createMetaAccessor(io.cards) : undefined;
    if (!free && draft.runePools[spec.playerId] !== undefined) {
      const cost = computePlayResourceCost(draft, spec.playerId, spec.cardId, extras, meta, false);
      if (!canPayResourceCost(draft, spec.playerId, spec.cardId, cost)) {
        // rule 357.1.a / 429.3.a (ruling cac9ff02562631c6) — recyclable runes:
        // ask instead of silently undoing; accept only once the pool covers it.
        if (
          progress.payAsked !== true &&
          canPayResourceCost(withRecyclableRunes(io, spec.playerId), spec.playerId, spec.cardId, cost)
        ) {
          patchPlayItem(draft, item.id, { payAsked: true });
          draft.pendingChoice = {
            playConfirm: true,
            playItemId: item.id,
            playerId: spec.playerId,
            resolved: {
              cardId: spec.cardId,
              controller: spec.playerId,
              optInCost: { energy: cost.energy, power: powerPipsOf(cost) },
              type: "ability",
            },
            sourceCardId: spec.sourceCardId ?? spec.cardId,
            type: "opt-in",
          } as unknown as RiftboundGameState["pendingChoice"];
          return "prompted";
        }
        // rule 419.2.a / 358.5 — no longer affordable: the play is undone.
        abortEffectPlay(io, item);
        return "done";
      }
      payResourceCost(
        draft,
        spec.playerId,
        spec.cardId,
        computePlayResourceCost(draft, spec.playerId, spec.cardId, extras, meta, true),
      );
    }

    // rule 359.3 — the spell becomes a spell item in the SLOT the pending play
    // occupied (337.1.b / 340.1: finalizing never reorders the Chain).
    const slot = (draft.interaction?.chain?.items ?? []).findIndex((it) => it.id === item.id);
    if (draft.interaction) {
      (draft as { interaction?: RiftboundGameState["interaction"] }).interaction = removeChainItem(draft.interaction, item.id);
    }
    putPlayedSpellOnChain(io, {
      cardId: spec.cardId,
      playerId: spec.playerId,
      // rule 820.1.c — the [Repeat] elected (and paid) above buys the extra executions.
      ...(optional?.id === REPEAT_COST_ID ? { repeatCount: optional.repeatCount ?? 1 } : {}),
      resolveTo: spec.recycleAfter ? "mainDeck" : "trash",
      via: spec.via,
    });
    const chain = draft.interaction?.chain;
    if (chain && slot >= 0 && slot < chain.items.length - 1) {
      const items = [...chain.items];
      const [spellItem] = items.splice(items.length - 1, 1);
      items.splice(slot, 0, spellItem as (typeof items)[number]);
      (draft as { interaction?: RiftboundGameState["interaction"] }).interaction = {
        ...draft.interaction,
        chain: { ...chain, items },
      } as RiftboundGameState["interaction"];
    }
  }

  // "…play it. Then / If you do, …" — the follow-up sees the played card.
  if (spec.then !== undefined) {
    executeEffect(spec.then as never, {
      ...buildEffectContext(draft, spec.playerId, spec.sourceCardId ?? spec.cardId, io as never),
      boundTargets: [spec.cardId],
      triggerSourceId: spec.cardId,
      ...(enteredAt ? { sameZone: enteredAt } : {}),
    } as never);
  }
  // rule 319 — the play changed the board: statics / state-based checks now
  // (a battlefield the played unit re-occupies keeps its controller, 323.6).
  if (typeof io.counters?.getCounter === "function" && typeof io.zones?.getCardsInZone === "function") {
    cleanupAndFireDeaths(draft, io as unknown as PostMoveCleanupContext);
  }
  return "done";
}

/**
 * rules 355–359 for a PERMANENT an effect plays, as filters over the
 * play-options model: location (355.2) → mandatory cost object (356.2.a.1) →
 * optional "kill a friendly unit" (356.2.b) → optional resource cost
 * (Accelerate printed/granted, "you may pay …", XP-for-discount — 355.1.a) →
 * pay the surviving option's total (357) → enter (359.2, 337.2). Returns
 * "entered" once the card is on the board (the caller runs `then` + Cleanup).
 */
function continuePermanentEffectPlay(io: PlayIO, item: PendingPlayItem): "prompted" | "done" | "entered" {
  const { draft } = io;
  const spec = item.play;
  const progress = spec.progress;
  let options = permanentEffectPlayOptions(io, spec, progress.from);

  if (options.length === 0) {
    // rule 357.1.a / 429.3.a (ruling cac9ff02562631c6, ogn-194-298 Nocturne) — an
    // empty pool with a rune still recyclable is not "unaffordable", it is unpaid:
    // ask (rune moves stay legal while the prompt is open) instead of undoing.
    const projected =
      progress.payAsked !== true ? permanentEffectPlayOptions(io, spec, progress.from, withRecyclableRunes(io, spec.playerId)) : [];
    const cheapest = projected.toSorted((a, b) => a.quote.energy + a.quote.any - (b.quote.energy + b.quote.any))[0];
    if (cheapest) {
      const pips: string[] = [];
      for (const [d, n] of Object.entries(cheapest.quote.power)) {
        for (let i = 0; i < n; i++) {
          pips.push(d);
        }
      }
      for (let i = 0; i < cheapest.quote.any; i++) {
        pips.push("rainbow");
      }
      patchPlayItem(draft, item.id, { payAsked: true });
      draft.pendingChoice = {
        playConfirm: true,
        playItemId: item.id,
        playerId: spec.playerId,
        resolved: {
          cardId: spec.cardId,
          controller: spec.playerId,
          optInCost: { energy: cheapest.quote.energy, power: pips },
          type: "ability",
        },
        sourceCardId: spec.sourceCardId ?? spec.cardId,
        type: "opt-in",
      } as unknown as RiftboundGameState["pendingChoice"];
      return "prompted";
    }
    // rule 419.2.a / 358.3.a / 358.5 — nowhere legal or not payable: the play is undone.
    abortEffectPlay(io, item);
    return "done";
  }

  // rule 355.2 — location: the distinct destinations of the options.
  let location = progress.location;
  if (location === undefined) {
    const destinations = [...new Set(options.map((o) => o.destination))];
    if (destinations.length > 1) {
      draft.pendingChoice = {
        cardId: spec.cardId,
        options: destinations,
        playItemId: item.id,
        playerId: spec.playerId,
        sourceCardId: spec.sourceCardId ?? spec.cardId,
        type: "choose-destination",
      } as unknown as RiftboundGameState["pendingChoice"];
      return "prompted";
    }
    location = destinations[0] as string;
    patchPlayItem(draft, item.id, { location });
  }
  options = options.filter((o) => o.destination === location);
  if (options.length === 0) {
    abortEffectPlay(io, item);
    return "done";
  }

  // rule 356.2.a.1 — a MANDATORY object cost (kill a friendly unit / return a gear):
  // the performer names the object among those the options can pay with here.
  const printedCost = getOptionalPlayCost(spec.cardId);
  const mandatoryId =
    printedCost?.mandatory === true && (printedCost.kind === "kill" || printedCost.kind === "return-to-hand")
      ? printedCost.kind
      : undefined;
  if (mandatoryId) {
    let chosen = progress.mandatoryObjects?.[0];
    if (chosen === undefined) {
      const candidates = [...new Set(options.map((o) => objectOf(o, mandatoryId)).filter((x): x is string => x !== undefined))];
      if (candidates.length > 1 && progress.mandatoryAsked !== true) {
        patchPlayItem(draft, item.id, { mandatoryAsked: true });
        draft.pendingChoice = {
          effect: { type: "noop" },
          options: candidates,
          playCostId: mandatoryId,
          playItemId: item.id,
          playerId: spec.playerId,
          remaining: 1,
          sourceCardId: spec.cardId,
          type: "choose-target",
        } as unknown as RiftboundGameState["pendingChoice"];
        return "prompted";
      }
      chosen = candidates[0] as string;
      patchPlayItem(draft, item.id, { mandatoryObjects: [chosen] });
    }
    options = options.filter((o) => objectOf(o, mandatoryId) === chosen);
  } else if (options.some((o) => pays(o, ADDITIONAL_COST_IDS.kill))) {
    // rule 355.1.a / 356.2.b (unl-170-219) — the OPTIONAL "kill a friendly unit":
    // offered while an option pays it; declinable while one does not (357.3).
    let killObjects = progress.killObjects;
    if (killObjects === undefined) {
      const candidates = [...new Set(options.map((o) => objectOf(o, ADDITIONAL_COST_IDS.kill)).filter((x): x is string => x !== undefined))];
      if (candidates.length > 0 && progress.killAsked !== true) {
        patchPlayItem(draft, item.id, { killAsked: true });
        draft.pendingChoice = {
          effect: { type: "noop" },
          optional: options.some((o) => !pays(o, ADDITIONAL_COST_IDS.kill)),
          options: candidates,
          playCostId: ADDITIONAL_COST_IDS.kill,
          playCostOptional: true,
          playItemId: item.id,
          playerId: spec.playerId,
          remaining: 1,
          sourceCardId: spec.cardId,
          type: "choose-target",
        } as unknown as RiftboundGameState["pendingChoice"];
        return "prompted";
      }
      killObjects = null;
      patchPlayItem(draft, item.id, { killObjects: null });
    }
    const victim = killObjects?.[0];
    options = options.filter((o) => objectOf(o, ADDITIONAL_COST_IDS.kill) === victim);
  }

  // rule 355.1.a / 356.2.b — the OPTIONAL resource cost (one id per card): offered
  // iff some remaining option pays it; the prompt shows what it adds on top.
  const resourceId = RESOURCE_OPTIONAL_IDS.find((id) => options.some((o) => pays(o, id)));
  let optional = progress.optional;
  if (resourceId !== undefined && optional === undefined) {
    const withIt = options.filter((o) => pays(o, resourceId));
    const without = options.filter((o) => !pays(o, resourceId));
    if (withIt.length > 0 && progress.offered === undefined) {
      const paid = withIt[0] as UnitPlayOption;
      const base = without[0];
      const spec0 = (paid.selection.paid?.[resourceId] as { spec?: { energy?: number; power?: readonly string[]; xp?: number } } | true | undefined);
      const shape = spec0 === true || spec0 === undefined ? undefined : spec0.spec;
      const owedEnergy = Math.max(0, paid.quote.energy - (base?.quote.energy ?? 0));
      const owedPower = [...(shape?.power ?? [])];
      const offer: OptionalCostOffer = { energy: owedEnergy, entersReady: paid.total.entersReady, id: resourceId, power: owedPower };
      patchPlayItem(draft, item.id, { offered: offer });
      draft.pendingChoice = {
        playCostId: resourceId,
        playItemId: item.id,
        playerId: spec.playerId,
        resolved: {
          cardId: spec.cardId,
          controller: spec.playerId,
          // rule 356.5.a / 356.4.f.1 — an election that costs nothing (any-and-all,
          // fully discounted) is still made and still counts as paid.
          ...(paid.quote.free || (owedEnergy === 0 && owedPower.length === 0 && (shape?.xp ?? 0) === 0)
            ? {}
            : { optInCost: { energy: owedEnergy, power: owedPower, ...((shape?.xp ?? 0) > 0 ? { xp: shape?.xp } : {}) } }),
          type: "ability",
        },
        sourceCardId: spec.cardId,
        type: "opt-in",
      } as unknown as RiftboundGameState["pendingChoice"];
      return "prompted";
    }
    optional = null;
    patchPlayItem(draft, item.id, { optional: null });
  }
  if (resourceId !== undefined) {
    options = options.filter((o) => pays(o, resourceId) === (optional !== null && optional !== undefined));
  }
  const option = options[0];
  if (!option) {
    // The elected combination stopped being payable meanwhile (419.2.a / 358.5).
    abortEffectPlay(io, item);
    return "done";
  }

  // rule 357 — pay the option's own total (resources as ONE assignment, XP, the
  // cost-kill / returned gear through their effects — 357.2.a).
  const paid = payUnitPlayCosts(draft, io, option);

  // rule 359.2 / 337.2 — the item leaves the Chain and the permanent enters at once.
  if (draft.interaction) {
    (draft as { interaction?: RiftboundGameState["interaction"] }).interaction = removeChainItem(draft.interaction, item.id);
  }
  enterPlayedPermanent(io, {
    cardId: spec.cardId,
    entersReady: paid.entersReady,
    entryZone: option.destination,
    from: progress.from,
    paidAdditionalCost: paid.paidAdditionalCost,
    paidIds: paid.paidIds,
    playerId: spec.playerId,
    via: spec.via,
    ...(spec.stagedBy ? { stagedBy: spec.stagedBy } : {}),
    ...(spec.stun ? { stun: true } : {}),
  });
  return "entered";
}

/**
 * Record a prompt answer for a pending play item (called by
 * `resolvePendingChoice`); the wrapper's finalization pass then re-enters
 * {@link continueEffectPlay}.
 */
export function recordEffectPlayAnswer(
  draft: RiftboundGameState,
  itemId: string,
  answer:
    | { readonly kind: "confirm"; readonly accept: boolean }
    | { readonly kind: "location"; readonly zoneId: string }
    | { readonly kind: "optional"; readonly accept: boolean }
    | { readonly kind: "mandatory"; readonly objectId: string }
    | { readonly kind: "kill"; readonly objectId: string | null },
): void {
  const item = pendingPlayItems(draft).find((it) => it.id === itemId);
  if (!item) {
    return;
  }
  switch (answer.kind) {
    case "confirm":
      patchPlayItem(draft, itemId, { confirmed: answer.accept });
      return;
    case "location":
      patchPlayItem(draft, itemId, { location: answer.zoneId });
      return;
    case "mandatory":
      patchPlayItem(draft, itemId, { mandatoryObjects: [answer.objectId] });
      return;
    // rule 356.2.b — the optional kill cost: a named victim, or null (declined).
    case "kill":
      patchPlayItem(draft, itemId, {
        killObjects: answer.objectId === null ? null : [answer.objectId],
      });
      return;
    case "optional":
      patchPlayItem(draft, itemId, {
        optional: answer.accept && item.play.progress.offered ? item.play.progress.offered : null,
      });
      return;
  }
}
