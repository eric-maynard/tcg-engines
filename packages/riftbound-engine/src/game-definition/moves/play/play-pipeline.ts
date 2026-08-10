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
import {
  extractBattlefieldId,
  getBattlefieldZoneId,
  isBattlefieldZone,
} from "../../../zones/zone-configs";
import {
  addToChain,
  collapseTriggerBatch,
  createInteractionState,
  getActiveShowdown,
  removeChainItem,
} from "../../../chain";
import { executeEffect } from "../../../abilities/effect-executor";
import { buildEffectContext } from "../chain/effect-context";
import { executeResolvedItem } from "../chain/resolve";
import {
  type CostExtras,
  type OptionalPlayCost,
  battlefieldHasEnemyUnits,
  battlefieldIsAttackedBy,
  battlefieldIsOccupiedEnemy,
  battlefieldIsOpen,
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
  discountOptionalPlayCost,
  getGrantedAcceleratePlayCost,
  getOptionalPlayCost,
  hasStaticEffect,
  optionalPlayCostOffered,
  payResourceCost,
  staticEnterReadyApplies,
} from "./cost";
import { collectBoardCards, recordAdditionalCostsPaid } from "./cost-model";
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
    collapseTriggerBatch(draft.interaction, chainLenBeforePlayTriggers);
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
    if (units.length === 1) {
      // rule 818.2 / 819.1.d — the Quick-Draw attach IS "attaching an
      // Equipment", so it must fire attach-equipment triggers (Jax,
      // Unrelenting) exactly as the [Equip] path does.
      attachEquipment(
        {
          cards,
          counters,
          draft,
          fireTriggers: (event: Parameters<typeof fireTriggers>[0]) => fireTriggers(event, trig),
          playerId,
          zones,
        } as never,
        cardId,
        units[0] as string,
      );
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
 * rule 323.6 / 190.4.c (ruling 41251a7db1c8d7f0 — Baited Hook, and the CR's
 * Cruel Patron example) — control of a battlefield rests on having a unit
 * there. An effect that kills a player's LAST unit at a battlefield and then
 * plays a card costs them that battlefield as a destination straight away,
 * even though the recorded `controller` is only cleared by the next Open State
 * (`state-based-checks.ts` step 6). Control that never rested on a unit here
 * (`controllerOccupied` false — a seeded board, or control handed over by an
 * effect) has nothing to vacate and survives, exactly as in that check.
 */
function stillHoldsBattlefield(
  draft: RiftboundGameState,
  io: PlayIO | undefined,
  playerId: string,
  bfId: string,
  sourceCardId?: string,
): boolean {
  if (draft.battlefields?.[bfId]?.controllerOccupied !== true) {
    return true;
  }
  // rule 808 / 734.1.d.2 (ruling 6b62dd3994a5ac1f) — a [Deathknell] plays FROM
  // the dead unit itself, so the battlefield it just vacated is still a legal
  // destination even though nothing of its controller's is left there.
  if (sourceCardId !== undefined && sourceCardId === draft.lastKilledUnitId) {
    return true;
  }
  // rule 309.1 / 323.6 — outside an Open State the recorded control normally
  // stands (a Deathknell whose unit was just killed by an opponent's spell
  // still plays to "its" battlefield). The ruling's exception is narrower: the
  // ability doing the playing is the one that KILLED the player's unit, so by
  // the time it plays the card it has already given the battlefield up.
  if (draft.lastKilledUnitId === undefined || draft.lastKilledUnitController !== playerId) {
    return true;
  }
  const zones = io?.zones;
  if (typeof zones?.getCardsInZone !== "function") {
    return true; // no zone reader (unit-test stubs) — keep the recorded control
  }
  const registry = getGlobalCardRegistry();
  const here = zones.getCardsInZone(getBattlefieldZoneId(bfId as CoreCardId)) as readonly CoreCardId[];
  return here.some((id) => {
    if (registry.getCardType(id as string) !== "unit") {
      return false;
    }
    return (io?.cards?.getCardController?.(id) ?? io?.cards?.getCardOwner?.(id)) === playerId;
  });
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
    /** Supplied by `locationOptionsFor`; enables the 323.6 vacancy check above. */
    readonly io?: PlayIO;
    /** The instructing card, for the Deathknell exception in the same check. */
    readonly sourceCardId?: string;
  },
): string[] {
  const type = getGlobalCardRegistry().getCardType(cardId);
  const isUnit = type !== "gear" && type !== "equipment";
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
      .filter(
        ([bfId, bf]) =>
          bf.controller === playerId &&
          stillHoldsBattlefield(draft, spec?.io, playerId, bfId, spec?.sourceCardId),
      )
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
  spec: { cardId: string; playerId: string; resolveTo?: "trash" | "mainDeck" | "banishment"; via?: PlayVia },
): void {
  const { draft, zones } = io;
  const spellEffect = (getGlobalCardRegistry().getAbilities(spec.cardId) ?? []).find(
    (a) => a.type === "spell",
  )?.effect;
  zones.moveCard({ cardId: spec.cardId as CoreCardId, targetZoneId: "chain" as CoreZoneId });
  (draft as { interaction?: RiftboundGameState["interaction"] }).interaction = addToChain(
    draft.interaction ?? createInteractionState(),
    {
      cardId: spec.cardId,
      controller: spec.playerId,
      effect: spellEffect,
      resolveTo: spec.resolveTo ?? "trash",
      type: "spell",
    },
    Object.keys(draft.players),
  );
  if (draft.cardsPlayedThisTurn) {
    draft.cardsPlayedThisTurn[spec.playerId] = (draft.cardsPlayedThisTurn[spec.playerId] ?? 0) + 1;
  }
  notePlayThisTurn(draft, spec.playerId, spec.cardId);
  bindPlayedSpellTarget(io, spec.cardId, spec.playerId, spellEffect as SpellTargetShape | undefined);
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

/** rule 356.2.b — an optional additional resource cost the performer may elect (already discounted). */
interface OptionalCostOffer {
  readonly id: string;
  readonly energy: number;
  readonly power: readonly string[];
  readonly entersReady: boolean;
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
      extras.additionalCost = { energy: -(mode.energy ?? 0) };
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
    extras.additionalCost = {
      energy: (extras.additionalCost?.energy ?? 0) + optional.energy,
      power: [...(extras.additionalCost?.power ?? []), ...optional.power],
    };
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
  } else if (locationOptionsFor(io, spec).length === 0) {
    // rule 358.3.a — nowhere the unit may legally enter: impossible, skipped.
    return false;
  }
  const mandatory = mandatoryAdditionalCost(spec.cardId);
  if (mandatory && mandatoryCostCandidates(io, spec, mandatory).length === 0) {
    return false;
  }
  const { extras, free } = costExtrasFor(io, spec);
  if (free || draft.runePools[spec.playerId] === undefined) {
    return true;
  }
  const meta = typeof io.cards?.getCardMeta === "function" ? createMetaAccessor(io.cards) : undefined;
  return canPayResourceCost(
    draft,
    spec.playerId,
    spec.cardId,
    computePlayResourceCost(draft, spec.playerId, spec.cardId, extras, meta, false),
  );
}

