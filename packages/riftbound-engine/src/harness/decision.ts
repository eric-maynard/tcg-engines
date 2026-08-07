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

import type { PlayerId } from "@tcg/core";
import { getGlobalCardRegistry } from "../operations/card-lookup";
import type { PendingChoice, RiftboundGameState } from "../types/game-state";
import { getActingSeat, getPendingChoiceChooser } from "../views/acting-seat";
import { cardLabel } from "./card-state";
import type { HarnessEngine } from "./internal";
import { canonicalJson } from "./internal";
import type {
  ActionContext,
  ActionDecision,
  ActionField,
  ActionFieldKind,
  ActionOption,
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
  /** Whether procedures are auto-run (then they are hidden from menus). */
  readonly autoProcedures: boolean;
  readonly seq: number;
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
    label: (card) => cardLabel(engine, card),
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
  playGear: "equip",
  playSpell: "cast",
  playUnit: "play",
  recallUnit: "recall",
  recycleRune: "recycleRune",
  resolveChain: "resolveChain",
  resolveFullCombat: "resolveCombat",
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
  paidAdditionalCost: { arg: "payOptional", kind: "bool" },
  // rule 416.5 — the controller picks which cards pay a "Recycle N" cost.
  recycleIds: { arg: "recycle", kind: "cards" },
  repeatCount: { arg: "repeat", kind: "int" },
  sacrificeId: { arg: "sacrifice", kind: "card" },
  sourceCardId: { arg: "source", kind: "card" },
  targets: { arg: "targets", kind: "cards" },
  toBattlefield: { arg: "to", kind: "zone" },
  unitIds: { arg: "units", kind: "cards" },
  viaFlow: { arg: "flow", kind: "bool" },
  xAmount: { arg: "x", kind: "int" },
};

/** Params never surfaced as fields. additionalCostSpec rides with paidAdditionalCost. */
const HIDDEN_PARAMS = new Set(["playerId", "additionalCostSpec"]);

