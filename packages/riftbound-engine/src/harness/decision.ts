/**
 * L1 — Decision derivation and answer resolution.
 *
 * - deriveDecision(): pendingChoice → pick / yes-no / distribute / name;
 *   chain → action(chain); showdown → action(showdown); else action(main).
 * - groupActions(): flat enumerateMoves rows → one ActionOption per
 *   (moveId, primary id) with the varying params exposed as fields.
 * - narrowVariants(): the play bundle as ONE call — filter an option's
 *   variants by PlayArgs, prefer base-cost variants, and either land on one
 *   engine move, report ILLEGAL_ARGS, or describe the follow-up question.
 * - pending-choice answers → resolvePendingChoice params; shorthand coercion.
 *
 * Everything takes a `DecisionContext` (public state + legal-move oracle +
 * card labels) so a UI-snapshot backend can reuse it unchanged.
 */

import type { CardId, PlayerId } from "@tcg/core";
import { costElectionHalves, playCostShortfall, resourceCostShortfall } from "../game-definition/moves/play/cost";
import type { Refusal } from "../game-definition/refusal";
import { refusalOf } from "../game-definition/refusal";

/** The play moves a hand card can be offered through (rule 419.1). */
const PLAY_MOVE_IDS = ["playUnit", "playGear", "playSpell"] as const;

/**
 * rule 164.2.a/b — say a shortfall the way the player fixes it: Energy comes
 * from tapping a rune, Power of a Domain from recycling one of that Domain.
 */
function describeShortfall(short: {
  energy: number;
  power: Record<string, number>;
}): NonNullable<ActionField["needsAdd"]> {
  const pips = Object.entries(short.power)
    .flatMap(([d, n]) => Array.from({ length: n ?? 0 }, () => `[${d}]`))
    .join("");
  const parts = [
    ...(short.energy > 0 ? [`tap ${short.energy === 1 ? "a rune" : `${short.energy} runes`}`] : []),
    ...(pips ? [`recycle a rune for ${pips}`] : []),
  ];
  return {
    ...(short.energy > 0 ? { energy: short.energy } : {}),
    ...(Object.keys(short.power).length > 0 ? { power: short.power } : {}),
    reason: `${parts.join(" and ")} first`,
  };
}
import { costModeOfPlayEffect } from "../abilities/effects/play";
import { hideCostQuote } from "../game-definition/moves/play/hide";
import { instructionCost } from "../game-definition/moves/play/play-pipeline";
import { modeOptionLabel, spellModeLabels } from "../game-definition/moves/play/play-time-modes";
import {
  deflectSurchargeOf,
  pairEffectRoles,
  playTargetPayability,
} from "../game-definition/moves/play/targeting";
import {
  potentialAddsFromMoves,
  promptIsSurcharged,
  promptNeedsAdd,
  surchargePayability,
} from "../game-definition/moves/prompt-cost";
import { getGlobalCardRegistry } from "../operations/card-lookup";
import type { PendingChoice, RiftboundGameState } from "../types/game-state";
import { getActingSeat, getPendingChoiceChooser } from "../views/acting-seat";
import { cardLabel } from "./card-state";
import type { HarnessEngine } from "./internal";
import { canonicalJson, getInternalState } from "./internal";
import type {
  ActionContext,
  ActionDecision,
  ActionField,
  ActionFieldKind,
  ActionOption,
  ReachablePlay,
  ActionVerb,
  Answer,
  AnswerShorthand,
  CardRef,
  Decision,
  DistributeDecision,
  FlatMove,
  HarnessErrorInfo,
  IntegerDecision,
  NameDecision,
  OrderDecision,
  PickDecision,
  PickOption,
  PickSemantics,
  PlayArgs,
  Seat,
  YesNoDecision,
} from "./types";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface DecisionContext {
  readonly state: RiftboundGameState;
  legal(seat: Seat, moveIds?: readonly string[]): FlatMove[];
  label(card: CardRef): string;
  /** Optional legality probe for non-enumerated knobs (X). */
  canExecute?(seat: Seat, moveId: string, params: Record<string, unknown>): boolean;
  /**
   * A refusal must carry its cause. Why a candidate no enumerator offered would
   * be refused — asked of the move's own `condition`, so the answer comes from
   * the site that made the decision (see `game-definition/refusal.ts`). Used
   * when a caller names a destination/group the enumeration does not contain:
   * without it the harness could only say "no legal variant matches", which
   * reads as a claim about the argument rather than about the blocker.
   */
  explain?(seat: Seat, moveId: string, params: Record<string, unknown>): Refusal | undefined;
  /** A seat's hand (owner-scoped). Only needed for the pregame mulligan prompt (rule 117). */
  handOf?(seat: Seat): readonly CardRef[];
  /** A seat's registered battlefields still awaiting its pick (rule 113 / 486.5). */
  registeredBattlefieldsOf?(seat: Seat): readonly CardRef[];
  /**
   * rule 356.4.b / 356.4.c.1 — would playing `cardId` on `targets` offer the
   * caster an "[N] or [rainbow] less" election (both halves payable, different)?
   */
  costElectionLive?(seat: Seat, cardId: CardRef, targets?: readonly string[]): boolean;
  /**
   * rule 809.1.d / 429.3 — the target tuples playing `cardId` may still NAME
   * but cannot yet PAY for: a [Deflect]-surcharged candidate whose surcharge a
   * Reaction [Add] could still fund. 809.1.d drops a candidate only when
   * nothing could fund it, so these stay on the offered list (dimmed) while the
   * play itself keeps being refused — the same contract 43bb893 gave surcharged
   * prompts, one step earlier.
   */
  surchargedPlayTargets?(
    seat: Seat,
    moveId: string,
    cardId: string,
  ): readonly {
    targets: readonly string[];
    surcharge: number;
    /** true when the tuple is offered but not payable from the pool as it stands. */
    unaffordable: boolean;
    /** Set only while `unaffordable`: the smallest top-up that unlocks it. */
    needsAdd?: ActionField["needsAdd"];
  }[];
  /**
   * rule 357.1.a / 429.3 / 356.1.b.2 — for a spell whose effect PLAYS the card
   * it names ("play a unit from your trash, ignoring its Energy cost"), the
   * named candidates whose own remaining cost the pool cannot pay. The spell is
   * castable and the candidate is a legal object, so it stays on the offered
   * list; what a client needs is to dim it and print the pips it owes.
   */
  effectPlayShortfalls?(
    seat: Seat,
    cardId: string,
  ): readonly { target: string; needsAdd: NonNullable<ActionField["needsAdd"]> }[];
  /** rule 477.3.a / 357.1 — what a Hide would charge this seat right now. */
  hidePrice?(seat: Seat): { energy: number; power: number; free: boolean };
  /**
   * rule 357.1.a / 429.3 — cards this seat could pay for after one Reaction
   * [Add] but cannot pay for now. A UI dims these; the move stays refused.
   */
  reachablePlays?(seat: Seat): readonly ReachablePlay[];
  /** Whether procedures are auto-run (then they are hidden from menus). */
  readonly autoProcedures: boolean;
  readonly seq: number;
}

/**
 * rule 809.1.d / 429.3 — the target tuples a play of `cardId` may still NAME,
 * with the ones it cannot yet PAY for marked and priced.
 *
 * The enumerator already OFFERS every candidate the spell's descriptor resolves
 * to; it is the move's own `condition` that refuses the ones whose [Deflect]
 * surcharge the pool cannot cover. So the dropped set is exactly
 * (raw enumeration − valid enumeration), and each member is re-priced with
 * `playTargetPayability` to ask whether a Reaction [Add] could still fund it.
 * Nothing here re-derives targets or costs by hand, so it cannot drift from
 * what the play will actually charge.
 *
 * Exported because the same list is what a CLIENT needs in order to dim a
 * candidate rather than hide it: by construction these are not legal moves, so
 * the app server ships them alongside the legal-move list.
 */
export function surchargedPlayTargetsOf(
  engine: HarnessEngine,
  seat: string,
  moveId: string,
  cardId: string,
): readonly {
  targets: readonly string[];
  surcharge: number;
  unaffordable: boolean;
  needsAdd?: ActionField["needsAdd"];
}[] {
    const internal = getInternalState(engine);
    const of = (validOnly: boolean) =>
      engine
        .enumerateMoves(seat as PlayerId, { moveIds: [moveId], validOnly })
        .filter((m) => (m.params as { cardId?: string } | undefined)?.cardId === cardId);
    const valid = new Set(of(true).map((m) => canonicalJson(m.params)));
    const board = {
      cards: {
        getCardController: (id: CardId) => internal.cards[id as string]?.controller,
        getCardMeta: (id: CardId) => internal.cardMetas[id as string],
        getCardOwner: (id: CardId) => internal.cards[id as string]?.owner,
        updateCardMeta: () => {},
      },
      zones: {
        getCardsInZone: (zoneId: unknown, playerId?: unknown) =>
          Object.entries(internal.cards)
            .filter(
              ([, c]) =>
                c.zone === (zoneId as string) &&
                (playerId === undefined || c.owner === (playerId as string)),
            )
            .map(([id]) => id as CardId),
        getCardZone: (id: CardId) => internal.cards[id as string]?.zone,
      },
    };
    const out: {
      targets: readonly string[];
      surcharge: number;
      unaffordable: boolean;
      needsAdd?: ActionField["needsAdd"];
    }[] = [];
    for (const m of of(false)) {
      const params = (m.params ?? {}) as Record<string, unknown>;
      const targets = params.targets as readonly string[] | undefined;
      if (!targets || targets.length === 0) {
        continue;
      }
      // A tuple the play CAN afford is priced but never dimmed.
      if (valid.has(canonicalJson(params))) {
        const tax = deflectSurchargeOf(
          engine.getState(),
          seat as string,
          cardId,
          targets,
          board as Parameters<typeof deflectSurchargeOf>[4],
        );
        if (tax > 0) {
          out.push({ surcharge: tax, targets, unaffordable: false });
        }
        continue;
      }
      const pay = playTargetPayability(
        engine.getState(),
        seat as string,
        cardId,
        { ...params, board, targets: [...targets] } as Parameters<typeof playTargetPayability>[3],
        {
          board: board as Parameters<typeof playTargetPayability>[4]["board"],
          getCardMeta: (id: CardId) => internal.cardMetas[id as string],
          getFlag: (id: never, name: string) => {
            const meta = internal.cardMetas[id as unknown as string] as
              | { __flags?: Record<string, unknown>; [k: string]: unknown }
              | undefined;
            return meta?.__flags?.[name] === true || meta?.[name] === true;
          },
        },
      );
      if (pay) {
        out.push({ needsAdd: pay.needsAdd, surcharge: pay.surcharge, targets, unaffordable: true });
      }
    }
    return out;
}

/**
 * rule 356.1.b.2 / 357.1.a / 429.3 — for a spell that PLAYS the card it names,
 * the named candidates whose own remaining cost the pool cannot cover.
 *
 * "Ignoring its Energy cost" waives only the Energy half (356.1.b.2), so the
 * printed Power is still owed and an unpayable object makes the instruction do
 * nothing (359.3.e.6). The candidate is a legal object either way, so it stays
 * LISTED and is priced here with the same `instructionCost` overrides and the
 * same `playCostShortfall` the instructed play itself will charge through.
 */
export function effectPlayShortfallsOf(
  engine: HarnessEngine,
  seat: string,
  cardId: string,
): readonly { target: string; needsAdd: NonNullable<ActionField["needsAdd"]> }[] {
  const spell = (getGlobalCardRegistry().getAbilities(cardId) ?? []).find((a) => a.type === "spell");
  const effect = spell?.effect as
    | { type?: string; ignoreCost?: unknown; cost?: { energy?: number; power?: readonly string[] } }
    | undefined;
  if (effect?.type !== "play") {
    return [];
  }
  const internal = getInternalState(engine);
  const state = engine.getState();
  const board = {
    cards: {
      getCardController: (id: CardId) => internal.cards[id as string]?.controller,
      getCardMeta: (id: CardId) => internal.cardMetas[id as string],
      getCardOwner: (id: CardId) => internal.cards[id as string]?.owner,
      updateCardMeta: () => {},
    },
    zones: {
      getCardsInZone: (zoneId: unknown, playerId?: unknown) =>
        Object.entries(internal.cards)
          .filter(
            ([, c]) =>
              c.zone === (zoneId as string) &&
              (playerId === undefined || c.owner === (playerId as string)),
          )
          .map(([id]) => id as CardId),
      getCardZone: (id: CardId) => internal.cards[id as string]?.zone,
    },
  };
  const out: { target: string; needsAdd: NonNullable<ActionField["needsAdd"]> }[] = [];
  const seen = new Set<string>();
  for (const m of engine.enumerateMoves(seat as PlayerId, {
    moveIds: ["playSpell"],
    validOnly: false,
  })) {
    const params = (m.params ?? {}) as { cardId?: unknown; targets?: unknown };
    if (params.cardId !== cardId || !Array.isArray(params.targets)) {
      continue;
    }
    for (const t of params.targets) {
      if (typeof t !== "string" || seen.has(t)) {
        continue;
      }
      seen.add(t);
      const { extras, free } = instructionCost({
        cardId: t,
        costMode: costModeOfPlayEffect(effect),
      });
      if (free) {
        continue;
      }
      const short = playCostShortfall(
        state,
        seat,
        t,
        { board, ...extras } as Parameters<typeof playCostShortfall>[3],
        (id: CardId) => internal.cardMetas[id as string],
      );
      if (short && (short.energy > 0 || Object.keys(short.power).length > 0)) {
        out.push({ needsAdd: describeShortfall(short), target: t });
      }
    }
  }
  return out;
}

/**
 * rule 356.4 — the shortfall of the price a play was QUOTED, when the enumerated
 * variant carries one.
 *
 * `PlayCostQuote` is what `play-options.ts` computed and what `payUnitPlayCosts`
 * will charge, so measuring it against the pool is the only way the pay line and
 * the charge cannot disagree — pricing the card's PRINTED cost instead reported
 * a pip-only shortfall on a discounted play as "4 missing Energy", the shortfall
 * of a variant nobody was offered. `undefined` when the variant carries no quote
 * (spells price through `playCostShortfall`) or when the pool covers it.
 */