/** rule 356.2.a.1 — the card's MANDATORY additional cost (kill / return-to-hand), if any. */
function mandatoryAdditionalCost(cardId: string): OptionalPlayCost | undefined {
  const printed = getOptionalPlayCost(cardId);
  return printed?.mandatory === true && (printed.kind === "kill" || printed.kind === "return-to-hand")
    ? printed
    : undefined;
}

/** Board objects that can pay `cost` for the performer (friendly units to kill / friendly gear to return). */
function mandatoryCostCandidates(
  io: PlayIO,
  spec: EffectPlaySpec,
  cost: OptionalPlayCost,
): string[] {
  const { draft, zones, cards } = io;
  if (typeof zones?.getCardsInZone !== "function") {
    return [];
  }
  const registry = getGlobalCardRegistry();
  const zoneIds = ["base", ...Object.keys(draft.battlefields ?? {}).map((bf) => `battlefield-${bf}`)];
  const out: string[] = [];
  for (const zoneId of zoneIds) {
    for (const seat of Object.keys(draft.players ?? {})) {
      for (const raw of zones.getCardsInZone(zoneId as CoreZoneId, seat as CorePlayerId)) {
        const id = raw as string;
        if (id === spec.cardId || out.includes(id)) {
          continue;
        }
        const controller =
          (cards.getCardController?.(id as CoreCardId) as string | undefined) ??
          (cards.getCardOwner?.(id as CoreCardId) as string | undefined) ??
          seat;
        if (controller !== spec.playerId) {
          continue;
        }
        const type = registry.getCardType(id);
        const isGear = type === "gear" || type === "equipment";
        if (cost.kind === "kill") {
          const want = (cost.kill as { type?: string } | undefined)?.type ?? "unit";
          const ok = want === "permanent" ? type === "unit" || isGear : want === "gear" ? isGear : type === want;
          if (!ok) {
            continue;
          }
        } else if (!isGear) {
          continue;
        }
        out.push(id);
      }
    }
  }
  return out;
}

