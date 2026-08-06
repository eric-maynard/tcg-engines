/**
 * playUnit move (split from cards.ts).
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import { fireTriggers } from "../../../abilities/trigger-runner";
import { resolveTarget } from "../../../abilities/target-resolver";
import { createInteractionState, getTurnState, isLegalTiming } from "../../../chain";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";
import { canPlayViaAmbush } from "../../../keywords/keyword-effects";
import {
  extractBattlefieldId,
  getBattlefieldZoneId,
  isBattlefieldZone,
} from "../../../zones/zone-configs";
import {
  staticEnterReadyApplies,
  canPlayToOpenBattlefield,
  playOnlyToConqueredBattlefield,
  consumeEntersReadyReplacement,
  getOptionalPlayCost,
  createMetaAccessor,
  getPotentialRuneEnergy,
  canAffordCard,
  deductCost,
} from "./cost";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * rule-id: unl-178-219 (rule 560) — resolve a unit's payable optional cost
 * (Accelerate / "you may pay" / "you may spend N XP") into the net rune-cost
 * delta and XP to spend. Returns undefined when the card has no such cost or
 * the player lacks the XP; an "I cost [N] less" rider nets against the extra
 * energy (so `energy` may be negative).
 */
function resolvePayableOptionalCost(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
):
  | { kind: "accelerate" | "pay"; energy: number; power: readonly string[]; xp: number }
  | undefined {
  const optional = getOptionalPlayCost(cardId);
  if (optional?.kind !== "accelerate" && optional?.kind !== "pay") {
    return undefined;
  }
  const xp = optional.cost?.xp ?? 0;
  if (xp > 0 && (state.players[playerId]?.xp ?? 0) < xp) {
    return undefined;
  }
  // The discount rider is only honoured on the XP path (the reducer spends XP
  // before charging runes); rune-paid extras with a rider are not yet netted.
  const discount = xp > 0 ? (optional.energyDiscount ?? 0) : 0;
  return {
    energy: (optional.cost?.energy ?? 0) - discount,
    kind: optional.kind,
    power: optional.cost?.power ?? [],
    xp,
  };
}

/**
 * Play a unit to Base (rule 554)
 */