function shortfallOfQuote(
  state: RiftboundGameState,
  seat: string,
  cardId: string,
  quote: unknown,
): { energy: number; power: Record<string, number> } | undefined {
  const q = quote as
    | { energy?: number; any?: number; power?: Record<string, number>; free?: boolean }
    | undefined;
  if (!q || typeof q.energy !== "number") {
    return undefined;
  }
  return resourceCostShortfall(state, seat, cardId, {
    any: q.any ?? 0,
    energy: q.energy,
    free: q.free === true,
    ignoreEnergy: false,
    named: { ...(q.power ?? {}) },
  });
}

/**
 * rule 357.1.a / 429.3 — the plays the seat could pay for after one Reaction
 * [Add] but cannot pay for right now.
 *
 * The play enumerators credit what an Add could still put in the pool
 * (`reachableRuneAdds`), so these ARE offered by the enumerator; it is the
 * move's own `condition` that refuses them, because paying is manual and
 * nothing may be auto-tapped. The difference between the two enumerations is
 * therefore exactly "cards the player can reach but has not funded" — the set a
 * client must render dimmed with a pay line instead of leaving inert.
 */
export function reachablePlaysOf(
  engine: HarnessEngine,
  seat: string,
): readonly { moveId: string; card: string; needsAdd: NonNullable<ActionField["needsAdd"]> }[] {
  const internal = getInternalState(engine);
  const state = engine.getState();
  const board = {
    cards: {
      getCardController: (id: CardId) => internal.cards[id as string]?.controller,
      getCardMeta: (id: CardId) => internal.cardMetas[id as string],
      getCardOwner: (id: CardId) => internal.cards[id as string]?.owner,
      updateCardMeta: () => {},
    },
    zones: {
      getCardsInZone: (zoneId: unknown, playerId?: unknown) =>
        Object.entries(internal.cards)
          .filter(
            ([, c]) =>
              c.zone === (zoneId as string) &&
              (playerId === undefined || c.owner === (playerId as string)),
          )
          .map(([id]) => id as CardId),
      getCardZone: (id: CardId) => internal.cards[id as string]?.zone,
    },
  };
  const of = (validOnly: boolean) =>
    engine.enumerateMoves(seat as PlayerId, { moveIds: [...PLAY_MOVE_IDS], validOnly });
  const payable = new Set(
    of(true).map((m) => `${m.moveId}|${String((m.params as { cardId?: unknown }).cardId ?? "")}`),
  );
  const out: { moveId: string; card: string; needsAdd: NonNullable<ActionField["needsAdd"]> }[] = [];
  /** key → index in `out`, so the cheapest variant of a card replaces in place. */
  const at = new Map<string, number>();
  /** key → what that listed variant owes, to keep the cheapest pay line. */
  const owedBy = new Map<string, number>();
  for (const m of of(false)) {
    const params = (m.params ?? {}) as { cardId?: unknown; targets?: unknown; quote?: unknown };
    const cardId = params.cardId;
    if (typeof cardId !== "string") {
      continue;
    }
    const key = `${m.moveId}|${cardId}`;
    if (payable.has(key)) {
      continue;
    }
    // rule 809.1.d — a [Deflect] instalment the chosen target adds is part of
    // what THIS play costs, so price the tuple the enumerator actually
    // offered rather than the card's bare printed cost. Without the targets a
    // spell whose only legal target is surcharged prices as fully funded, so
    // it was silently dropped here and the hand card stayed inert — the one
    // case the dimmed-target treatment exists for.
    const targets = Array.isArray(params.targets)
      ? params.targets.filter((t): t is string => typeof t === "string")
      : [];
    // rule 356.4 — the quoted price must be the price that WILL be charged. The
    // enumerated variant carries the total the reducer will pay (`quote`, from
    // the one cost model in `play-options.ts`), which already has the variant's
    // optional additional cost and its discount in it.
    const short =
      shortfallOfQuote(state, seat, cardId, params.quote) ??
      playCostShortfall(
        state,
        seat,
        cardId,
        { board, ...(targets.length > 0 ? { targets } : {}) } as Parameters<
          typeof playCostShortfall
        >[3],
        (id: CardId) => internal.cardMetas[id as string],
      );
    if (!short) {
      continue;
    }
    // rule 809.1.d / 404.2 — the enumerator credits reachable Adds against the
    // card's own cost but not against a target's surcharge, so that half is
    // checked here through the same probe `surchargedPlayTargetsOf` uses: a
    // tuple NOTHING on board could fund is still not offered.
    if (
      targets.length > 0 &&
      deflectSurchargeOf(
        state,
        seat,
        cardId,
        targets,
        board as Parameters<typeof deflectSurchargeOf>[4],
      ) > 0 &&
      !playTargetPayability(
        state,
        seat,
        cardId,
        { ...params, board, targets: [...targets] } as Parameters<typeof playTargetPayability>[3],
        {
          board: board as Parameters<typeof playTargetPayability>[4]["board"],
          getCardMeta: (id: CardId) => internal.cardMetas[id as string],
          getFlag: (id: never, name: string) => {
            const meta = internal.cardMetas[id as unknown as string] as
              | { __flags?: Record<string, unknown>; [k: string]: unknown }
              | undefined;
            return meta?.__flags?.[name] === true || meta?.[name] === true;
          },
        },
      )
    ) {
      continue;
    }
    const owed = short.energy + Object.values(short.power).reduce((a, n) => a + (n ?? 0), 0);
    const row = { card: cardId, moveId: m.moveId, needsAdd: describeShortfall(short) };
    const idx = at.get(key);
    if (idx === undefined) {
      at.set(key, out.length);
      owedBy.set(key, owed);
      out.push(row);
      continue;
    }
    // Several tuples of the same card: quote the cheapest way in, so the pay
    // line names the smallest Add that unlocks the card (rule 357.1.a).
    if (owed < (owedBy.get(key) ?? Number.POSITIVE_INFINITY)) {
      owedBy.set(key, owed);
      out[idx] = row;
    }
  }
  return out;
}

export function engineDecisionContext(
  engine: HarnessEngine,
  seq: number,
  autoProcedures: boolean,
): DecisionContext {
  return {
    autoProcedures,
    canExecute: (seat, moveId, params) =>
      engine.canExecuteMove(moveId, { params, playerId: seat as PlayerId }),
    explain: (seat, moveId, params) =>
      refusalOf(engine.explainMove(moveId, { params, playerId: seat as PlayerId })),
    // rule 356.4.b — the board statics that carry an "[N] or [rainbow] less"
    // discount live in the engine's zones, so read them the same way the play
    // itself does (a read-only view; `updateCardMeta` is never called here).
    costElectionLive: (seat, cardId, targets) => {
      const internal = getInternalState(engine);
      return (
        costElectionHalves(
          engine.getState(),
          seat as string,
          cardId as string,
          {
            board: {
              cards: {
                getCardController: (id) => internal.cards[id as string]?.controller,
                getCardMeta: (id) => internal.cardMetas[id as string],
                getCardOwner: (id) => internal.cards[id as string]?.owner,
                updateCardMeta: () => {},
              },
              zones: {
                getCardsInZone: (zoneId, playerId) =>
                  Object.entries(internal.cards)
                    .filter(
                      ([, c]) =>
                        c.zone === (zoneId as string) &&
                        (playerId === undefined || c.owner === (playerId as string)),
                    )
                    .map(([id]) => id as CardId),
              },
            },
            ...(targets ? { targets: [...targets] } : {}),
          },
          (id) => internal.cardMetas[id as string],
        ) !== undefined
      );
    },
    handOf: (seat) => {
      const internal = getInternalState(engine);
      return (internal.zones.hand?.cardIds ?? []).filter((id) => internal.cards[id]?.owner === seat);
    },
    // rule 113: a registered-but-unselected battlefield waits in the set-aside
    // holding area; only the ones this seat OWNS are its to keep (486.5).
    registeredBattlefieldsOf: (seat) => {
      const internal = getInternalState(engine);
      const registry = getGlobalCardRegistry();
      return (internal.zones.setAside?.cardIds ?? []).filter(
        (id) => internal.cards[id]?.owner === seat && registry.getCardType(id) === "battlefield",
      );
    },
    label: (card) => cardLabel(engine, card),
    // rule 809.1.d — the enumerator already OFFERS every candidate the spell's
    // descriptor resolves to; it is the move's own `condition` that refuses the
    // ones whose [Deflect] surcharge the pool cannot cover. So the dropped set
    // is exactly (raw enumeration − valid enumeration), and each member is
    // re-priced with `playTargetPayability` to see whether a Reaction [Add]
    // could still fund it. Nothing here re-derives targets or costs by hand.
    reachablePlays: (seat) =>
      reachablePlaysOf(engine, seat as string).map((r) => ({
        card: r.card as ReachablePlay["card"],
        moveId: r.moveId,
        needsAdd: r.needsAdd,
      })),
    surchargedPlayTargets: (seat, moveId, cardId) =>
      surchargedPlayTargetsOf(engine, seat as string, moveId, cardId),
    effectPlayShortfalls: (seat, cardId) => effectPlayShortfallsOf(engine, seat as string, cardId),
    // rule 477.3.a — the Hide control must quote the price it is about to
    // charge; `hideCostQuote` is the same reading `deductHideCost` pays by.
    hidePrice: (seat) => {
      const internal = getInternalState(engine);
      return hideCostQuote(engine.getState(), seat as string, {
        zones: {
          getCardsInZone: (zoneId, playerId) =>
            Object.entries(internal.cards)
              .filter(
                ([, c]) =>
                  c.zone === (zoneId as string) &&
                  (playerId === undefined || c.owner === (playerId as string)),
              )
              .map(([id]) => id as CardId),
        },
      });
    },
    legal: (seat, moveIds) =>
      engine
        .enumerateMoves(seat as PlayerId, { moveIds: moveIds ? [...moveIds] : undefined, validOnly: true })
        .map((m) => ({
          moveId: m.moveId,
          params: (m.params ?? {}) as Record<string, unknown>,
          playerId: (m.playerId as string) ?? seat,
        })),
    seq,
    state: engine.getState(),
  };
}

// ---------------------------------------------------------------------------
// Move metadata
// ---------------------------------------------------------------------------

const VERBS: Record<string, ActionVerb> = {
  activateAbility: "activate",
  concede: "concede",
  conquerBattlefield: "conquer",
  contestBattlefield: "contest",
  endShowdown: "endShowdown",
  endTurn: "endTurn",
  exhaustRune: "tapRune",
  gankingMove: "gank",
  hideCard: "hide",
  invitePlayer: "invite",
  passChainPriority: "passPriority",
  passShowdownFocus: "passFocus",
  playFromChampionZone: "playChampion",
  playFromZone: "playFrom",
  playGear: "equip",
  playSpell: "cast",
  playUnit: "play",
  recallUnit: "recall",
  recycleRune: "recycleRune",
  resolveChain: "resolveChain",
  resolveFullCombat: "resolveCombat",
  resumeResolution: "resumeResolution",
  revealHidden: "reveal",
  scorePoint: "score",
  standardMove: "move",
  startShowdown: "startShowdown",
};

export const PROCEDURE_MOVE_IDS = new Set(["resolveFullCombat", "endShowdown", "resolveChain"]);

/** Params that identify the option (excluded from fields). */
function primaryOf(m: FlatMove): { primary: string; card?: CardRef; consumed: string[] } {
  const p = m.params;
  switch (m.moveId) {
    case "activateAbility": {
      return {
        card: p.cardId as string,
        consumed: ["cardId", "abilityIndex"],
        primary: `${String(p.cardId)}#${String(p.abilityIndex ?? 0)}`,
      };
    }
    case "exhaustRune":
    case "recycleRune": {
      return { card: p.runeId as string, consumed: ["runeId"], primary: String(p.runeId) };
    }
    case "standardMove": {
      return { consumed: ["destination"], primary: `to:${String(p.destination)}` };
    }
    case "gankingMove":
    case "recallUnit": {
      return { card: p.unitId as string, consumed: ["unitId"], primary: String(p.unitId) };
    }
    case "resolveFullCombat":
    case "conquerBattlefield":
    case "startShowdown":
    case "contestBattlefield":
    case "scorePoint": {
      return { consumed: ["battlefieldId"], primary: String(p.battlefieldId) };
    }
    case "invitePlayer": {
      return { consumed: ["invitedPlayerId"], primary: String(p.invitedPlayerId) };
    }
    default: {
      if (typeof p.cardId === "string") {
        return { card: p.cardId, consumed: ["cardId"], primary: p.cardId };
      }
      return { consumed: [], primary: "-" };
    }
  }
}

/** Engine param → PlayArgs name + field kind. */
const PARAM_ARG: Record<string, { arg: string; kind: ActionFieldKind }> = {
  abilityIndex: { arg: "abilityIndex", kind: "int" },
  battlefieldId: { arg: "to", kind: "zone" },
  chosenTargetId: { arg: "costTarget", kind: "card" },
  destination: { arg: "to", kind: "zone" },
  discardId: { arg: "discard", kind: "card" },
  domain: { arg: "domain", kind: "enum" },
  location: { arg: "to", kind: "zone" },
  // rule 355.3 — the mode of a "Choose one —" spell, chosen as it is cast.
  mode: { arg: "mode", kind: "int" },
  paidAdditionalCost: { arg: "payOptional", kind: "bool" },
  // rule 416.5 — the controller picks which cards pay a "Recycle N" cost.
  recycleIds: { arg: "recycle", kind: "cards" },
  repeatCount: { arg: "repeat", kind: "int" },
  sacrificeId: { arg: "sacrifice", kind: "card" },
  sourceCardId: { arg: "source", kind: "card" },
  targets: { arg: "targets", kind: "cards" },
  toBattlefield: { arg: "to", kind: "zone" },
  unitIds: { arg: "units", kind: "cards" },
  // rule 356.1.b — spend a granted "ignoring its Energy cost" on this play?
  useEnergyWaiver: { arg: "waiveEnergy", kind: "bool" },
  viaFlow: { arg: "flow", kind: "bool" },
  xAmount: { arg: "x", kind: "int" },
};

/**
 * Params never surfaced as fields. additionalCostSpec / costs ride with the legacy cost params they mirror;
 * `quote` is the play-options model's cost breakdown (energy / per-Domain pips / any-Domain pips / xp).
 */
const HIDDEN_PARAMS = new Set(["playerId", "additionalCostSpec", "costs", "modes", "permissionId", "quote"]);