/** rule 355.2 — the legal entry zones for this instructed play. */
function locationOptionsFor(io: PlayIO, spec: EffectPlaySpec): string[] {
  const { draft, cards } = io;
  if (getGlobalCardRegistry().getCardType(spec.cardId) === "spell") {
    return ["chain"];
  }
  const loc = spec.location ?? "prompt";
  if (loc === "same-as-lki") {
    // rule 354.2 / 355.2 (ven-066-166) — "to the same location": where the OLD
    // object was (last-known information), never a choice.
    const lki = (cards.getCardMeta?.(spec.cardId as CoreCardId) as { banishedFrom?: string } | undefined)
      ?.banishedFrom;
    return lki && isBoardZoneId(lki) ? playDestinationOptions(draft, spec.playerId, spec.cardId, { only: [lki] }) : [];
  }
  if (loc === "prompt") {
    return [
      ...playDestinationOptions(draft, spec.playerId, spec.cardId, {
        extra: selfGrantedPlayLocations(io, spec),
        io,
        sourceCardId: spec.sourceCardId,
      }),
      ...affordableRedirectDestinations(io, spec),
    ];
  }
  if ("fixed" in loc) {
    return playDestinationOptions(draft, spec.playerId, spec.cardId, { only: [loc.fixed] });
  }
  if ("only" in loc) {
    return playDestinationOptions(draft, spec.playerId, spec.cardId, { only: loc.only });
  }
  return [
    ...playDestinationOptions(draft, spec.playerId, spec.cardId, {
      extra: [...loc.extra, ...selfGrantedPlayLocations(io, spec)],
      io,
      sourceCardId: spec.sourceCardId,
    }),
    ...affordableRedirectDestinations(io, spec),
  ];
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
  if (!openOk && !enemyOk && !enemyUnitsOk && !attackedOk) {
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
      (attackedOk && battlefieldIsAttackedBy(draft, bfId, spec.playerId))
    ) {
      out.push(`battlefield-${bfId}`);
    }
  }
  return out;
}

/**
 * rule 355.2.b / 356.2 (ven-157-166) — battlefields that make THEMSELVES Valid
 * destinations for this play in exchange for an optional additional cost, kept
 * only while the performer can still pay the whole cost (357.3 — never offer an
 * election that makes the play illegal).
 */
function affordableRedirectDestinations(io: PlayIO, spec: EffectPlaySpec): string[] {
  const { draft } = io;
  const out: string[] = [];
  for (const bfId of Object.keys(draft.battlefields ?? {})) {
    const zone = `battlefield-${bfId}`;
    if (!redirectPipsFor(draft, spec, zone) || battlefieldForbidsUnitPlays(bfId)) {
      continue;
    }
    const { extras, free } = costExtrasFor(io, spec, undefined, zone);
    if (!free && draft.runePools[spec.playerId] !== undefined) {
      const meta = typeof io.cards?.getCardMeta === "function" ? createMetaAccessor(io.cards) : undefined;
      if (
        !canPayResourceCost(
          draft,
          spec.playerId,
          spec.cardId,
          computePlayResourceCost(draft, spec.playerId, spec.cardId, extras, meta, false),
        )
      ) {
        continue;
      }
    }
    out.push(zone);
  }
  return out;
}