export const playUnit: Defs["playUnit"] = {
  condition: (state, context) => {
    if (state.status !== "playing") {
      return false;
    }
    if (state.pendingChoice) {
      return false;
    }
    // rule-id: ogn-026-298 — "opponents can't play cards this turn".
    if (state.cannotPlayCardsThisTurn?.[context.params.playerId as string]) {
      return false;
    }

    const zone = context.zones.getCardZone(context.params.cardId as CoreCardId);
    if (zone !== "hand") {
      return false;
    }

    // Rule 103 / 555: only the card's owner may play it.
    const owner = context.cards.getCardOwner(context.params.cardId as CoreCardId);
    if (owner !== context.params.playerId) {
      return false;
    }

    // Rule 577.3.c (Ambush): a unit with Ambush may be played to a
    // Battlefield where the player has friendly units, as a Reaction.
    // Otherwise the unit must be played on its controller's turn during
    // The main phase to the player's base.
    const location = context.params.location as string | undefined;
    const targetIsBattlefield = Boolean(location) && isBattlefieldZone(location);
    const registry = getGlobalCardRegistry();
    const hasAmbush = registry.hasKeyword(context.params.cardId, "Ambush");

    const targetBfId = targetIsBattlefield ? extractBattlefieldId(location ?? "") : null;
    const targetBf = targetBfId ? state.battlefields?.[targetBfId] : undefined;
    // Rule 355.2.a: a Battlefield the controller controls is a default
    // valid play location for any unit at standard main-phase timing.
    const targetIsControlledBf =
      Boolean(targetBf) && targetBf?.controller === (context.params.playerId as string);
    const standardTimingOk =
      state.turn.activePlayer === context.params.playerId &&
      state.turn.phase === "main" &&
      getTurnState(state.interaction ?? createInteractionState()) === "neutral-open";

    // Rule sfd-015-221: "Play me only to a battlefield you conquered this
    // turn" — base and any other battlefield are illegal destinations.
    if (playOnlyToConqueredBattlefield(context.params.cardId as string)) {
      const conquered = state.conqueredThisTurn?.[context.params.playerId as string] ?? [];
      if (!targetBfId || !standardTimingOk || !conquered.includes(targetBfId)) {
        return false;
      }
    } else if (targetIsBattlefield && targetIsControlledBf && standardTimingOk) {
      // Rule 355.2.a: controlled battlefield — legal for any unit.
    } else if (
      targetIsBattlefield &&
      targetBf &&
      !targetBf.controller &&
      standardTimingOk &&
      canPlayToOpenBattlefield(
        state,
        context.zones,
        context.params.cardId as string,
        context.params.playerId as string,
      )
    ) {
      // Rule ogn-174-298 / ogn-193-298: static play-restriction ("You may
      // play me to an open battlefield"), or a friendly board unit granting
      // "Friendly units may be played to open battlefields", lets a unit be
      // played to an uncontrolled battlefield at standard main-phase timing.
    } else if (targetIsBattlefield && !hasAmbush) {
      return false;
    } else if (targetIsBattlefield) {
      // Ambush path: relax phase / active-player gating and permit the
      // Unit to be played directly to the target battlefield.
      const bfId = extractBattlefieldId(location ?? "");
      if (!bfId) {
        return false;
      }
      const bfZoneId = getBattlefieldZoneId(bfId);
      const unitsAtBattlefield = context.zones.getCardsInZone(
        bfZoneId as CoreZoneId,
        context.params.playerId as CorePlayerId,
      );
      const hasFriendlyUnits = unitsAtBattlefield.length > 0;
      // Reaction timing is always legal per `isLegalTiming("reaction", ...)`
      // Regardless of chain/showdown state, so we treat Ambush as
      // Permanently reaction-legal and rely on `canPlayViaAmbush`'s
      // Friendly-units check.
      if (!canPlayViaAmbush(hasAmbush, hasFriendlyUnits, true)) {
        return false;
      }
    } else {
      // Standard play path: active player, main phase.
      if (state.turn.activePlayer !== context.params.playerId) {
        return false;
      }
      if (state.turn.phase !== "main") {
        return false;
      }
      // Rule 140.1.b/c + 508.1.a: Playing a Unit is a Discretionary Action,
      // legal only in a Neutral Open state (no chain, no showdown).
      const interaction = state.interaction ?? createInteractionState();
      if (getTurnState(interaction) !== "neutral-open") {
        return false;
      }
    }

    // rule-id: unl-178-219 (rule 560) — when paying an optional cost with an
    // "I cost [N] less" rider, affordability is tested against the discounted
    // base cost. Surcharges stay unchecked here: the reducer skips an
    // unaffordable extra and plays the unit unpaid.
    const payable = context.params.paidAdditionalCost
      ? resolvePayableOptionalCost(
          state,
          context.params.playerId as string,
          context.params.cardId as string,
        )
      : undefined;
    // rule-id: ven-096-166 — board/trash access so self-scaled and friendly
    // static cost reductions (rule 466) apply to unit plays.
    const board = { cards: context.cards, zones: context.zones };
    if (
      !canAffordCard(
        state,
        context.params.playerId,
        context.params.cardId,
        payable && payable.energy < 0
          ? { additionalCost: { energy: payable.energy }, board }
          : { board },
        createMetaAccessor(context.cards),
        getPotentialRuneEnergy(context.zones, context.counters, context.params.playerId),
      )
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
    // Rule ven-123-166 / 577.3.c: Ambush lets a unit be played to a
    // battlefield with friendly units at reaction timing, so the
    // active-player / main-phase / neutral-open gates only govern the
    // standard base-play path — do not early-return here.
    const interaction = state.interaction ?? createInteractionState();
    const standardTiming =
      state.turn.activePlayer === (context.playerId as string) &&
      state.turn.phase === "main" &&
      getTurnState(interaction) === "neutral-open";

    const registry = getGlobalCardRegistry();
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
    const affordPool = { energy: pool.energy + potential, power: pool.power };
    const board = { cards: context.cards, zones: context.zones };
    const metaForAfford = createMetaAccessor(context.cards);

    const handCards = context.zones.getCardsInZone(
      "hand" as CoreZoneId,
      context.playerId as CorePlayerId,
    );

    const results: RiftboundMoves["playUnit"][] = [];
    for (const cardId of handCards) {
      const def = registry.get(cardId as string);
      if (!def || def.cardType !== "unit") {
        continue;
      }
      // Rule 560 / 717: when the unit declares a payable optional additional
      // play-cost, build the paid variant so callers can elect to pay it.
      // rule-id: unl-178-219 — an XP cost with an "I cost [N] less" rider can
      // make the paid variant affordable even when the unpaid play is not.
      const payable = resolvePayableOptionalCost(state, context.playerId as string, cardId as string);
      const paidVariant =
        payable &&
        registry.canAfford(cardId as string, {
          ...affordPool,
          energy: affordPool.energy - payable.energy,
        }) &&
        payable.power.every(
          (d) => (affordPool.power[d as keyof typeof affordPool.power] ?? 0) >= 1,
        )
          ? ({
              additionalCostSpec: {
                energy: payable.energy,
                power: payable.power,
                ...(payable.xp > 0 ? { xp: payable.xp } : {}),
              },
              cardId: cardId as string,
              location: "base",
              paidAdditionalCost: true,
              playerId: context.playerId as string,
            } satisfies RiftboundMoves["playUnit"])
          : undefined;

      // rule-id: ven-096-166 — gate on canAffordCard with board access so
      // self-scaled / friendly static cost reductions are visible here.
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
        if (paidVariant && standardTiming) {
          results.push(paidVariant);
        }
        continue;
      }

      // Rule ven-123-166 / 577.3.c: offer Ambush plays to any battlefield
      // where the player already has friendly units (reaction timing —
      // legal even outside the active player's main phase / neutral-open).
      if (registry.hasKeyword(cardId as string, "Ambush")) {
        for (const bfId of Object.keys(state.battlefields ?? {})) {
          const bfZoneId = getBattlefieldZoneId(bfId);
          const friendly = context.zones.getCardsInZone(
            bfZoneId as CoreZoneId,
            context.playerId as CorePlayerId,
          );
          if (friendly.length > 0) {
            results.push({
              cardId: cardId as string,
              location: bfZoneId as string,
              playerId: context.playerId as string,
            });
          }
        }
      }

      if (!standardTiming) {
        continue;
      }

      // Rule sfd-015-221: only battlefields conquered this turn are legal.
      if (playOnlyToConqueredBattlefield(cardId as string)) {
        const conquered = state.conqueredThisTurn?.[context.playerId as string] ?? [];
        for (const bfId of conquered) {
          if (!state.battlefields?.[bfId]) {
            continue;
          }
          const bfZoneId = getBattlefieldZoneId(bfId) as string;
          if (results.some((r) => r.cardId === (cardId as string) && r.location === bfZoneId)) {
            continue;
          }
          results.push({
            cardId: cardId as string,
            location: bfZoneId,
            playerId: context.playerId as string,
          });
        }
        continue;
      }

      results.push({
        cardId: cardId as string,
        location: "base",
        playerId: context.playerId as string,
      });

      // Rule 355.2.a: a Battlefield the controller controls is a default
      // valid play location.
      for (const [bfId, bf] of Object.entries(state.battlefields ?? {})) {
        if (bf.controller !== (context.playerId as string)) {
          continue;
        }
        const bfZoneId = getBattlefieldZoneId(bfId) as string;
        if (results.some((r) => r.cardId === (cardId as string) && r.location === bfZoneId)) {
          continue;
        }
        results.push({
          cardId: cardId as string,
          location: bfZoneId,
          playerId: context.playerId as string,
        });
      }

      // Rule ogn-174-298 / ogn-193-298: offer open (uncontrolled)
      // battlefields when the card carries a static play-restriction
      // permitting it, or a friendly board unit grants it.
      if (
        canPlayToOpenBattlefield(
          state,
          context.zones,
          cardId as string,
          context.playerId as string,
        )
      ) {
        for (const [bfId, bf] of Object.entries(state.battlefields ?? {})) {
          const bfZoneId = getBattlefieldZoneId(bfId) as string;
          if (results.some((r) => r.cardId === (cardId as string) && r.location === bfZoneId)) {
            continue;
          }
          if (!bf.controller) {
            results.push({
              cardId: cardId as string,
              location: getBattlefieldZoneId(bfId) as string,
              playerId: context.playerId as string,
            });
          }
        }
      }

      // Rule 560 / 717: when the unit declares an optional additional
      // play-cost, also enumerate the paid variant so callers can elect
      // to pay it.
      const optional = getOptionalPlayCost(cardId as string);
      if (paidVariant) {
        results.push(paidVariant);
      } else if (optional?.kind === "kill") {
        const killDescriptor = {
          ...(optional.kill as Record<string, unknown>),
          quantity: "all" as const,
        };
        const sacrificeOptions = resolveTarget(
          killDescriptor as Parameters<typeof resolveTarget>[0],
          {
            cards: context.cards as Parameters<typeof resolveTarget>[1]["cards"],
            draft: state,
            playerId: context.playerId as string,
            sourceCardId: cardId as string,
            zones: context.zones,
          },
        );
        for (const sacrificeId of sacrificeOptions) {
          results.push({
            cardId: cardId as string,
            location: "base",
            paidAdditionalCost: true,
            playerId: context.playerId as string,
            sacrificeId,
          });
        }
      }
    }
    return results;
  },
  reducer: (draft, context) => {
    const { cardId, playerId, location, paidAdditionalCost, additionalCostSpec, sacrificeId } =
      context.params;
    const { zones, counters } = context;

    // Rule 560: optional additional cost. Re-derive from the card definition
    // instead of trusting client-supplied additionalCostSpec/sacrificeId — a
    // multiplayer client could otherwise trash an opponent's card or claim an
    // Accelerate benefit the card doesn't have.
    const optional = paidAdditionalCost ? getOptionalPlayCost(cardId) : undefined;
    // rule-id: unl-178-219 (rule 560) — "spend N XP as an additional cost; if
    // you do, I cost [N] less": spend the XP up front and charge the
    // discounted base cost. XP is only spent when the discounted play is
    // affordable so a rejected payment leaves the total untouched.
    let xpPaid = false;
    let energyDiscount = 0;
    if (optional?.kind === "accelerate" || optional?.kind === "pay") {
      const xpNeed = optional.cost?.xp ?? 0;
      const player = draft.players[playerId];
      if (xpNeed > 0 && player && player.xp >= xpNeed) {
        player.xp -= xpNeed;
        xpPaid = true;
        energyDiscount = optional.energyDiscount ?? 0;
      }
    }

    // rule-id: ven-096-166 — board/trash access for static cost reductions.
    const board = { cards: context.cards, zones };
    deductCost(
      draft,
      playerId,
      cardId,
      energyDiscount > 0 ? { additionalCost: { energy: -energyDiscount }, board } : { board },
      createMetaAccessor(context.cards),
    );

    let paidAccelerate = false;
    let paidAdditionalCostActual = false;
    if (paidAdditionalCost) {
      const pool = draft.runePools[playerId];
      if ((optional?.kind === "accelerate" || optional?.kind === "pay") && pool) {
        const need = optional.cost ?? {};
        const xpOk = (need.xp ?? 0) === 0 || xpPaid;
        const canPay =
          xpOk &&
          pool.energy >= (need.energy ?? 0) &&
          (need.power ?? []).every((d: string) => (pool.power[d as keyof typeof pool.power] ?? 0) >= 1);
        if (canPay) {
          pool.energy -= need.energy ?? 0;
          for (const domain of need.power ?? []) {
            const key = domain as keyof typeof pool.power;
            pool.power[key] = (pool.power[key] ?? 0) - 1;
          }
          paidAccelerate = optional.kind === "accelerate";
          paidAdditionalCostActual = true;
        }
      } else if (optional?.kind === "kill" && sacrificeId) {
        const owner = context.cards.getCardOwner(sacrificeId as CoreCardId);
        const zone = context.zones.getCardZone(sacrificeId as CoreCardId);
        const inPlay =
          zone === "base" ||
          (typeof zone === "string" && zone.startsWith("battlefield-"));
        const kind = getGlobalCardRegistry().get(sacrificeId as string)?.cardType;
        const okType =
          !optional.kill?.type ||
          optional.kill.type === "permanent" ||
          optional.kill.type === kind;
        if (owner === playerId && inPlay && sacrificeId !== cardId && okType) {
          zones.moveCard({
            cardId: sacrificeId as CoreCardId,
            targetZoneId: "trash" as CoreZoneId,
          });
          paidAdditionalCostActual = true;
        }
      }
    }

    zones.moveCard({
      cardId: cardId as CoreCardId,
      targetZoneId: location as CoreZoneId,
    });

    // Rule 143.4: units enter exhausted unless a static "I enter ready"
    // effect (enter-ready) says otherwise (e.g. Eager Drakehound sfd-006-221),
    // Accelerate was paid (rule 717), or a runtime `enters-ready` replacement
    // (rule 571 — Sun Disc ogn-021-298) applies.
    // rule-id: unl-052-219 — the "next unit you play" replacement is consumed
    // by this unit regardless of other enter-ready sources, so evaluate it
    // first (it may also carry a Buff rider for the entering unit).
    const replacedReady = consumeEntersReadyReplacement(draft, playerId, {
      cardId,
      ctx: { cards: context.cards, counters, zones },
    });
    // rule-id: ven-091-166 — a conditional "I enter ready" static must have
    // its condition evaluated at play time (e.g. score not within 3 of the
    // Victory Score); an unconditional one always applies.
    const entersReady =
      replacedReady || staticEnterReadyApplies(cardId, draft, playerId) || paidAccelerate;
    if (!entersReady) {
      counters.setFlag(cardId as CoreCardId, "exhausted", true);
    }

    // Fire "play-self" and "play-card" triggers BEFORE incrementing the
    // Rule-724 counter, so a Legion trigger on this card itself cannot
    // Satisfy its own condition — it must observe the count of cards
    // That were played EARLIER in this turn.
    fireTriggers(
      { cardId, paidAdditionalCost: paidAdditionalCostActual, playerId, type: "play-self" },
      { cards: context.cards, counters, draft, zones },
    );
    fireTriggers(
      { cardId, cardType: "unit", playerId, type: "play-card" },
      { cards: context.cards, counters, draft, zones },
    );

    // Rule 724 (Legion) tracker: count this play so subsequent cards
    // Can satisfy their Legion conditions. Runes are NOT counted.
    if (draft.cardsPlayedThisTurn) {
      draft.cardsPlayedThisTurn[playerId] = (draft.cardsPlayedThisTurn[playerId] ?? 0) + 1;
    }

    // rule-id: ven-041-166-weaponmaster-on-play-equip
    // Weaponmaster is a `{type:"keyword"}` ability, so trigger-matcher never
    // schedules it. Surface the "you may Equip … for [rainbow] less" prompt
    // directly: when the just-played unit has Weaponmaster and the player
    // owns any on-board equipment, block on a pendingChoice so the
    // controller can pick one (or decline). The reduced Equip cost is
    // charged by the weaponmaster-equip reducer (rule 821.1.c;
    // rule-id: sfd-119-221-weaponmaster-pays-reduced-equip-cost).
    if (
      !draft.pendingChoice &&
      getGlobalCardRegistry().hasKeyword(cardId, "Weaponmaster")
    ) {
      const registry = getGlobalCardRegistry();
      const boardZones: string[] = ["base"];
      for (const bfId of Object.keys(draft.battlefields ?? {})) {
        boardZones.push(getBattlefieldZoneId(bfId));
      }
      const equipOptions: string[] = [];
      for (const zoneId of boardZones) {
        for (const id of zones.getCardsInZone(
          zoneId as CoreZoneId,
          playerId as CorePlayerId,
        )) {
          if (registry.get(id as string)?.cardType === "equipment") {
            equipOptions.push(id as string);
          }
        }
      }
      if (equipOptions.length > 0) {
        draft.pendingChoice = {
          options: equipOptions,
          playerId,
          type: "weaponmaster-equip",
          unitId: cardId,
        };
      }
    }
  },
};