/** Follow-up priority: which still-varying field to ask about first. */
const FOLLOW_UP_ORDER = [
  "mode",
  "targets",
  "location",
  "destination",
  "toBattlefield",
  "battlefieldId",
  "unitIds",
  "sacrificeId",
  "discardId",
  "recycleIds",
  "chosenTargetId",
  "domain",
  "repeatCount",
  "paidAdditionalCost",
  "viaFlow",
];

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

function labelForOption(ctx: DecisionContext, m: FlatMove, card: CardRef | undefined, primary: string): string {
  const verb = VERBS[m.moveId] ?? m.moveId;
  if (m.moveId === "standardMove") {
    return `move → ${String(m.params.destination)}`;
  }
  if (m.moveId === "activateAbility") {
    return `activate ${ctx.label(card as string)} ability #${String(m.params.abilityIndex ?? 0)}`;
  }
  if (card) {
    return `${verb} ${ctx.label(card)}`;
  }
  return primary === "-" ? verb : `${verb} ${primary}`;
}

/** rule 204.3.b — is this spell's X a resolution-time [rainbow] Power payment? */
export function xIsResolutionPower(cardId: CardRef): boolean {
  const abilities = getGlobalCardRegistry().getAbilities(cardId) ?? [];
  const spell = abilities.find((a) => a.type === "spell");
  return (spell as { xCost?: unknown } | undefined)?.xCost === "power";
}

/** Does this spell's effect read `{ variable: "x" }`? */
export function spellSupportsX(cardId: CardRef): boolean {
  const abilities = getGlobalCardRegistry().getAbilities(cardId) ?? [];
  const spell = abilities.find((a) => a.type === "spell");
  if (!spell?.effect) {
    return false;
  }
  // rule 204.3.b (ogn-268-298): a [rainbow] X is paid ON RESOLUTION, so it is
  // not a play-time field at all.
  if ((spell as { xCost?: unknown }).xCost === "power") {
    return false;
  }
  return JSON.stringify(spell.effect).includes('"variable":"x"');
}

function probeMaxX(ctx: DecisionContext, variant: FlatMove): number {
  const pool = ctx.state.runePools[variant.playerId];
  // rule 204.3.b: an X may be paid in [rainbow] Power rather than Energy, so
  // the probe ceiling spans both pools.
  const power = Object.values(pool?.power ?? {}).reduce<number>((a, b) => a + (b ?? 0), 0);
  const cap = Math.min(60, (pool?.energy ?? 0) + power + 1);
  if (!ctx.canExecute) {
    return Math.max(0, cap - 1);
  }
  let best = 0;
  for (let k = 0; k <= cap; k++) {
    if (ctx.canExecute(variant.playerId, variant.moveId, { ...variant.params, xAmount: k })) {
      best = k;
    } else if (k > 0) {
      break;
    }
  }
  return best;
}

function buildFields(ctx: DecisionContext, moveId: string, variants: FlatMove[], consumed: string[]): ActionField[] {
  const names = new Set<string>();
  for (const v of variants) {
    for (const k of Object.keys(v.params)) {
      if (!HIDDEN_PARAMS.has(k) && !consumed.includes(k)) {
        names.add(k);
      }
    }
  }
  const fields: ActionField[] = [];
  for (const name of names) {
    const distinct = new Map<string, unknown>();
    let presentInAll = true;
    for (const v of variants) {
      const val = v.params[name];
      if (val === undefined) {
        presentInAll = false;
      }
      distinct.set(canonicalJson(val ?? null), val);
    }
    const meta = PARAM_ARG[name] ?? { arg: name, kind: "enum" as ActionFieldKind };
    if (meta.kind === "bool" && distinct.has("null")) {
      distinct.delete("null");
      distinct.set("false", false);
    }
    let options = [...distinct.values()];
    if (meta.kind === "int" && options.some((o) => typeof o === "number")) {
      // An omitted numeric param ("no Repeat", "X = 0") is already expressed by
      // `min`; leaving `undefined` in the list makes the offered instances
      // unreadable.
      options = options.filter((o) => o !== undefined && o !== null);
    }
    if (meta.kind === "bool") {
      options.sort((a, b) => Number(a === true) - Number(b === true));
    }
    const ints = options.filter((o): o is number => typeof o === "number");
    // rule 355.3 — a `mode` field names the printed bullets it indexes.
    const modeLabels =
      name === "mode" && typeof variants[0]?.params.cardId === "string"
        ? spellModeLabels(getGlobalCardRegistry().getAbilities(variants[0]?.params.cardId as string))
        : undefined;
    if (name === "mode") {
      options.sort((a, b) => Number(a) - Number(b));
    }
    fields.push({
      arg: meta.arg,
      kind: meta.kind,
      ...(modeLabels ? { labels: options.map((o) => modeLabels[Number(o)] ?? `Mode ${Number(o) + 1}`) } : {}),
      max: meta.kind === "int" && ints.length ? Math.max(...ints) : meta.kind === "cards" ? Math.max(...options.map((o) => (Array.isArray(o) ? o.length : 0))) : undefined,
      min: meta.kind === "int" && ints.length ? Math.min(0, ...ints) : meta.kind === "cards" ? Math.min(...options.map((o) => (Array.isArray(o) ? o.length : 0))) : undefined,
      name,
      options,
      required: presentInAll,
    });
  }
  // rule 429.1 (sfd-083-221): an activated "Pay any amount of …" ability
  // offers X the same way a spell does — as an integer field on the option.
  if (moveId === "activateAbility" && variants.length > 0) {
    const v0 = variants[0] as FlatMove;
    const lookupId = (v0.params.sourceCardId ?? v0.params.cardId) as string | undefined;
    const idx = (v0.params.abilityIndex as number | undefined) ?? 0;
    const ability = lookupId
      ? (getGlobalCardRegistry().getAbilities(lookupId) ?? [])[idx]
      : undefined;
    if ((ability as { cost?: { x?: unknown } } | undefined)?.cost?.x !== undefined) {
      // rule 444.2: "any amount" includes none, so X is optional — an
      // activation that names no X pays 0 rather than parking on a prompt.
      fields.push({ arg: "x", kind: "int", max: probeMaxX(ctx, v0), min: 0, name: "xAmount", required: false });
    }
  }
  // rule 477.3.a / 357.1 — Hide takes [rainbow] (or the ogn-263-298 [1] Energy
  // alternative) out of the pool, so the control quotes what it will spend
  // instead of charging a price the client never saw.
  if (moveId === "hideCard" && variants.length > 0) {
    const quote = ctx.hidePrice?.((variants[0] as FlatMove).playerId as Seat);
    if (quote) {
      const label = quote.free ? "[0]" : quote.energy > 0 ? `[${quote.energy}]` : "[rainbow]";
      fields.push({
        arg: "hideCost",
        kind: "enum",
        labels: [label],
        name: "hideCost",
        options: [label],
        required: false,
      });
    }
  }
  if (moveId === "playSpell" && variants.length > 0) {
    const cardId = variants[0]?.params.cardId as string | undefined;
    // rule 355.5 — name the two roles of a `target1`/`target2` spell so a UI can title them.
    const spellEffect = cardId
      ? ((getGlobalCardRegistry().getAbilities(cardId) ?? []).find((a) => a.type === "spell")?.effect as
          | { type?: string }
          | undefined)
      : undefined;
    const targetsField = fields.find((f) => f.name === "targets");
    if (targetsField && pairEffectRoles(spellEffect as Parameters<typeof pairEffectRoles>[0])) {
      const roles =
        spellEffect?.type === "increase-might-to"
          ? ["target1: unit whose Might increases", "target2: reference unit"]
          : ["target1: first unit", "target2: second unit"];
      fields.splice(fields.indexOf(targetsField), 1, { ...targetsField, roles });
    }
    if (cardId && spellSupportsX(cardId)) {
      fields.push({
        arg: "x",
        kind: "int",
        max: probeMaxX(ctx, variants[0] as FlatMove),
        min: 0,
        name: "xAmount",
        required: true,
      });
    }
    // rule 809.1.d / 429.3 — a [Deflect]-surcharged candidate the pool cannot
    // cover but a Reaction [Add] could is still a legal choice, so it stays on
    // the offered list carrying its surcharge and marked unaffordable; only the
    // PLAY is refused until the pip is actually pooled. Without this the
    // candidate simply vanished, leaving a client nothing to dim and no pay
    // line to quote (43bb893 fixed the same thing for surcharged prompts).
    if (cardId && targetsField) {
      const seat = (variants[0] as FlatMove).playerId as Seat;
      const reachable = ctx.surchargedPlayTargets?.(seat, moveId, cardId) ?? [];
      const field = fields.find((f) => f.name === "targets") ?? targetsField;
      const options = [...(field.options ?? [])];
      const priced = new Map(reachable.map((r) => [canonicalJson([...r.targets]), r]));
      const surcharge = options.map((o) => priced.get(canonicalJson(o))?.surcharge ?? 0);
      const unaffordable = options.map(() => false);
      let cheapest: ActionField["needsAdd"] | undefined;
      const seen = new Set(options.map((o) => canonicalJson(o)));
      for (const r of reachable) {
        if (!r.unaffordable) {
          continue;
        }
        const key = canonicalJson([...r.targets]);
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        options.push([...r.targets]);
        surcharge.push(r.surcharge);
        unaffordable.push(true);
        const owed = Object.values(r.needsAdd?.power ?? {}).reduce<number>((a, n) => a + (n ?? 0), 0);
        const best = Object.values(cheapest?.power ?? {}).reduce<number>((a, n) => a + (n ?? 0), 0);
        if (cheapest === undefined || owed < best) {
          cheapest = r.needsAdd;
        }
      }
      if (surcharge.some((n) => n > 0) || unaffordable.some(Boolean)) {
        fields.splice(fields.indexOf(field), 1, {
          ...field,
          max: Math.max(...options.map((o) => (Array.isArray(o) ? o.length : 1))),
          min: Math.min(...options.map((o) => (Array.isArray(o) ? o.length : 1))),
          ...(cheapest ? { needsAdd: cheapest } : {}),
          options,
          ...(surcharge.some((n) => n > 0) ? { surcharge } : {}),
          ...(unaffordable.some(Boolean) ? { unaffordable } : {}),
        });
      }
    }
    // rule 356.1.b.2 / 357.1.a / 429.3 — a spell that PLAYS the card it names
    // still owes that card's un-waived cost, and an object it cannot pay for is
    // simply ignored on resolution (359.3.e.6). The candidate stays LISTED, so
    // mark it unpayable and name the pips it owes — the same vocabulary a
    // [Deflect]-surcharged candidate uses one block up.
    if (cardId) {
      const shorts = ctx.effectPlayShortfalls?.((variants[0] as FlatMove).playerId as Seat, cardId) ?? [];
      const field = fields.find((f) => f.name === "targets");
      if (shorts.length > 0 && field) {
        const owedBy = new Map(shorts.map((s) => [s.target, s.needsAdd]));
        const options = [...(field.options ?? [])];
        const unaffordable = options.map((o, i) => {
          const first = Array.isArray(o) ? o[0] : o;
          return field.unaffordable?.[i] === true || (typeof first === "string" && owedBy.has(first));
        });
        const cheapest = shorts
          .map((s) => s.needsAdd)
          .sort(
            (a, b) =>
              (a.energy ?? 0) +
              Object.values(a.power ?? {}).reduce<number>((x, n) => x + (n ?? 0), 0) -
              ((b.energy ?? 0) +
                Object.values(b.power ?? {}).reduce<number>((x, n) => x + (n ?? 0), 0)),
          )[0];
        if (unaffordable.some(Boolean)) {
          fields.splice(fields.indexOf(field), 1, {
            ...field,
            ...(field.needsAdd ? {} : cheapest ? { needsAdd: cheapest } : {}),
            unaffordable,
          });
        }
      }
    }
    // rule 356.4.b / 356.4.c.1 — "[N] or [rainbow] less" is ONE discount whose
    // half the caster elects; offer it up front as well as after the play.
    if (
      cardId &&
      ctx.costElectionLive?.(
        (variants[0] as FlatMove).playerId as Seat,
        cardId,
        (variants[0] as FlatMove).params.targets as readonly string[] | undefined,
      )
    ) {
      fields.push({
        arg: "costElection",
        kind: "enum",
        name: "cost-election",
        options: ["energy", "power"],
        required: false,
      });
    }
  }
  return fields;
}

/**
 * rule 809.1.c.1 / 429.3 — the per-option payability annotation of a SURCHARGED
 * pick (a [Deflect]-taxed target, a keyword surcharge a static imposes).
 *
 * Every legal candidate stays in the option list; what changes with the pool is
 * whether it may be ANSWERED with. `needsAdd` marks the ones the pool cannot
 * cover yet but a rune Add still could — the prompt is open across those Adds
 * (DESIGN.md §Paying costs), and because this is re-derived on every decision
 * each tap/recycle flips the affected options live. Returns a per-option
 * annotator so the seat's Add capacity is read once per decision.
 */
function surchargeAnnotator(
  ctx: DecisionContext,
  seat: Seat,
): (surcharge: number) => { surcharge?: number; needsAdd?: PickOption["needsAdd"] } {
  let addable: number | undefined;
  return (surcharge) => {
    if (!(surcharge > 0)) {
      return {};
    }
    if (addable === undefined) {
      const adds = potentialAddsFromMoves(
        ctx.legal(seat).filter((m) => m.moveId !== "resolvePendingChoice"),
      );
      addable = Object.values(adds.power).reduce<number>((a, b) => a + (b ?? 0), 0);
    }
    const pay = surchargePayability(ctx.state, seat as string, surcharge, addable);
    return { surcharge, ...(pay.needsAdd ? { needsAdd: pay.needsAdd } : {}) };
  };
}