/** Follow-up priority: which still-varying field to ask about first. */
const FOLLOW_UP_ORDER = [
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
    fields.push({
      arg: meta.arg,
      kind: meta.kind,
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
  if (moveId === "playSpell" && variants.length > 0) {
    const cardId = variants[0]?.params.cardId as string | undefined;
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
  }
  return fields;
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
          : "Free actions available";
  return {
    context,
    endTurnKey,
    id: decisionId(ctx.seq, seat, "action", cursor ? undefined : "free"),
    kind: "action",
    options,
    passKey,
    prompt,
    seat,
    source: top ? { cardId: top.cardId, chainItemId: top.id } : undefined,
    timing: "ACT",
  };
}

function modeLabel(effect: unknown, idx: number): string {
  const opts = (effect as { options?: { label?: string; text?: string; effect?: { type?: string } }[] } | undefined)
    ?.options;
  const o = opts?.[idx];
  return o?.label ?? o?.text ?? (o?.effect?.type ? `${o.effect.type} (mode ${idx})` : `mode ${idx}`);
}

export function deriveFromPendingChoice(ctx: DecisionContext, pc: PendingChoice): Decision {
  const seat = getPendingChoiceChooser(pc);
  const flat = ctx.legal(seat, ["resolvePendingChoice"]);
  // rule 402 — a prompt bound to a still-pending chain item (leading "you may",
  // targets, modes, base cost) is part of FINALIZING it, not of resolving it.
  const fin = pc as { finalizationChainItemId?: string; bindToChainItemId?: string };
  const chainItemId = fin.finalizationChainItemId ?? fin.bindToChainItemId;
  const source = {
    cardId: (pc as { sourceCardId?: string }).sourceCardId,
    ...(chainItemId !== undefined ? { chainItemId } : {}),
    pendingChoiceType: pc.type,
  };
  const base = { seat, source, timing: chainItemId !== undefined ? ("FIN" as const) : ("RES" as const) };

  switch (pc.type) {
    case "reveal-and-pick": {
      const allowDecline = flat.some((m) => m.params.accept === false);
      const options: PickOption[] = flat
        .filter((m) => typeof m.params.pickedCardId === "string")
        .map((m) => {
          const id = m.params.pickedCardId as string;
          return { card: id, key: id, label: ctx.label(id) };
        });
      const d: PickDecision = {
        ...base,
        allowDecline,
        id: decisionId(ctx.seq, seat, "pick"),
        kind: "pick",
        // rule 422.1.a: "discard N" prompts take up to `remaining` picks in one answer.
        max: pc.remaining ?? 1,
        meta: { onPicked: pc.onPicked, onRest: pc.onRest, remaining: pc.remaining, revealer: pc.revealer },
        min: allowDecline ? 0 : 1,
        options,
        prompt: `Pick ${pc.remaining && pc.remaining > 1 ? `${pc.remaining} revealed cards` : "a revealed card"} to ${pc.onPicked}${allowDecline ? " (or decline)" : ""}`,
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
        const d: DistributeDecision = {
          ...base,
          buckets: pc.options.map((id) => ({ card: id, key: id, label: ctx.label(id), max: total, min: 0 })),
          id: decisionId(ctx.seq, seat, "distribute"),
          kind: "distribute",
          prompt: `Split ${total} damage`,
          total,
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
      const d: PickDecision = {
        ...base,
        allowDecline: pc.anyNumber === true,
        id: decisionId(ctx.seq, seat, "pick"),
        kind: "pick",
        max: capacity,
        min: 1,
        options: pc.options.map((id) => ({ card: id, key: id, label: ctx.label(id) })),
        prompt: pc.boundTargets ? "Choose a target to drop" : `Choose a target for ${source.cardId ? ctx.label(source.cardId) : "the effect"}`,
        semantics: pc.boundTargets ? "drop-target" : "target",
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
        source: { cardId: pc.cardId, pendingChoiceType: pc.type },
      };
      return d;
    }
    case "choose-mode": {
      const d: PickDecision = {
        ...base,
        allowDecline: false,
        id: decisionId(ctx.seq, seat, "pick"),
        kind: "pick",
        max: 1,
        min: 1,
        options: pc.options.map((idx) => ({ key: String(idx), label: modeLabel(pc.effect, idx), mode: idx })),
        prompt: "Choose a mode",
        semantics: "mode",
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
      let costText = costParts.length > 0 ? `Pay ${costParts.join("")}` : "";
      if (cost?.exhaust) {
        costText = costText ? `${costText} and exhaust` : "Exhaust";
      }
      costText = costText ? `${costText} to use` : "Use";
      const d: YesNoDecision = {
        ...base,
        // rule 383.3.b (ogn-072-298): "yes" is only legal when the opt-in cost is payable.
        canAccept: flat.some((m) => m.params.accept === true),
        consequence: "Perform the optional triggered ability",
        id: decisionId(ctx.seq, seat, "yes-no"),
        kind: "yes-no",
        prompt: `${costText} ${ctx.label(pc.sourceCardId)}'s optional ability?`,
      };
      return d;
    }
    case "combat-damage": {
      // rule 465.2.c.3 — one allocation covering this side's whole combat damage.
      const d: DistributeDecision = {
        ...base,
        buckets: pc.options.map((id) => ({
          card: id,
          key: id,
          label: ctx.label(id),
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

/** The cursor seat's decision, or null when the game is over / nobody can act. */
export function deriveDecision(ctx: DecisionContext): Decision | null {
  const { state } = ctx;
  if (state.status !== "playing") {
    return null;
  }
  if (state.pendingChoice) {
    return deriveFromPendingChoice(ctx, state.pendingChoice);
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
  const pc = ctx.state.pendingChoice;
  if (!pc) {
    return err("STALE_DECISION", "No pending choice");
  }
  const seat = decision.seat;
  const flat = ctx.legal(seat, ["resolvePendingChoice"]);
  const params: Record<string, unknown> = { playerId: seat };

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

type Constraint = { param: string; test: (v: unknown, params: Readonly<Record<string, unknown>>) => boolean; describe: unknown };

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
    cs.push({ describe: args.to, param: locParam, test: (v) => normLoc(v) === want });
  }
  for (const [k, val] of Object.entries(args.params ?? {})) {
    const want = canonicalJson(val);
    cs.push({ describe: val, param: k, test: (v) => canonicalJson(v) === want });
  }
  return cs;
}

/** Preferences applied to UNSPECIFIED knobs, each only if it keeps ≥1 variant. */
const DEFAULT_PREFS: { param: string; keep: (v: unknown) => boolean }[] = [
  { keep: (v) => v !== true, param: "paidAdditionalCost" },
  { keep: (v) => !v, param: "repeatCount" },
  { keep: (v) => v !== true, param: "viaFlow" },
  // rule 356.1 (unl-089-219) — an alternate play cost is opt-in: plain
  // `play(card)` takes the printed cost unless the test asks for it.
  { keep: (v) => v !== true, param: "altCost" },
  { keep: (v) => v === undefined, param: "sacrificeId" },
  { keep: (v) => v === undefined, param: "discardId" },
  { keep: (v) => v === undefined, param: "chosenTargetId" },
];

function choiceFor(ctx: DecisionContext, field: string, value: unknown): PickOption {
  const kind = PARAM_ARG[field]?.kind ?? "enum";
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

export function narrowVariants(ctx: DecisionContext, option: ActionOption, args: PlayArgs): NarrowResult {
  const constraints = constraintsFrom(option, args);
  let variants = option.variants.filter((v) => constraints.every((c) => c.test(v.params[c.param], v.params)));
  if (variants.length === 0) {
    return {
      error: {
        code: "ILLEGAL_ARGS",
        detail: {
          fields: option.fields.map((f) => ({ arg: f.arg, name: f.name, options: f.options })),
          given: constraints.map((c) => ({ [c.param]: c.describe })),
          option: option.key,
        },
        message: `${option.label}: no legal variant matches ${constraints.map((c) => `${PARAM_ARG[c.param]?.arg ?? c.param}=${canonicalJson(c.describe)}`).join(", ")}`,
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
      const c = choiceFor(ctx, field, v.params[field]);
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
  return variants.filter((v) => choiceFor(ctx, field, v.params[field]).key === key);
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