/**
 * rule 355.1.a / 356.2.b / 805.2 — the OPTIONAL additional resource cost the
 * performer may still elect on an instructed play (printed Accelerate / "you
 * may pay …", or Accelerate granted to non-hand plays — sfd-029-221), already
 * discounted by "optional additional costs cost less" statics (356.4.c).
 * `undefined` when the card has none, its gate is unmet, or it is unpayable
 * together with the rest of the cost.
 */
function payableOptionalCost(
  io: PlayIO,
  spec: EffectPlaySpec,
  location?: string,
): OptionalCostOffer | undefined {
  const { draft, cards, zones } = io;
  const board =
    typeof zones?.getCardsInZone === "function" && typeof cards?.getCardOwner === "function"
      ? { cards, zones }
      : undefined;
  const printed = getOptionalPlayCost(spec.cardId);
  let id: string;
  let raw: { energy?: number; power?: readonly string[]; xp?: number } | undefined;
  let entersReady = false;
  if (printed && (printed.kind === "accelerate" || printed.kind === "pay")) {
    if (!optionalPlayCostOffered(printed, draft, spec.playerId, spec.cardId) || (printed.cost?.xp ?? 0) > 0) {
      return undefined;
    }
    id = printed.kind;
    raw = printed.cost;
    entersReady = printed.kind === "accelerate" || printed.entersReadyIfPaid === true;
  } else if (!printed && board) {
    const granted = getGrantedAcceleratePlayCost(
      spec.cardId,
      spec.playerId,
      collectBoardCards(draft, board),
      spec.via === "hand",
    );
    if (!granted) {
      return undefined;
    }
    id = "accelerate-granted";
    raw = granted;
    entersReady = true;
  } else {
    return undefined;
  }
  const discounted = discountOptionalPlayCost(draft, spec.playerId, raw, board) ?? {
    energy: raw?.energy ?? 0,
    power: raw?.power ?? [],
  };
  const optional = { energy: discounted.energy, entersReady, id, power: [...discounted.power] };
  const { extras, free } = costExtrasFor(io, spec, optional, location);
  if (free || draft.runePools[spec.playerId] === undefined) {
    return optional;
  }
  const meta = typeof cards?.getCardMeta === "function" ? createMetaAccessor(cards) : undefined;
  const affordable = canPayResourceCost(
    draft,
    spec.playerId,
    spec.cardId,
    computePlayResourceCost(draft, spec.playerId, spec.cardId, extras, meta, false),
  );
  return affordable ? optional : undefined;
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
      playConfirmSpec: { ...spec, declinable: false },
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

  // rule 355.2 — location.
  let location = progress.location;
  if (!isSpell && location === undefined) {
    const options = locationOptionsFor(io, spec);
    if (options.length === 0) {
      abortEffectPlay(io, item);
      return "done";
    }
    if (options.length > 1) {
      draft.pendingChoice = {
        cardId: spec.cardId,
        options,
        playItemId: item.id,
        playerId: spec.playerId,
        sourceCardId: spec.sourceCardId ?? spec.cardId,
        type: "choose-destination",
      } as unknown as RiftboundGameState["pendingChoice"];
      return "prompted";
    }
    location = options[0] as string;
    patchPlayItem(draft, item.id, { location });
  }

  // rule 356.2.a.1 — a MANDATORY additional cost is required whatever the cost
  // mode (356.1.b only zeroes base costs); the performer picks the object.
  const mandatory = mandatoryAdditionalCost(spec.cardId);
  let mandatoryObjects = progress.mandatoryObjects;
  if (mandatory && mandatoryObjects === undefined) {
    const candidates = mandatoryCostCandidates(io, spec, mandatory);
    if (candidates.length === 0) {
      abortEffectPlay(io, item);
      return "done";
    }
    if (candidates.length > 1 && progress.mandatoryAsked !== true) {
      patchPlayItem(draft, item.id, { mandatoryAsked: true });
      draft.pendingChoice = {
        effect: { type: "noop" },
        options: candidates,
        playCostId: mandatory.kind,
        playItemId: item.id,
        playerId: spec.playerId,
        remaining: 1,
        sourceCardId: spec.cardId,
        type: "choose-target",
      } as unknown as RiftboundGameState["pendingChoice"];
      return "prompted";
    }
    mandatoryObjects = [candidates[0] as string];
    patchPlayItem(draft, item.id, { mandatoryObjects });
  }

  // rule 355.1.a / 356.2.b — the OPTIONAL additional cost is still the
  // performer's to elect (never for a spell here: its riders are play params).
  let optional = progress.optional;
  if (!isSpell && optional === undefined) {
    const offer =
      spec.offerOptionalCosts === false ? undefined : payableOptionalCost(io, spec, location);
    if (offer && progress.offered === undefined) {
      patchPlayItem(draft, item.id, { offered: offer });
      const free = spec.costMode.kind === "ignore-any-and-all";
      // rule 356.4.f — gate on what the election really costs on top of the
      // (already discounted) play, not on the printed amount.
      const owedEnergy = free ? 0 : optionalCostIncrementEnergy(io, spec, offer, location);
      draft.pendingChoice = {
        playCostId: offer.id,
        playItemId: item.id,
        playerId: spec.playerId,
        resolved: {
          cardId: spec.cardId,
          controller: spec.playerId,
          // rule 356.5.a — under "any and all costs" the amount is zero; the
          // decision still counts as paying it (356.4.f.1).
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

  // rule 357 — pay: resources through the ONE cost computation, then the
  // mandatory object cost through its effect (a real kill / bounce — 357.2.a).
  const { extras, free } = costExtrasFor(io, spec, optional ?? undefined, location);
  const meta = typeof io.cards?.getCardMeta === "function" ? createMetaAccessor(io.cards) : undefined;
  if (!free && draft.runePools[spec.playerId] !== undefined) {
    const cost = computePlayResourceCost(draft, spec.playerId, spec.cardId, extras, meta, false);
    if (!canPayResourceCost(draft, spec.playerId, spec.cardId, cost)) {
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
  for (const objectId of mandatoryObjects ?? []) {
    executeEffect(
      {
        target: { type: mandatory?.kind === "return-to-hand" ? "gear" : "unit" },
        type: mandatory?.kind === "return-to-hand" ? "return-to-hand" : "kill",
      } as never,
      {
        ...buildEffectContext(draft, spec.playerId, spec.cardId, io as never),
        boundTargets: [objectId],
      },
    );
  }

  // rule 359 — the item leaves the Chain: a permanent becomes a Game Object at
  // the chosen location (337.2 — immediately), a spell becomes a spell item —
  // in the SLOT the pending play occupied (337.1.b / 340.1: finalizing never
  // reorders the Chain, so items appended after it still resolve before it).
  const slot = (draft.interaction?.chain?.items ?? []).findIndex((it) => it.id === item.id);
  if (draft.interaction) {
    (draft as { interaction?: RiftboundGameState["interaction"] }).interaction = removeChainItem(draft.interaction, item.id);
  }
  const paidIds = [
    ...(optional ? [optional.id] : []),
    ...(mandatoryObjects && mandatoryObjects.length > 0 && mandatory ? [mandatory.kind] : []),
  ];
  let enteredAt: string | undefined;
  if (isSpell) {
    putPlayedSpellOnChain(io, {
      cardId: spec.cardId,
      playerId: spec.playerId,
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
  } else {
    enteredAt = enterPlayedPermanent(io, {
      cardId: spec.cardId,
      entersReady: optional?.entersReady === true,
      entryZone: location as string,
      from: progress.from,
      paidAdditionalCost: paidIds.length > 0,
      paidIds,
      playerId: spec.playerId,
      via: spec.via,
      ...(spec.stagedBy ? { stagedBy: spec.stagedBy } : {}),
      ...(spec.stun ? { stun: true } : {}),
    });
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
    | { readonly kind: "mandatory"; readonly objectId: string },
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
    case "optional":
      patchPlayItem(draft, itemId, {
        optional: answer.accept && item.play.progress.offered ? item.play.progress.offered : null,
      });
      return;
  }
}