export function groupActions(
  ctx: DecisionContext,
  flat: readonly FlatMove[],
): { options: ActionOption[]; passKey?: string; endTurnKey?: string } {
  const groups = new Map<string, { moves: FlatMove[]; card?: CardRef; primary: string; consumed: string[] }>();
  for (const m of flat) {
    if (m.moveId === "resolvePendingChoice") {
      continue;
    }
    if (ctx.autoProcedures && PROCEDURE_MOVE_IDS.has(m.moveId)) {
      continue;
    }
    const { primary, card, consumed } = primaryOf(m);
    const key = `${m.moveId}:${primary}`;
    const g = groups.get(key);
    if (g) {
      g.moves.push(m);
    } else {
      groups.set(key, { card, consumed, moves: [m], primary });
    }
  }
  const options: ActionOption[] = [];
  let passKey: string | undefined;
  let endTurnKey: string | undefined;
  for (const [key, g] of groups) {
    const first = g.moves[0] as FlatMove;
    const option: ActionOption = {
      card: g.card,
      fields: buildFields(ctx, first.moveId, g.moves, g.consumed),
      key,
      label: labelForOption(ctx, first, g.card, g.primary),
      moveId: first.moveId,
      variantCount: g.moves.length,
      variants: g.moves,
      verb: VERBS[first.moveId] ?? "other",
    };
    options.push(option);
    if (first.moveId === "passChainPriority" || first.moveId === "passShowdownFocus") {
      passKey = key;
    }
    if (first.moveId === "endTurn") {
      endTurnKey = key;
    }
  }
  options.sort((a, b) => a.key.localeCompare(b.key));
  return { endTurnKey, options, passKey };
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

export function decisionId(seq: number, seat: Seat, kind: string, suffix?: string): string {
  return `d${seq}:${seat}:${kind}${suffix ? `:${suffix}` : ""}`;
}

export function actionContextOf(state: RiftboundGameState, seat: Seat): ActionContext {
  // rule 321 (DESIGN.md §Pausing inside a resolving item) — a suspended
  // resolution offers exactly one move, `resumeResolution`, and it is a
  // PROCEDURE rather than a decision: `passivePolicy` takes it, so `settle()`
  // drives straight through while a caller that stops before settling can read
  // the half-resolved board.
  if (state.suspendedResolution !== undefined) {
    return "procedure";
  }
  const chain = state.interaction?.chain;
  if (chain?.active) {
    return "chain";
  }
  const stack = state.interaction?.showdownStack ?? [];
  const top = stack[stack.length - 1];
  if (top?.active) {
    return "showdown";
  }
  return getActingSeat(state) === seat ? "main" : "free";
}

export function deriveActionDecision(ctx: DecisionContext, seat: Seat, cursor: boolean): ActionDecision | null {
  const flat = ctx.legal(seat);
  const { options, passKey, endTurnKey } = groupActions(ctx, flat);
  const context: ActionContext = cursor ? actionContextOf(ctx.state, seat) : "free";
  if (!cursor && options.every((o) => o.moveId === "concede")) {
    return null;
  }
  const chain = ctx.state.interaction?.chain;
  const top = chain?.items[chain.items.length - 1];
  const prompt =
    context === "chain"
      ? `Priority: respond to ${top ? ctx.label(top.cardId) : "the chain"} or pass`
      : context === "showdown"
        ? "Focus: act in the showdown or pass"
        : context === "main"
          ? "Main phase: take an action or end the turn"
          : context === "procedure"
            ? `Resolution paused: continue resolving ${
                ctx.state.suspendedResolution?.sourceCardId
                  ? ctx.label(ctx.state.suspendedResolution.sourceCardId)
                  : "the item"
              }`
            : "Free actions available";
  // rule 357.1.a / 429.3 — the cards the seat is one Add away from playing.
  // Every panel the seat actually HOLDS is a place a card gets paid for: a
  // [Reaction] lives on the chain panel (159.2.b.2) and a showdown's Focus
  // holder pays there too, so the dimmed pay line belongs to all three. Only a
  // free-action menu — a seat that is not being asked to act — is not.
  const reachablePlays = context === "free" ? [] : (ctx.reachablePlays?.(seat) ?? []);
  return {
    context,
    endTurnKey,
    id: decisionId(ctx.seq, seat, "action", cursor ? undefined : "free"),
    kind: "action",
    options,
    passKey,
    prompt,
    ...(reachablePlays.length > 0 ? { reachablePlays } : {}),
    seat,
    source: top ? { cardId: top.cardId, chainItemId: top.id } : undefined,
    timing: "ACT",
  };
}

function modeLabel(effect: unknown, idx: number): string {
  // rule 355.3 — the printed bullet, else a rendering of the mode's instruction.
  return modeOptionLabel(effect, idx);
}

export function deriveFromPendingChoice(ctx: DecisionContext, pc: PendingChoice): Decision {
  const seat = getPendingChoiceChooser(pc);
  const flat = ctx.legal(seat, ["resolvePendingChoice"]);
  // rule 402 — a prompt bound to a still-pending chain item (leading "you may",
  // targets, modes, base cost) is part of FINALIZING it, not of resolving it.
  const fin = pc as {
    finalizationChainItemId?: string;
    bindToChainItemId?: string;
    playItemId?: string;
    resume?: { kind?: string; itemId?: string };
  };
  // rule 354.2 / 355.1.a — every step of the dialog of a play an EFFECT
  // instructed (location, mandatory cost object, the optional-additional-cost
  // election such as [Repeat]) is Make Choices on a still-pending chain item,
  // so it is FIN too — it just names the item as `playItemId` instead of
  // binding a target to it.
  const playItemId = fin.playItemId;
  const chainItemId =
    fin.finalizationChainItemId ??
    fin.bindToChainItemId ??
    (fin.resume?.kind === "trigger-cost" || fin.resume?.kind === "target-slot" ? fin.resume.itemId : undefined);
  // rule 471.2.b — a trigger raised by a Score / showdown at a battlefield is
  // bound to THAT battlefield ("there"). Two instances of one ability can be
  // pending at once (one Hold per battlefield) and the only lever their
  // controller has is WHICH to perform, so the prompt must distinguish them:
  // carry the bound item's battlefield on the decision source.
  const boundBattlefieldId =
    chainItemId === undefined
      ? undefined
      : (
          (ctx.state.interaction?.chain?.items ?? []).find(
            (it) => (it as { id?: string }).id === chainItemId,
          ) as { triggerEvent?: { battlefieldId?: string } } | undefined
        )?.triggerEvent?.battlefieldId;
  const source = {
    ...(boundBattlefieldId !== undefined ? { battlefieldId: boundBattlefieldId } : {}),
    cardId: (pc as { sourceCardId?: string }).sourceCardId,
    ...(chainItemId !== undefined ? { chainItemId } : {}),
    pendingChoiceType: pc.type,
  };
  // rule 372/373 replacement questions are "RPL"; the 383.3.d trigger-batch
  // ordering is part of finalization ("FIN"); everything else resolves ("RES").
  const resumeKind = (pc as { resume?: { kind?: string } }).resume?.kind;
  const genericTiming =
    resumeKind === "die-order" ||
    resumeKind === "die-batch-order" ||
    resumeKind === "die-assign" ||
    resumeKind === "damage-order" ||
    // rule 372.1 — "which replacement applies to this point first" is the same
    // class of question as the damage one, asked of the SCORING player.
    resumeKind === "score-order"
      ? ("RPL" as const)
      : resumeKind === "trigger-batch" || resumeKind === "trigger-cost" || resumeKind === "target-slot"
        ? ("FIN" as const)
        : undefined;
  const base = {
    seat,
    source,
    timing:
      genericTiming ??
      (chainItemId !== undefined || playItemId !== undefined ? ("FIN" as const) : ("RES" as const)),
  };

  switch (pc.type) {
    // rule 372 / 383.3.d / 416.5.a — generic ordering prompt (index 0 = first).
    case "order": {
      // rule 372 — "which replacement applies first" reads best as a pick
      // (1..n keys = the front of the order; the rest keep the listed order).
      // `seat.order([...])` is accepted for it as well.
      if (resumeKind === "die-order" || resumeKind === "damage-order" || resumeKind === "score-order") {
        const d: PickDecision = {
          ...base,
          allowDecline: false,
          id: decisionId(ctx.seq, seat, "pick"),
          kind: "pick",
          max: pc.items.length,
          min: 1,
          options: pc.items.map((i) => ({
            ...(i.cardId ? { card: i.cardId } : {}),
            key: i.key,
            label: i.label ?? (i.cardId ? ctx.label(i.cardId) : i.key),
          })),
          prompt: pc.prompt ?? "Choose which replacement effect applies first",
          semantics: "replacement-order",
        };
        return d;
      }
      // rule 383.3.d — a defaultable (soft) offer leaves the seat's own action
      // menu usable; taking any of those actions accepts the listed order.
      const orderActions = pc.defaultable
        ? groupActions(
            ctx,
            ctx.legal(seat).filter((m) => m.moveId !== "resolvePendingChoice"),
          ).options
        : [];
      const d: OrderDecision = {
        ...base,
        ...(pc.defaultable ? { defaultable: true } : {}),
        ...(orderActions.length > 0 ? { actions: orderActions } : {}),
        id: decisionId(ctx.seq, seat, "order"),
        items: pc.items.map((i) => ({
          ...(i.cardId ? { card: i.cardId } : {}),
          key: i.key,
          label: i.label ?? (i.cardId ? ctx.label(i.cardId) : i.key),
        })),
        kind: "order",
        prompt: pc.prompt ?? "Choose an order",
      };
      return d;
    }
    // rule 355.13 / 373 / 355.11.b — generic min..max multi-pick in ONE answer.
    case "pick-many": {
      const slotSemantics = (pc as { slotSemantics?: "split" | "upTo" }).slotSemantics;
      // rule 809.1.c.1 / 429.3 — a surcharged set prices each option and keeps
      // the unaffordable ones listed with `needsAdd`; the seat's rune Adds ride
      // along so a UI can fund the pick without closing the prompt.
      const pmSurcharge = surchargeAnnotator(ctx, seat);
      const pmActions = promptIsSurcharged(pc)
        ? groupActions(ctx, ctx.legal(seat).filter((m) => m.moveId !== "resolvePendingChoice")).options
        : [];
      const d: PickDecision = {
        ...base,
        ...(pmActions.length > 0 ? { actions: pmActions } : {}),
        allowDecline: pc.min === 0,
        id: decisionId(ctx.seq, seat, "pick"),
        kind: "pick",
        max: pc.max,
        min: pc.min,
        options: pc.options.map((o) => ({
          ...(o.cardId ? { card: o.cardId } : {}),
          ...(typeof (o as { deflect?: number }).deflect === "number" ? { deflect: (o as { deflect: number }).deflect } : {}),
          ...pmSurcharge((o as { deflect?: number }).deflect ?? 0),
          key: o.key,
          label:
            (o.label ?? (o.cardId ? ctx.label(o.cardId) : o.key)) +
            (typeof (o as { deflect?: number }).deflect === "number" ? ` (+${(o as { deflect: number }).deflect} [Deflect])` : ""),
        })),
        prompt: pc.prompt ?? `Choose ${pc.min === pc.max ? pc.min : `${pc.min}–${pc.max}`}`,
        // rule 356.4.b — the caster's "[N] or [rainbow] less" election.
        ...(pc.resume?.kind === "cost-election" ? { meta: { arg: "cost-election" } } : {}),
        // rule 355.10.d.2 — a forced set with one candidate is still chosen.
        ...((pc as { soleOption?: true }).soleOption === true ? { soleOption: true as const } : {}),
        // rule 355.13 / 355.14.b — a finalization-time target set.
        ...(slotSemantics === "split" ? { targeting: "split-targets" as const } : slotSemantics === "upTo" ? { targeting: "up-to" as const } : {}),
        semantics:
          pc.semantics === "replacement-assign"
            ? "replacement-assign"
            : pc.semantics === "subset"
              ? "subset"
              : pc.semantics === "drop"
                ? "drop-target"
                : "target",
      };
      return d;
    }
    // rule 751–755 — one slot of a finalized item's NEW CHOICES dialog: shown
    // as a pick over that slot (semantics by slot kind, the current value marked)
    // with the whole dialog on `newChoices`; `decline` keeps the slot.
    case "new-choices": {
      const nc = pc;
      const slot = nc.slots[nc.cursor];
      const kind = slot?.kind ?? "target";
      const semantics: PickSemantics = kind === "mode" ? "mode" : kind === "destination" ? "destination" : "target";
      const d: PickDecision = {
        ...base,
        allowDecline: nc.keepable,
        id: decisionId(ctx.seq, seat, "pick"),
        kind: "pick",
        max: nc.max,
        min: nc.keepable ? 0 : nc.min,
        newChoices: {
          grantedBy: nc.grantedBy,
          itemId: nc.itemId,
          slot: slot ? { current: [...slot.current], key: slot.key, kind: slot.kind, label: slot.label, ...(slot.parent ? { parent: slot.parent } : {}) } : { current: [], key: "?", kind: "target", label: "?" },
          slots: nc.slots.map((s) => ({ current: [...s.current], key: s.key, kind: s.kind, label: s.label, ...(s.parent ? { parent: s.parent } : {}), status: s.status })),
        },
        options: nc.options.map((o) => ({
          ...(o.cardId ? { card: o.cardId } : {}),
          ...(o.zone ? { zone: o.zone } : {}),
          ...(o.mode !== undefined ? { mode: o.mode } : {}),
          ...(o.current ? { current: true } : {}),
          ...(o.deflectIgnored ? { deflectIgnored: o.deflectIgnored } : {}),
          key: o.key,
          // rule 355.3 — a mode reads as its printed bullet; rule 755 — a card notes the surcharge it would incur (ignored).
          label:
            (o.cardId ? ctx.label(o.cardId) : (o.label ?? o.key)) +
            (o.current && kind !== "mode" ? " (current)" : "") +
            (o.deflectIgnored ? ` (+${o.deflectIgnored} [Deflect] — ignored, 755)` : ""),
        })),
        prompt: nc.prompt,
        semantics,
        source: { ...base.source, cardId: nc.sourceCardId, chainItemId: nc.itemId, pendingChoiceType: nc.type },
        ...(nc.slotSemantics === "split" ? { targeting: "split-targets" as const } : nc.slotSemantics === "upTo" ? { targeting: "up-to" as const } : {}),
        timing: "RES",
      };
      return d;
    }
    case "reveal-and-pick": {
      const allowDecline = flat.some((m) => m.params.accept === false);
      const options: PickOption[] = flat
        .filter((m) => typeof m.params.pickedCardId === "string")
        .map((m) => {
          const id = m.params.pickedCardId as string;
          return { card: id, key: id, label: ctx.label(id) };
        });
      // rule 444.2.c / 419.2.a — picking a card the instruction then PLAYS
      // commits the picker to its remaining cost, so this prompt is a Pay step:
      // the Reaction [Add] abilities stay usable alongside the picks.
      const pickActions =
        pc.onPicked === "play"
          ? groupActions(
              ctx,
              ctx.legal(seat).filter((m) => m.moveId !== "resolvePendingChoice"),
            ).options
          : [];
      const d: PickDecision = {
        ...base,
        ...(pickActions.length > 0 ? { actions: pickActions } : {}),
        allowDecline,
        id: decisionId(ctx.seq, seat, "pick"),
        kind: "pick",
        // rule 422.1.a: "discard N" prompts take up to `remaining` picks in one answer.
        max: pc.remaining ?? 1,
        meta: { onPicked: pc.onPicked, onRest: pc.onRest, remaining: pc.remaining, revealer: pc.revealer },
        min: allowDecline ? 0 : 1,
        options,
        prompt: `Pick ${pc.remaining && pc.remaining > 1 ? `${pc.remaining} revealed cards` : "a revealed card"} to ${pc.onPicked}${recycleDestinationNote(pc.onPicked, options)}${allowDecline ? " (or decline)" : ""}`,
        semantics: "from-revealed",
      };
      return d;
    }
    // rule 386.2 (unl-062-219): "put the rest back in any order" — an
    // arrangement decision over the cards left on top; index 0 ends up topmost.
    case "order-cards": {
      const d: OrderDecision = {
        ...base,
        id: decisionId(ctx.seq, seat, "order"),
        items: pc.cards.map((id) => ({ card: id, key: id, label: ctx.label(id) })),
        kind: "order",
        prompt: "Put the cards back in any order (first = top)",
      };
      return d;
    }
    case "name-card": {
      const d: NameDecision = {
        ...base,
        cardType: pc.cardType,
        id: decisionId(ctx.seq, seat, "name"),
        kind: "name",
        prompt: `Name a ${pc.cardType} card`,
        vocabulary: pc.options,
      };
      return d;
    }
    case "choose-target": {
      // rule 355.14.e (ogn-041-298): fixed-total split — one allocation answer.
      if (pc.assign && typeof pc.total === "number") {
        const total = pc.total;
        // rule 355.14.f–h — targets locked at finalization: each still-legal
        // one ≥ `minPer` and ≤ `maxPer` (0..1 when they outnumber the damage).
        const bounded = pc as { minPer?: number; maxPer?: number; exactTargets?: number };
        const min = bounded.minPer ?? 0;
        const max = bounded.maxPer ?? total;
        const d: DistributeDecision = {
          ...base,
          buckets: pc.options.map((id) => ({ card: id, key: id, label: ctx.label(id), max, min })),
          id: decisionId(ctx.seq, seat, "distribute"),
          kind: "distribute",
          prompt:
            bounded.exactTargets !== undefined && bounded.exactTargets < pc.options.length
              ? `Split ${total} damage — 1 each to ${bounded.exactTargets} of the targets (the rest cease being targets)`
              : `Split ${total} damage among the targets`,
          total,
          // rule 355.10.d.2 — one surviving recipient is still an assignment
          // the chooser makes, so it is shown rather than applied silently.
          ...((pc as { soleOption?: true }).soleOption === true ? { soleOption: true as const } : {}),
        };
        return d;
      }
      if (pc.assign) {
        const d: DistributeDecision = {
          ...base,
          buckets: pc.options.map((id) => ({ card: id, key: id, label: ctx.label(id), max: 1, min: 0 })),
          id: decisionId(ctx.seq, seat, "distribute"),
          kind: "distribute",
          prompt: "Assign 1 damage",
          total: 1,
        };
        return d;
      }
      // rule 355.13 (ogn-141-298): "up to N" / "any number of" targets take
      // 0..N picks in one answer and may always be declined.
      const alreadyPicked = pc.anyNumber ? (pc.picked?.length ?? 0) : 0;
      const capacity = pc.anyNumber
        ? Math.max(1, Math.min(pc.maxPicks ?? pc.options.length, pc.options.length + alreadyPicked) - alreadyPicked)
        : 1;
      // rule 809.1.c.1 / 429.3 — a [Deflect]-taxed target pick keeps EVERY legal
      // candidate listed: the ones the pool cannot cover yet carry `needsAdd`
      // and become answerable the moment a rune Add funds them. The seat's Add
      // moves ride along on the decision so nobody has to pre-tap.
      const ctDeflect = (pc as { deflectPerOption?: Readonly<Record<string, number>> }).deflectPerOption ?? {};
      const ctSurcharge = surchargeAnnotator(ctx, seat);
      const ctActions = promptIsSurcharged(pc)
        ? groupActions(ctx, ctx.legal(seat).filter((m) => m.moveId !== "resolvePendingChoice")).options
        : [];
      const d: PickDecision = {
        ...base,
        ...(ctActions.length > 0 ? { actions: ctActions } : {}),
        allowDecline: pc.anyNumber === true || pc.optional === true,
        id: decisionId(ctx.seq, seat, "pick"),
        kind: "pick",
        max: capacity,
        min: pc.optional === true && pc.anyNumber !== true ? 0 : 1,
        options: pc.options.map((id) => {
          const surcharge = ctDeflect[id] ?? 0;
          return {
            card: id,
            ...(surcharge > 0 ? { deflect: surcharge } : {}),
            ...ctSurcharge(surcharge),
            key: id,
            label: ctx.label(id) + (surcharge > 0 ? ` (+${surcharge} [Deflect])` : ""),
          };
        }),
        prompt: pc.boundTargets ? "Choose a target to drop" : `Choose a target for ${source.cardId ? ctx.label(source.cardId) : "the effect"}`,
        semantics: pc.boundTargets ? "drop-target" : "target",
        // rule 355.10.d.2 — one legal option is still a choice; flag it so the
        // UI can confirm in one click and `settle()` never stalls on it.
        ...((pc as { soleOption?: true }).soleOption === true ? { soleOption: true as const } : {}),
        // rule 402.1 / 402.2 — a declinable choice made while an item is
        // FINALIZED is the controller's announced choice: hand it back to the
        // caller instead of letting the passive policy decline it silently.
        ...(pc.optional === true &&
        pc.anyNumber !== true &&
        (pc as { bindToChainItemId?: string }).bindToChainItemId !== undefined
          ? { targeting: "up-to" as const }
          : {}),
      };
      return d;
    }
    case "choose-destination": {
      // rule-id: sfd-109-221 (rule 356.1.b.3) — a pending play may offer the
      // unit's optional additional cost; surface it as a "<zone>+pay" pick.
      const payable = new Set(
        flat.filter((m) => m.params.paidAdditionalCost === true).map((m) => String(m.params.pickedZoneId)),
      );
      // rule-id: ogn-262-298 (rule 355.13) — "You may move …": the move can be
      // declined, so the destination pick is not forced.
      const declinable = flat.some((m) => m.params.accept === false);
      const d: PickDecision = {
        ...base,
        allowDecline: declinable,
        id: decisionId(ctx.seq, seat, "pick"),
        kind: "pick",
        max: 1,
        min: declinable ? 0 : 1,
        options: pc.options.flatMap((z) => [
          { key: z, label: z, zone: z },
          ...(payable.has(z)
            ? [{ key: `${z}+pay`, label: `${z} (pay additional cost)`, value: { payOptional: true }, zone: z }]
            : []),
        ]),
        prompt: `Choose a destination for ${ctx.label(pc.cardId)}`,
        semantics: "destination",
        // rule 355.10.d.2 — one legal destination is still a choice. (An
        // optional additional cost can still add a "<zone>+pay" variant, so the
        // decision may list two answers for that one zone.)
        ...((pc as { soleOption?: true }).soleOption === true ? { soleOption: true as const } : {}),
        // `cardId` is the MOVER; a play-time choice (rule 355.4) also names its chain item.
        source: { ...base.source, cardId: pc.cardId, pendingChoiceType: pc.type },
      };
      return d;
    }
    case "choose-mode": {
      // rule 752.1 (ven-152-166) — "you MAY make new choices" menus are declinable.
      const modeDeclinable = pc.optional === true;
      const d: PickDecision = {
        ...base,
        allowDecline: modeDeclinable,
        id: decisionId(ctx.seq, seat, "pick"),
        kind: "pick",
        max: 1,
        min: modeDeclinable ? 0 : 1,
        options: pc.options.map((idx) => ({ key: String(idx), label: modeLabel(pc.effect, idx), mode: idx })),
        prompt: "Choose a mode",
        semantics: "mode",
        // rule 355.10.d.2 — one legal mode is still a choice.
        ...((pc as { soleOption?: true }).soleOption === true ? { soleOption: true as const } : {}),
      };
      return d;
    }
    // rule-id: unl-130-219 (rules 182–185) — "choose an opponent": each option
    // IS a seat, so its key is the seat id.
    case "choose-player": {
      const d: PickDecision = {
        ...base,
        allowDecline: false,
        id: decisionId(ctx.seq, seat, "pick"),
        kind: "pick",
        max: 1,
        min: 1,
        options: pc.options.map((p) => ({ key: p, label: p, seatRef: p })),
        prompt: pc.prompt ?? "Choose a player",
      };
      return d;
    }
    case "pay-x": {
      // rule 204.3.b / 444.2 (ogn-268-298): name X now; 0 is always legal.
      // rule 444.2.c: the ceiling is what the pool holds AT THE MOMENT of
      // payment — Reaction [Add] abilities cracked during the prompt raise it.
      const payPool = ctx.state.runePools[pc.playerId]?.power ?? {};
      const payMax = Object.values(payPool).reduce<number>((a, b) => a + (b ?? 0), 0);
      // rule 429.3.a: Reaction [Add] abilities may still be activated here.
      const payActions = groupActions(
        ctx,
        ctx.legal(seat).filter((m) => m.moveId !== "resolvePendingChoice"),
      ).options;
      const d: IntegerDecision = {
        ...base,
        ...(payActions.length > 0 ? { actions: payActions } : {}),
        id: decisionId(ctx.seq, seat, "integer"),
        kind: "integer",
        max: Math.max(pc.max, payMax),
        min: 0,
        prompt: `Pay any amount of [rainbow] for ${ctx.label(pc.sourceCardId)}`,
        unit: "rainbow",
      };
      return d;
    }
    case "confirm": {
      // rule 355.13 (ogn-153-298): a bare "you may …" is a real yes/no.
      const d: YesNoDecision = {
        ...base,
        canAccept: true,
        consequence: "Perform the optional effect",
        id: decisionId(ctx.seq, seat, "yes-no"),
        kind: "yes-no",
        prompt: pc.prompt ?? `${ctx.label(pc.sourceCardId)}: perform the optional effect?`,
      };
      return d;
    }
    case "opt-in": {
      // rule-id: sfd-119-221 — surface the "pay [N] to …" cost in the prompt.
      const cost = (
        pc.resolved as
          | {
              optInCost?: {
                energy?: number;
                power?: string[];
                exhaust?: boolean;
                xp?: number;
                discard?: number;
              };
            }
          | undefined
      )?.optInCost;
      const costParts: string[] = [];
      if (cost?.energy) {
        costParts.push(`[${cost.energy}]`);
      }
      for (const p of cost?.power ?? []) {
        costParts.push(`[${p}]`);
      }
      // rule-id: unl-135-219 — "you may pay 2 XP": XP and discard costs are
      // opt-in costs too and must be named before the player answers.
      if (cost?.xp) {
        costParts.push(`[${cost.xp} XP]`);
      }
      if (cost?.discard) {
        costParts.push(`[discard ${cost.discard}]`);
      }
      // rule 383.3.b / 745 (ogn-282-298) — "spend a buff to …" is a base cost too.
      if ((cost as { spendBuff?: number } | undefined)?.spendBuff) {
        costParts.push("[spend a buff]");
      }
      // rule 404.2 / 809.1.c.1 — the [Deflect] surcharge this item's own choice
      // will owe is part of the same answer, so name it alongside the base cost.
      const deflectPips = (pc as { deflectSurcharge?: number }).deflectSurcharge ?? 0;
      for (let i = 0; i < deflectPips; i++) {
        costParts.push("[rainbow]");
      }
      let costText = costParts.length > 0 ? `Pay ${costParts.join("")}` : "";
      if (deflectPips > 0) {
        costText = `${costText} ([Deflect])`;
      }
      if (cost?.exhaust) {
        costText = costText ? `${costText} and exhaust` : "Exhaust";
      }
      costText = costText ? `${costText} to use` : "Use";
      // rule 383.3.a / 205 / 444.2 — a "you may pay [C]. If you do, …" trigger is
      // opted into NOW (finalization) but its Pay is a game action performed —
      // and separately declinable — as it RESOLVES; say so on the first prompt.
      const finItemId = (pc as { finalizationChainItemId?: string }).finalizationChainItemId;
      const resEffect = (pc.resolved as { effect?: { type?: string; condition?: { type?: string; cost?: { energy?: number; power?: string[]; xp?: number } } } } | undefined)?.effect;
      let laterPay = "";
      if (finItemId !== undefined && cost === undefined && resEffect?.type === "conditional" && resEffect.condition?.type === "pay-cost") {
        const c = resEffect.condition.cost ?? {};
        const parts = [
          ...(c.energy ? [`[${c.energy}]`] : []),
          ...(c.power ?? []).map((p) => `[${p}]`),
          ...(c.xp ? [`[${c.xp} XP]`] : []),
        ];
        laterPay = ` (you pay ${parts.join("") || "its cost"} as it resolves)`;
      }
      // rule 444.2.c / 429.3.a: a Pay demanded by a resolving/finalizing ability
      // is still a Pay step — Reaction [Add] abilities stay activatable here, so
      // the seat's remaining actions ride alongside the yes/no.
      const optInActions = groupActions(
        ctx,
        ctx.legal(seat).filter((m) => m.moveId !== "resolvePendingChoice"),
      ).options;
      // rule 429.3 / 357.1.a (DESIGN.md §Paying costs) — "yes" that only the
      // pool's CURRENT contents make illegal is still reachable: the payer may
      // tap/recycle runes while this prompt is open and then accept. Offer it
      // (so no one has to pre-tap before the ability is even shown) but say what
      // is missing; the accept move itself stays refused until the pool covers it.
      const acceptLegal = flat.some((m) => m.params.accept === true);
      const needsAdd = acceptLegal
        ? undefined
        : promptNeedsAdd(
            ctx.state,
            seat as string,
            ctx.legal(seat).filter((m) => m.moveId !== "resolvePendingChoice"),
            pc,
          );
      const d: YesNoDecision = {
        ...base,
        ...(optInActions.length > 0 ? { actions: optInActions } : {}),
        ...(needsAdd ? { needsAdd } : {}),
        // rule 383.3.b (ogn-072-298): "yes" is only legal when the opt-in cost is
        // payable — now, or after the Reaction [Add] abilities `needsAdd` names.
        canAccept: acceptLegal || needsAdd !== undefined,
        consequence: "Perform the optional triggered ability",
        id: decisionId(ctx.seq, seat, "yes-no"),
        kind: "yes-no",
        // rule 805.1.a — a granted [Accelerate] is one of SEVERAL optional
        // additional costs a play may carry, so its prompt names the keyword
        // rather than the card's own "optional ability".
        prompt: /^accelerate/.test((pc as { playCostId?: string }).playCostId ?? "")
          ? `${costText} ${ctx.label(pc.sourceCardId)}'s [Accelerate]?${laterPay}`
          : `${costText} ${ctx.label(pc.sourceCardId)}'s optional ability?${laterPay}`,
      };
      return d;
    }
    case "combat-damage": {
      // rule 465.2.c.3 — one allocation covering this side's whole combat damage.
      const d: DistributeDecision = {
        ...base,
        // rule 465.2.c.4.a / 465.2.c.5 — `lethal` is the ASSIGNED amount that
        // makes the unit lethal through its damage replacements (Double / Prevent).
        buckets: pc.options.map((id) => ({
          card: id,
          key: id,
          label: `${ctx.label(id)} (lethal at ${pc.lethalNeed[id] ?? "?"})`,
          ...(pc.lethalNeed[id] !== undefined ? { lethal: pc.lethalNeed[id] } : {}),
          max: pc.total,
          min: 0,
        })),
        defaultAllocation: { ...pc.defaultAllocation },
        id: decisionId(ctx.seq, seat, "distribute"),
        kind: "distribute",
        prompt: `Assign ${pc.total} combat damage`,
        total: pc.total,
      };
      return d;
    }
    case "weaponmaster-equip": {
      const d: PickDecision = {
        ...base,
        allowDecline: true,
        id: decisionId(ctx.seq, seat, "pick"),
        kind: "pick",
        max: 1,
        min: 0,
        // rule-id: sfd-119-221-weaponmaster-pays-reduced-equip-cost — only
        // payable equipment is enumerated (rule 821.1.c.5).
        options: flat
          .filter((m) => typeof m.params.pickedCardId === "string")
          .map((m) => {
            const id = m.params.pickedCardId as string;
            return { card: id, key: id, label: ctx.label(id) };
          }),
        prompt: `Weaponmaster: equip ${ctx.label(pc.unitId)}?`,
        semantics: "equip",
        source: { cardId: pc.unitId, pendingChoiceType: pc.type },
      };
      return d;
    }
    default: {
      const never: never = pc;
      throw new Error(`Unhandled pendingChoice ${(never as { type: string }).type}`);
    }
  }
}

/**
 * rule 117 — "In turn order, players perform their Mulligan": after the opening
 * draw (116) the First Player is asked first and the next seat only once the
 * previous one has resolved, each seat over its OWN four cards, "up to two"
 * (117.1). Surfaced as a normal pick so the pregame is reachable through the
 * Decision/Answer protocol instead of raw setup moves.
 */
function deriveMulliganDecision(ctx: DecisionContext): Decision | null {
  const { state } = ctx;
  const setup = state.setup;
  const first = setup?.firstPlayer as Seat | undefined;
  if (!setup || first === undefined || !ctx.handOf) {
    return null;
  }
  const rest = Object.keys(state.players).filter((p) => p !== first);
  const second = setup.secondPlayer as Seat | undefined;
  const order: Seat[] = [
    first,
    ...(second !== undefined && second !== first ? [second] : []),
    ...rest.filter((p) => p !== second),
  ];
  const done = (setup.mulliganedBy ?? []) as readonly string[];
  const seat = order.find((p) => !done.includes(p));
  if (seat === undefined) {
    return null;
  }
  const hand = ctx.handOf(seat);
  // rule 116 precedes 117: nothing to mulligan before the opening draw.
  if (hand.length === 0) {
    return null;
  }
  const d: PickDecision = {
    allowDecline: true,
    id: decisionId(ctx.seq, seat, "pick", "mulligan"),
    kind: "pick",
    // rule 117.1: "up to two cards in their hand" — zero is a legal answer.
    max: 2,
    min: 0,
    options: hand.map((id) => ({ card: id, key: id, label: ctx.label(id) })),
    prompt: "Mulligan: set aside up to two cards",
    seat,
    source: { moveId: "mulligan" },
    timing: "PRE",
  };
  return d;
}

/**
 * rule 113 / 486.5 — "each player selects one of their three Battlefields; the
 * other two are set aside". The keep is the SEAT's, so it is surfaced as a pick
 * over exactly that seat's registered battlefields (in turn order, First Player
 * first) rather than defaulting to the first one registered. A seat that
 * registered a single battlefield has nothing to decide (355.5).
 */
function deriveBattlefieldSelectionDecision(ctx: DecisionContext): Decision | null {
  const { state } = ctx;
  const setup = state.setup;
  if (!setup || !ctx.registeredBattlefieldsOf) {
    return null;
  }
  const chosen = (setup.battlefieldChoices ?? {}) as Record<string, string | undefined>;
  const first = setup.firstPlayer as Seat | undefined;
  const order: Seat[] = [
    ...(first !== undefined ? [first] : []),
    ...Object.keys(state.players).filter((p) => p !== first),
  ];
  for (const seat of order) {
    // rule 485.4.a — one selection per seat per game.
    if (chosen[seat] !== undefined) {
      continue;
    }
    const options = ctx.registeredBattlefieldsOf(seat);
    if (options.length < 1) {
      continue;
    }
    const d: PickDecision = {
      allowDecline: false,
      id: decisionId(ctx.seq, seat, "pick", "selectBattlefield"),
      kind: "pick",
      max: 1,
      min: 1,
      options: options.map((id) => ({ card: id, key: id, label: ctx.label(id) })),
      // rule 355.10.d.2 — one registered battlefield is still the one the seat
      // KEEPS: asked, not assumed.
      ...(options.length === 1 ? { soleOption: true as const } : {}),
      prompt: "Select the battlefield you keep; the rest are set aside",
      seat,
      source: { moveId: "selectBattlefield" },
      timing: "PRE",
    };
    return d;
  }
  return null;
}

/** The cursor seat's decision, or null when the game is over / nobody can act. */
export function deriveDecision(ctx: DecisionContext): Decision | null {
  const { state } = ctx;
  if (state.status === "setup") {
    // rule 113 precedes 117: battlefields are chosen before the Mulligan.
    return deriveBattlefieldSelectionDecision(ctx) ?? deriveMulliganDecision(ctx);
  }
  if (state.status !== "playing") {
    return null;
  }
  if (state.pendingChoice) {
    return deriveFromPendingChoice(ctx, state.pendingChoice);
  }
  // rule 383.3.d — the soft trigger-order offer: shown as the cursor decision
  // so the seat MAY order([...]); any other verb accepts the listed order.
  if (state.pendingTriggerOrder) {
    return deriveFromPendingChoice(ctx, state.pendingTriggerOrder);
  }
  const seat = getActingSeat(state);
  if (!seat) {
    return null;
  }
  return deriveActionDecision(ctx, seat, true);
}

// ---------------------------------------------------------------------------
// Pending-choice answers → resolvePendingChoice params
// ---------------------------------------------------------------------------

export type ResolveOutcome =
  | { type: "move"; move: FlatMove }
  | { type: "error"; error: HarnessErrorInfo };

function err(code: HarnessErrorInfo["code"], message: string, detail?: Record<string, unknown>): ResolveOutcome {
  return { error: { code, detail, message }, type: "error" };
}

export function resolvePendingAnswer(ctx: DecisionContext, decision: Decision, answer: Answer): ResolveOutcome {
  const pc = ctx.state.pendingChoice ?? ctx.state.pendingTriggerOrder;
  if (!pc) {
    return err("STALE_DECISION", "No pending choice");
  }
  const seat = decision.seat;
  const flat = ctx.legal(seat, ["resolvePendingChoice"]);
  const params: Record<string, unknown> = { playerId: seat };

  // Generic kinds validate in the engine condition and accept answers beyond
  // the enumerated sample (any permutation / any legal key list).
  if (pc.type === "order") {
    let keys: string[];
    if (answer.kind === "order" || answer.kind === "pick") {
      // Card ids are accepted for keys; a PARTIAL list names what goes first
      // and keeps the listed order for the rest ("pick zh" = "zh first").
      keys = answer.keys.map((k) => pc.items.find((i) => i.key === k)?.key ?? pc.items.find((i) => i.cardId === k)?.key ?? k);
      if (keys.length < pc.items.length) {
        keys = [...keys, ...pc.items.map((i) => i.key).filter((k) => !keys.includes(k))];
      }
    } else if (answer.kind === "decline" && pc.defaultable) {
      keys = [];
    } else {
      return err("WRONG_ANSWER_KIND", "order needs an order answer");
    }
    if (keys.length > 0) {
      params.orderedKeys = keys;
    }
    if (ctx.canExecute && !ctx.canExecute(seat, "resolvePendingChoice", params)) {
      return err("ILLEGAL_ARGS", "Not a permutation of the offered items", {
        items: pc.items.map((i) => i.key),
        keys,
      });
    }
    return { move: { moveId: "resolvePendingChoice", params, playerId: seat }, type: "move" };
  }
  // rule 751–755 — a NEW CHOICES slot: `decline` keeps it; keys may be card
  // ids, bare battlefield ids or mode numbers; validated by the engine condition.
  if (pc.type === "new-choices") {
    if (answer.kind === "decline" || (answer.kind === "yes-no" && answer.value === false)) {
      params.keep = true;
    } else if (answer.kind === "pick" || answer.kind === "order") {
      if (pc.max <= 1 && answer.keys.length !== 1) {
        return err("ILLEGAL_ARGS", "This slot takes exactly one value (decline to keep it)", { keys: answer.keys });
      }
      params.pickedKeys = answer.keys.map((k) => {
        const s = String(k);
        return (
          pc.options.find((o) => o.key === s || o.cardId === s || o.zone === s || o.zone === `battlefield-${s}` || (o.mode !== undefined && String(o.mode) === s))?.key ?? s
        );
      });
    } else if (answer.kind === "integer") {
      params.pickedKeys = [String(answer.value)];
    } else {
      return err("WRONG_ANSWER_KIND", "A new-choices slot needs a pick (or decline to keep it)");
    }
    if (ctx.canExecute && !ctx.canExecute(seat, "resolvePendingChoice", params)) {
      return err("ILLEGAL_ARGS", params.keep ? "This slot must be re-chosen — its previous value no longer exists (753.1)" : "Not a legal new choice for this slot (753.1)", {
        options: pc.options.map((o) => o.key),
        wanted: params,
      });
    }
    return { move: { moveId: "resolvePendingChoice", params, playerId: seat }, type: "move" };
  }
  if (pc.type === "pick-many") {
    let keys: string[];
    if (answer.kind === "pick") {
      keys = [...answer.keys];
    } else if (answer.kind === "decline") {
      keys = [];
    } else if (answer.kind === "order") {
      keys = [...answer.keys];
    } else {
      return err("WRONG_ANSWER_KIND", "pick-many needs a pick answer");
    }
    // Card ids are accepted for keys.
    params.pickedKeys = keys.map((k) => pc.options.find((o) => o.key === k || o.cardId === k)?.key ?? k);
    if (ctx.canExecute && !ctx.canExecute(seat, "resolvePendingChoice", params)) {
      return err("ILLEGAL_ARGS", `Pick ${pc.min}..${pc.max} of the offered options${pc.constraint ? " meeting the requirement" : ""}`, {
        keys,
        options: pc.options.map((o) => o.key),
      });
    }
    return { move: { moveId: "resolvePendingChoice", params, playerId: seat }, type: "move" };
  }

  const pickKey = (): string | undefined | ResolveOutcome => {
    if (answer.kind === "decline") {
      return undefined;
    }
    if (answer.kind !== "pick") {
      return err("WRONG_ANSWER_KIND", `Decision ${decision.kind} cannot take a ${answer.kind} answer`);
    }
    if (answer.keys.length === 0) {
      return undefined;
    }
    if (answer.keys.length > 1) {
      return err("ILLEGAL_ARGS", "This engine prompt accepts exactly one pick", { keys: answer.keys });
    }
    return answer.keys[0];
  };

  switch (pc.type) {
    case "reveal-and-pick":
    case "weaponmaster-equip":
    case "choose-target": {
      // rule 355.14.e (ogn-041-298): fixed-total split → `allocation` param.
      if (pc.type === "choose-target" && pc.assign && typeof pc.total === "number") {
        let allocation: Record<string, number>;
        if (answer.kind === "distribute") {
          allocation = {};
          for (const [k, n] of Object.entries(answer.allocation)) {
            if (n > 0) allocation[k] = n;
          }
        } else if (answer.kind === "pick" && answer.keys.length === 1) {
          allocation = { [answer.keys[0] as string]: pc.total };
        } else if (answer.kind === "decline" || (answer.kind === "pick" && answer.keys.length === 0)) {
          allocation = {};
        } else {
          return err("WRONG_ANSWER_KIND", "Split-damage decision needs a distribute (or single pick) answer");
        }
        params.allocation = allocation;
        break;
      }
      if (pc.type === "choose-target" && pc.assign) {
        if (answer.kind === "distribute") {
          const chosen = Object.entries(answer.allocation).filter(([, n]) => n > 0);
          if (chosen.length !== 1 || chosen[0]?.[1] !== 1) {
            return err("ILLEGAL_ARGS", "Assign exactly 1 to one bucket", { allocation: answer.allocation });
          }
          params.pickedCardId = chosen[0]?.[0];
          break;
        }
        if (answer.kind === "pick" && answer.keys.length === 1) {
          params.pickedCardId = answer.keys[0];
          break;
        }
        return err("WRONG_ANSWER_KIND", "Distribute decision needs a distribute (or single pick) answer");
      }
      // rule 355.13 (ogn-141-298): an "up to N" / "any number of" target
      // prompt accepts several picks in one answer.
      if (
        pc.type === "choose-target" &&
        pc.anyNumber === true &&
        answer.kind === "pick" &&
        (answer.keys.length > 1 ||
          (pc as { answerAsSet?: boolean }).answerAsSet === true) &&
        answer.keys.length <= (pc.maxPicks ?? pc.options.length)
      ) {
        params.pickedCardIds = [...answer.keys];
        break;
      }
      // rule 422.1.a (ogn-030-298): a "discard N" prompt accepts up to `remaining` picks at once.
      if (
        pc.type === "reveal-and-pick" &&
        answer.kind === "pick" &&
        answer.keys.length > 1 &&
        answer.keys.length <= (pc.remaining ?? 1)
      ) {
        params.pickedCardIds = [...answer.keys];
        break;
      }
      const k = pickKey();
      if (typeof k === "object") {
        return k;
      }
      if (k === undefined) {
        params.accept = false;
      } else {
        params.pickedCardId = k;
      }
      break;
    }
    case "choose-destination": {
      let k = pickKey();
      if (typeof k === "object") {
        return k;
      }
      if (k === undefined) {
        // rule 355.13 / 753.1 — an OPTIONAL destination prompt ("you may move
        // …", or a re-choice that may be left unmade) takes a decline as its
        // answer; a mandatory one still needs a zone.
        if (pc.optional === true) {
          params.accept = false;
          break;
        }
        return err("ILLEGAL_ARGS", "A destination must be chosen");
      }
      // A bare battlefield id ("bf2") is accepted for the zone id
      // ("battlefield-bf2") so destination answers read like target answers.
      if (!pc.options.includes(k) && pc.options.includes(`battlefield-${k}`)) {
        k = `battlefield-${k}`;
      }
      // Destinations are ZONE ids (base / battlefield-<bfId>), but every other
      // harness surface names a battlefield by its bare id — accept both.
      const toZone = (z: string): string =>
        pc.options.includes(z) || !pc.options.includes(`battlefield-${z}`) ? z : `battlefield-${z}`;
      // rule-id: sfd-109-221 — "<zone>+pay" elects the optional additional cost.
      if (k.endsWith("+pay")) {
        params.paidAdditionalCost = true;
        params.pickedZoneId = toZone(k.slice(0, -"+pay".length));
      } else {
        params.pickedZoneId = toZone(k);
      }
      break;
    }
    // rule-id: unl-130-219 — the picked key is the seat id itself.
    case "choose-player": {
      const k = pickKey();
      if (typeof k === "object") {
        return k;
      }
      if (k === undefined) {
        return err("ILLEGAL_ARGS", "A player must be chosen");
      }
      params.pickedPlayerId = k;
      break;
    }
    case "choose-mode": {
      let k: string | undefined | ResolveOutcome;
      // rule 752.1 (ven-152-166) — declining a re-choice menu keeps the old choices.
      if (answer.kind === "decline") {
        params.accept = false;
        break;
      }
      if (answer.kind === "integer") {
        k = String(answer.value);
      } else {
        k = pickKey();
      }
      if (typeof k === "object") {
        return k;
      }
      if (k === undefined) {
        return err("ILLEGAL_ARGS", "A mode must be chosen");
      }
      params.pickedMode = Number(k);
      break;
    }
    case "pay-x": {
      if (answer.kind !== "integer") {
        return err("WRONG_ANSWER_KIND", "pay-x needs an integer answer");
      }
      params.xAmount = answer.value;
      break;
    }
    case "confirm":
    case "opt-in": {
      if (answer.kind === "yes-no") {
        params.accept = answer.value;
      } else if (answer.kind === "decline") {
        params.accept = false;
      } else {
        return err("WRONG_ANSWER_KIND", "opt-in needs a yes-no answer");
      }
      break;
    }
    case "combat-damage": {
      // rule 465.2.c.3 — one allocation answer; zero buckets are dropped so it
      // compares canonically against the enumerated legal assignments.
      if (answer.kind === "distribute") {
        const allocation: Record<string, number> = {};
        for (const [k, n] of Object.entries(answer.allocation)) {
          if (n > 0) allocation[k] = n;
        }
        params.allocation = allocation;
      } else if (answer.kind === "pick" && answer.keys.length === 1) {
        params.allocation = { [answer.keys[0] as string]: pc.total };
      } else {
        return err("WRONG_ANSWER_KIND", "Combat damage assignment needs a distribute answer");
      }
      break;
    }
    // rule 386.2 (unl-062-219): the answer is the full arrangement.
    case "order-cards": {
      if (answer.kind === "order") {
        params.orderedCardIds = [...answer.keys];
      } else if (answer.kind === "pick" && answer.keys.length === pc.cards.length) {
        params.orderedCardIds = [...answer.keys];
      } else {
        return err("WRONG_ANSWER_KIND", "order-cards needs an order answer listing every card");
      }
      break;
    }
    case "name-card": {
      if (answer.kind === "name") {
        params.pickedName = answer.name;
      } else if (answer.kind === "pick" && answer.keys.length === 1) {
        params.pickedName = answer.keys[0];
      } else {
        return err("WRONG_ANSWER_KIND", "name-card needs a name answer");
      }
      break;
    }
    default: {
      return err("WRONG_ANSWER_KIND", `Unhandled pending choice`);
    }
  }

  // rule 422.1.a: a multi-pick answer is legal when each key is an enumerated single pick.
  if (Array.isArray(params.pickedCardIds)) {
    const keys = params.pickedCardIds as string[];
    const singles = keys.map((id) => flat.find((m) => canonicalJson(m.params) === canonicalJson({ pickedCardId: id, playerId: seat })));
    if (new Set(keys).size === keys.length && singles.every((m) => m !== undefined)) {
      const first = singles[0] as FlatMove;
      return { move: { moveId: first.moveId, params, playerId: first.playerId }, type: "move" };
    }
  }
  const wanted = canonicalJson(params);
  const legal = flat.find((m) => canonicalJson(m.params) === wanted);
  if (!legal) {
    return err("UNKNOWN_OPTION", "That answer is not among the legal resolutions", {
      legal: flat.map((m) => m.params),
      wanted: params,
    });
  }
  return { move: legal, type: "move" };
}

// ---------------------------------------------------------------------------
// Action answers → narrowing
// ---------------------------------------------------------------------------

export type NarrowResult =
  | { type: "one"; move: FlatMove }
  | { type: "none"; error: HarnessErrorInfo }
  | { type: "many"; field: string; choices: PickOption[]; variants: FlatMove[] }
  | { type: "needX"; variant: FlatMove; min: number; max: number };

function normLoc(v: unknown): string {
  const s = String(v ?? "");
  return s.startsWith("battlefield-") ? s.slice("battlefield-".length) : s;
}

function asArray(v: CardRef | readonly CardRef[] | undefined): readonly CardRef[] | undefined {
  if (v === undefined) {
    return undefined;
  }
  return typeof v === "string" ? [v] : v;
}

function sameSet(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const sa = [...a].map(String).sort();
  const sb = [...b].map(String).sort();
  return sa.every((x, i) => x === sb[i]);
}

function sameOrdered(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((x, i) => String(x) === String(b[i]));
}

type Constraint = {
  param: string;
  test: (v: unknown, params: Readonly<Record<string, unknown>>) => boolean;
  describe: unknown;
  /** Engine-shaped value for this param, so a refused candidate can be PROBED (see `explainRefusal`). */
  probe?: unknown;
};

function constraintsFrom(option: ActionOption, args: PlayArgs): Constraint[] {
  const cs: Constraint[] = [];
  const targets = asArray(args.targets);
  if (targets) {
    cs.push({
      describe: targets,
      param: "targets",
      test: (v) => Array.isArray(v) && (sameOrdered(v, targets) || sameSet(v, targets)),
    });
  }
  if (args.units) {
    const units = args.units;
    cs.push({ describe: units, param: "unitIds", test: (v) => Array.isArray(v) && sameSet(v, units) });
  }
  if (args.repeat !== undefined) {
    const n = args.repeat;
    cs.push({ describe: n, param: "repeatCount", test: (v) => (Number(v ?? 0) || 0) === n });
  }
  if (args.mode !== undefined) {
    const m = args.mode;
    cs.push({ describe: m, param: "mode", test: (v) => v !== undefined && Number(v) === m });
  }
  if (args.flow !== undefined) {
    const f = args.flow;
    cs.push({ describe: f, param: "viaFlow", test: (v) => (v === true) === f });
  }
  const pay = args.payOptional ?? args.accelerate;
  if (pay !== undefined) {
    cs.push({ describe: pay, param: "paidAdditionalCost", test: (v) => (v === true) === pay });
  }
  if (args.sacrifice !== undefined) {
    const s = args.sacrifice;
    cs.push({ describe: s, param: "sacrificeId", test: (v) => v === s });
  }
  if (args.discard !== undefined) {
    const s = args.discard;
    cs.push({ describe: s, param: "discardId", test: (v) => v === s });
  }
  if (args.costTarget !== undefined) {
    const s = args.costTarget;
    cs.push({ describe: s, param: "chosenTargetId", test: (v) => v === s });
  }
  if (args.source !== undefined) {
    const s = args.source;
    cs.push({ describe: s, param: "sourceCardId", test: (v) => v === s });
  }
  if (args.abilityIndex !== undefined) {
    const s = args.abilityIndex;
    cs.push({ describe: s, param: "abilityIndex", test: (v) => Number(v ?? 0) === s });
  }
  if (args.domain !== undefined) {
    const s = args.domain;
    cs.push({ describe: s, param: "domain", test: (v) => v === s });
  }
  if (args.to !== undefined) {
    const want = normLoc(args.to);
    const locParam =
      option.moveId === "standardMove"
        ? "destination"
        : option.moveId === "gankingMove"
          ? "toBattlefield"
          : option.moveId === "hideCard"
            ? "battlefieldId"
            : "location";
    cs.push({
      describe: args.to,
      param: locParam,
      // `location` is a ZONE id ("battlefield-bfB"); the other three name the
      // battlefield bare. Both shapes are needed to probe a refused destination.
      probe: locParam === "location" ? (want === "base" ? "base" : `battlefield-${want}`) : want,
      test: (v) => normLoc(v) === want,
    });
  }
  if (args.costs !== undefined) {
    const want = args.costs;
    cs.push({ describe: want, param: "costs", test: (v, params) => costsMatch(v, params, want) });
  }
  for (const [k, val] of Object.entries(args.params ?? {})) {
    const want = canonicalJson(val);
    cs.push({ describe: val, param: k, test: (v) => canonicalJson(v) === want });
  }
  return cs;
}

/**
 * rule 355.1 — does a variant satisfy the `costs` the caller asked for? The
 * variant's own `costs` param (attached by the enumerators) must name the same
 * alternative and EXACTLY the requested paid ids; each requested id's objects
 * (a card or list) must equal the variant's; `true` accepts any objects.
 * A variant without `costs` matches only an empty request.
 */
function costsMatch(v: unknown, _params: Readonly<Record<string, unknown>>, want: NonNullable<PlayArgs["costs"]>): boolean {
  const have = (v ?? {}) as { alternativeId?: string; paid?: Record<string, true | { objects?: readonly string[] }> };
  if ((want.alternativeId ?? undefined) !== (have.alternativeId ?? undefined)) {
    return false;
  }
  const wantPaid = want.paid ?? {};
  const havePaid = have.paid ?? {};
  const wantIds = Object.keys(wantPaid).filter((k) => wantPaid[k] !== false).sort();
  const haveIds = Object.keys(havePaid).sort();
  if (wantIds.length !== haveIds.length || wantIds.some((id, i) => id !== haveIds[i])) {
    return false;
  }
  for (const id of wantIds) {
    const w = wantPaid[id];
    if (w === true || w === undefined) {
      continue;
    }
    const wantObjects = (Array.isArray(w) ? w : typeof w === "string" ? [w] : [...((w as { objects?: readonly string[] }).objects ?? [])]).map(String);
    const h = havePaid[id];
    const haveObjects = h === true || h === undefined ? [] : [...(h.objects ?? [])].map(String);
    if (!sameSet(haveObjects, wantObjects)) {
      return false;
    }
  }
  return true;
}

/** Preferences applied to UNSPECIFIED knobs, each only if it keeps ≥1 variant. */
const DEFAULT_PREFS: { param: string; keep: (v: unknown) => boolean }[] = [
  // rule 355.3 — no `mode` asked for: cast the spell as printed and let the
  // engine ask mode → target as it is played (`chooseMode()` / `pick()`).
  { keep: (v) => v === undefined, param: "mode" },
  { keep: (v) => v !== true, param: "paidAdditionalCost" },
  { keep: (v) => !v, param: "repeatCount" },
  { keep: (v) => v !== true, param: "viaFlow" },
  // rule 829.1.c.3 (ven-113-166) — a card with two [Flow] costs is offered
  // once per election; a plain `cast(card, { flow: true })` takes the printed
  // instance unless the test names `costs: { alternativeId: "flow-N" }`.
  { keep: (v) => !v, param: "flowIndex" },
  // rule 356.1 (unl-089-219) — an alternate play cost is opt-in: plain
  // `play(card)` takes the printed cost unless the test asks for it.
  { keep: (v) => v !== true, param: "altCost" },
  // rule 811.1.b (ogn-263-298 Swift Scout) — Hide is offered once per payable
  // price; a plain `hide(card, bf)` that elects nothing takes the granted
  // "you may pay [1] … instead" line and keeps the [rainbow] Power, since the
  // alternative is the cheaper resource to part with. Name the other half
  // (`hideCostElection: "power"`) to pay the printed cost.
  { keep: (v) => v !== "power", param: "hideCostElection" },
  { keep: (v) => v === undefined, param: "sacrificeId" },
  { keep: (v) => v === undefined, param: "discardId" },
  { keep: (v) => v === undefined, param: "chosenTargetId" },
  // rule 356.1.b (sfd-084-221) — a granted "ignoring its Energy cost" is now
  // enumerated both ways; plain `play(gear)` spends it, `params:
  // { useEnergyWaiver: false }` pays full price and keeps it.
  { keep: (v) => v !== false, param: "useEnergyWaiver" },
  // rule 355.2.a — every cost line of a unit play is offered at EVERY valid
  // destination (base and each battlefield a permission opens); plain
  // `play(card, {...costs})` without `to` means the default location, the base.
  { keep: (v) => v === undefined || v === "base", param: "location" },
];

function choiceFor(ctx: DecisionContext, field: string, value: unknown, card?: CardRef): PickOption {
  const kind = PARAM_ARG[field]?.kind ?? "enum";
  if (field === "mode" && typeof value === "number") {
    const labels = card ? spellModeLabels(getGlobalCardRegistry().getAbilities(card)) : [];
    return { key: String(value), label: labels[value] ?? `Mode ${value + 1}`, mode: value, value };
  }
  if (kind === "card" && typeof value === "string") {
    return { card: value, key: value, label: ctx.label(value), value };
  }
  if (kind === "cards" && Array.isArray(value)) {
    const ids = value as string[];
    return {
      key: ids.length ? ids.join("+") : "(none)",
      label: ids.length ? ids.map((id) => ctx.label(id)).join(" + ") : "(no target)",
      value,
    };
  }
  if (kind === "zone") {
    return { key: normLoc(value), label: String(value), value, zone: String(value) };
  }
  return { key: typeof value === "string" ? value : canonicalJson(value), label: String(value), value };
}

/**
 * rule 416.1.a / 416.1.b (424.4.a) — a recycle goes to the bottom of the
 * CORRESPONDING deck, and which deck that is changes what the answer means: a
 * rune returns to the Rune Deck, a Main Deck card to the Main Deck. Both read
 * as a bare "recycle" otherwise — the same prompt for two different things.
 */
function recycleDestinationNote(onPicked: string | undefined, options: readonly PickOption[]): string {
  if (onPicked !== "recycle" || options.length === 0) {
    return "";
  }
  const registry = getGlobalCardRegistry();
  const runes = options.filter((o) => registry.getCardType(o.card as string) === "rune").length;
  if (runes === options.length) {
    return " (to the bottom of your Rune Deck)";
  }
  if (runes === 0) {
    return " (to the bottom of your Main Deck)";
  }
  return " (to the bottom of its own deck — a rune to your Rune Deck, a card to your Main Deck)";
}

/**
 * Why the engine refuses the candidate the caller named, when no enumerated
 * variant matches it. The candidate is rebuilt in ENGINE shape (a representative
 * variant's params, overridden by what the caller asked for) and handed to the
 * move's own `condition` — the one site that decides legality — so the reason
 * names the blocking object and its rule instead of the argument.
 */
function explainRefusal(
  ctx: DecisionContext,
  option: ActionOption,
  constraints: readonly Constraint[],
): Refusal | undefined {
  const sample = option.variants[0];
  if (!sample || !ctx.explain) {
    return undefined;
  }
  const params: Record<string, unknown> = { ...sample.params };
  for (const c of constraints) {
    params[c.param] = c.probe ?? c.describe;
  }
  try {
    return ctx.explain(sample.playerId, option.moveId, params);
  } catch {
    return undefined;
  }
}

export function narrowVariants(ctx: DecisionContext, option: ActionOption, args: PlayArgs): NarrowResult {
  // rule 820.2.a — `modes` (one per [Repeat] execution) is never enumerated:
  // it rides straight onto the chosen variant together with its `targets`.
  if (args.modes !== undefined) {
    const { modes, targets, ...rest } = args;
    const extra: Record<string, unknown> = { modes: [...modes] };
    const list = asArray(targets);
    if (list) {
      extra.targets = [...list];
    }
    const inner = narrowVariants(ctx, option, rest);
    if (inner.type === "one") {
      return { move: { ...inner.move, params: { ...inner.move.params, ...extra } }, type: "one" };
    }
    if (inner.type === "needX") {
      return { ...inner, variant: { ...inner.variant, params: { ...inner.variant.params, ...extra } } };
    }
    if (inner.type === "many") {
      return { ...inner, variants: inner.variants.map((v) => ({ ...v, params: { ...v.params, ...extra } })) };
    }
    return inner;
  }
  const constraints = constraintsFrom(option, args);
  let variants = option.variants.filter((v) => constraints.every((c) => c.test(v.params[c.param], v.params)));
  if (variants.length === 0) {
    // A refusal must carry its cause: ask the move's own `condition` about the
    // exact candidate the caller named. "no legal variant matches to=\"bfB\""
    // reads as a claim about bfB; the engine knows it is the Mageseeker Warden,
    // or the unit in the group that has no [Ganking].
    const refusal = explainRefusal(ctx, option, constraints);
    return {
      error: {
        code: "ILLEGAL_ARGS",
        detail: {
          fields: option.fields.map((f) => ({ arg: f.arg, name: f.name, options: f.options })),
          given: constraints.map((c) => ({ [c.param]: c.describe })),
          option: option.key,
          ...(refusal ? { refusal } : {}),
        },
        message: refusal
          ? `${option.label}: ${refusal.message}`
          : `${option.label}: no legal variant matches ${constraints.map((c) => `${PARAM_ARG[c.param]?.arg ?? c.param}=${canonicalJson(c.describe)}`).join(", ")}`,
      },
      type: "none",
    };
  }
  const specified = new Set(constraints.map((c) => c.param));
  for (const pref of DEFAULT_PREFS) {
    if (specified.has(pref.param)) {
      continue;
    }
    const kept = variants.filter((v) => pref.keep(v.params[pref.param]));
    if (kept.length > 0) {
      variants = kept;
    }
  }
  // rule 356.4.c.1 (sfd-149-221 Ezreal) — one optional additional cost may be
  // priced several ways when a flexible "[1] or [A] less" discount applies, and
  // the inert half (nothing to shave, 356.6) keeps the full-price shape. A play
  // that names no `additionalCostSpec` takes the most discounted shape; a test
  // that wants another names it explicitly.
  if (!specified.has("additionalCostSpec")) {
    const weigh = (v: FlatMove): number => {
      const s = v.params.additionalCostSpec as { energy?: number; power?: readonly string[] } | undefined;
      return (s?.energy ?? 0) + (s?.power?.length ?? 0);
    };
    const priced = variants.filter((v) => v.params.additionalCostSpec !== undefined);
    if (priced.length > 1) {
      const min = Math.min(...priced.map(weigh));
      variants = variants.filter((v) => v.params.additionalCostSpec === undefined || weigh(v) === min);
    }
  }
  // A supplied `targets` list matches either order (set match) so tests need not
  // know slot order, but when the enumerator offers BOTH orders they mean
  // different things ("+2 to a unit and -2 to ANOTHER"): honour the exact order.
  {
    const ordered = asArray(args.targets);
    if (ordered) {
      const exact = variants.filter(
        (v) => Array.isArray(v.params.targets) && sameOrdered(v.params.targets as unknown[], ordered),
      );
      if (exact.length > 0) {
        variants = exact;
      } else {
        // rule 355.5 (ogn-248-298 Icathian Rain) — repeated identical slots
        // ("Deal 2 to a unit." ×6) are enumerated in one arbitrary board order,
        // but WHICH instance hits which unit is the player's choice: keep the
        // order the caller named so the instances land in that sequence.
        variants = variants.map((v) =>
          Array.isArray(v.params.targets) && sameSet(v.params.targets as unknown[], ordered)
            ? { ...v, params: { ...v.params, targets: [...ordered] } }
            : v,
        );
      }
    }
  }
  // Collapse exact duplicates (enumerators occasionally emit them).
  const seen = new Map<string, FlatMove>();
  for (const v of variants) {
    seen.set(canonicalJson(v.params), v);
  }
  variants = [...seen.values()];

  if (variants.length > 1) {
    const varying = new Set<string>();
    for (const name of Object.keys(Object.assign({}, ...variants.map((v) => v.params)) as Record<string, unknown>)) {
      if (HIDDEN_PARAMS.has(name)) {
        continue;
      }
      const vals = new Set(variants.map((v) => canonicalJson(v.params[name] ?? null)));
      if (vals.size > 1) {
        varying.add(name);
      }
    }
    const ordered = [...FOLLOW_UP_ORDER.filter((f) => varying.has(f)), ...[...varying].filter((f) => !FOLLOW_UP_ORDER.includes(f))];
    const field = ordered[0] ?? "params";
    const distinct = new Map<string, PickOption>();
    for (const v of variants) {
      const c = choiceFor(ctx, field, v.params[field], option.card);
      distinct.set(c.key, c);
    }
    return { choices: [...distinct.values()], field, type: "many", variants };
  }

  const variant = variants[0] as FlatMove;
  const xField = option.fields.find((f) => f.name === "xAmount");
  if (xField) {
    if (args.x === undefined) {
      // rule 444.2: X on an "any amount" activated cost is optional — an
      // activation that names none pays the smallest amount it can afford
      // (1, or 0 when the pool is empty) instead of parking on a prompt.
      if (xField.required === false) {
        const fallback = (xField.max ?? 0) >= 1 ? 1 : 0;
        return { move: { ...variant, params: { ...variant.params, xAmount: fallback } }, type: "one" };
      }
      return { max: xField.max ?? 0, min: xField.min ?? 0, type: "needX", variant };
    }
    if (args.x < (xField.min ?? 0) || args.x > (xField.max ?? 0)) {
      return {
        error: {
          code: "ILLEGAL_ARGS",
          detail: { max: xField.max, min: xField.min, x: args.x },
          message: `${option.label}: x=${args.x} outside ${xField.min ?? 0}..${xField.max ?? 0}`,
        },
        type: "none",
      };
    }
    return { move: { ...variant, params: { ...variant.params, xAmount: args.x } }, type: "one" };
  }
  if (args.x !== undefined && args.x !== 0) {
    // rule 204.3.b (ogn-268-298): a [rainbow] X has no play-time field, but a
    // test may still PLEDGE it here — the engine carries it to resolution and
    // charges the Power there.
    if (typeof variant.params.cardId === "string" && xIsResolutionPower(variant.params.cardId)) {
      return { move: { ...variant, params: { ...variant.params, xAmount: args.x } }, type: "one" };
    }
    return {
      error: { code: "ILLEGAL_ARGS", detail: { option: option.key }, message: `${option.label}: this action takes no X` },
      type: "none",
    };
  }
  if (args.x === 0 && typeof variant.params.cardId === "string" && xIsResolutionPower(variant.params.cardId)) {
    return { move: { ...variant, params: { ...variant.params, xAmount: 0 } }, type: "one" };
  }
  return { move: variant, type: "one" };
}

/** Apply a follow-up pick to a parked narrowing: keep variants whose `field` matches the chosen key. */
export function applyFollowUpPick(
  ctx: DecisionContext,
  field: string,
  variants: readonly FlatMove[],
  key: string,
): FlatMove[] {
  return variants.filter((v) => choiceFor(ctx, field, v.params[field], v.params.cardId as CardRef | undefined).key === key);
}

export function followUpPickDecision(
  ctx: DecisionContext,
  seat: Seat,
  option: ActionOption,
  field: string,
  choices: readonly PickOption[],
  n: number,
): PickDecision {
  const arg = PARAM_ARG[field]?.arg ?? field;
  return {
    allowDecline: true,
    id: decisionId(ctx.seq, seat, "pick", `fu${n}`),
    kind: "pick",
    max: 1,
    meta: { arg, field, optionKey: option.key },
    min: 1,
    options: choices,
    prompt: `${option.label}: choose ${arg}`,
    seat,
    semantics: "follow-up",
    source: { cardId: option.card, moveId: option.moveId },
    synthetic: true,
    timing: "FIN",
  };
}

export function followUpIntegerDecision(
  ctx: DecisionContext,
  seat: Seat,
  option: ActionOption,
  min: number,
  max: number,
  n: number,
): IntegerDecision {
  return {
    id: decisionId(ctx.seq, seat, "integer", `fu${n}`),
    kind: "integer",
    max,
    min,
    prompt: `${option.label}: choose X (${min}..${max})`,
    seat,
    source: { cardId: option.card, moveId: option.moveId },
    synthetic: true,
    timing: "FIN",
    unit: "x",
  };
}

/** Find an option by exact key, by moveId (if unique), or by (verb, card). */
export function findOption(decision: ActionDecision, key: string): ActionOption | undefined {
  const exact = decision.options.find((o) => o.key === key);
  if (exact) {
    return exact;
  }
  const byMove = decision.options.filter((o) => o.moveId === key || o.verb === key);
  if (byMove.length === 1) {
    return byMove[0];
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Shorthand coercion
// ---------------------------------------------------------------------------

export function isAnswerObject(v: unknown): v is Answer {
  return typeof v === "object" && v !== null && !Array.isArray(v) && typeof (v as { kind?: unknown }).kind === "string";
}

/**
 * Coerce a shorthand value into an Answer for `decision`.
 * Returns an error info when the shorthand makes no sense for this kind.
 */
export function coerceAnswer(decision: Decision, value: AnswerShorthand): Answer | HarnessErrorInfo {
  if (isAnswerObject(value)) {
    return value;
  }
  const bad = (): HarnessErrorInfo => ({
    code: "WRONG_ANSWER_KIND",
    detail: { decision: decision.kind, value: value as unknown },
    message: `Cannot answer a ${decision.kind} decision with ${JSON.stringify(value)}`,
  });
  switch (decision.kind) {
    case "action": {
      if (value === "pass") {
        return decision.passKey ? { key: decision.passKey, kind: "action" } : bad();
      }
      if (typeof value === "string") {
        return { key: value, kind: "action" };
      }
      return bad();
    }
    case "pick": {
      if (value === "decline" || value === "no" || value === false || value === "pass") {
        return { kind: "decline" };
      }
      if (typeof value === "string") {
        return { keys: [value], kind: "pick" };
      }
      if (typeof value === "number") {
        return { keys: [String(value)], kind: "pick" };
      }
      if (Array.isArray(value)) {
        return { keys: value.map(String), kind: "pick" };
      }
      return bad();
    }
    case "yes-no": {
      if (value === true || value === "yes") {
        return { kind: "yes-no", value: true };
      }
      if (value === false || value === "no" || value === "decline" || value === "pass") {
        return { kind: "yes-no", value: false };
      }
      return bad();
    }
    case "integer": {
      if (typeof value === "number") {
        return { kind: "integer", value };
      }
      if (typeof value === "string" && /^\d+$/.test(value)) {
        return { kind: "integer", value: Number(value) };
      }
      return bad();
    }
    case "distribute": {
      if (typeof value === "string") {
        return { allocation: { [value]: decision.total }, kind: "distribute" };
      }
      return bad();
    }
    case "order": {
      if (Array.isArray(value)) {
        return { keys: value.map(String), kind: "order" };
      }
      if (typeof value === "string" && value !== "pass" && value !== "decline") {
        return { keys: [value], kind: "order" };
      }
      if ((value === "pass" || value === "decline") && decision.defaultable) {
        return { keys: [], kind: "order" };
      }
      return bad();
    }
    case "deck-arrange": {
      if (Array.isArray(value)) {
        return { kind: "deck-arrange", recycle: [], top: value.map(String) };
      }
      return bad();
    }
    case "name": {
      if (typeof value === "string") {
        return { kind: "name", name: value };
      }
      return bad();
    }
    default: {
      return bad();
    }
  }
}
