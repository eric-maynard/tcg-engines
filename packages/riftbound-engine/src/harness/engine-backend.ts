/**
 * L0 implementation over an in-process RuleEngine.
 *
 * Owns: the seq counter, the parked (partially-bound) action for follow-up
 * decisions, the TurnDriver (endTurn + auto procedures), invariant runs and
 * transcript recording.
 */

import type { CardDefinitionRegistry } from "../operations/card-lookup";
import { getGlobalCardRegistry, setGlobalCardRegistry } from "../operations/card-lookup";
import { buildCardState } from "./card-state";
import type { GameBackend, WaitForOptions } from "./backend";
import {
  applyFollowUpPick,
  deriveActionDecision,
  deriveDecision,
  engineDecisionContext,
  findOption,
  followUpIntegerDecision,
  followUpPickDecision,
  narrowVariants,
  resolvePendingAnswer,
} from "./decision";
import type { DecisionContext, NarrowResult } from "./decision";
import type { FullSnapshot, HarnessEngine } from "./internal";
import { getInternalState, hashSnapshot, peekCurrentState, replaceCurrentState, takeSnapshot } from "./internal";
import type { RiftboundGameState } from "../types/game-state";
import type { Invariant } from "./invariants";
import { DEFAULT_INVARIANTS, runInvariants } from "./invariants";
import { observe, zoneCards } from "./observation";
import { applyMove } from "./turn-driver";
import type { Transcript, TranscriptOrigin, TranscriptStep } from "./transcript-types";
import type {
  ActResult,
  ActionDecision,
  ActionOption,
  Answer,
  CardPool,
  CardRef,
  CardState,
  Decision,
  ExecutedMove,
  FlatMove,
  HarnessErrorInfo,
  Observation,
  PickOption,
  PlayArgs,
  Seat,
  Viewer,
  Violation,
} from "./types";
import { HarnessError } from "./types";

/**
 * rule 110–118 — moves that belong to the pregame setup sequence and are
 * therefore refused once play has begun. `seat.do()` stages a setup window
 * around them so a mid-game scenario can still exercise the real move.
 */
const SETUP_ONLY_MOVES = new Set<string>(["mulligan"]);

export interface EngineBackendOptions {
  /** Seats in turn order (default: state.players key order). */
  readonly players?: readonly Seat[];
  readonly pool?: CardPool;
  /** Auto-run resolveFullCombat / endShowdown / resolveChain when enumerated (default true). */
  readonly autoProcedures?: boolean;
  readonly invariants?: readonly Invariant[];
  /** Throw HarnessError(INVARIANT) instead of just recording violations. */
  readonly strictInvariants?: boolean;
  readonly origin?: TranscriptOrigin;
}

interface Parked {
  readonly seat: Seat;
  readonly option: ActionOption;
  readonly baseDecisionId: string;
  args: PlayArgs;
  variants: FlatMove[];
  question:
    | { kind: "pick"; field: string; choices: PickOption[] }
    | { kind: "x"; min: number; max: number; variant: FlatMove };
  n: number;
}

export class EngineBackend implements GameBackend {
  readonly engine: HarnessEngine;
  readonly pool?: CardPool;
  private readonly players: readonly Seat[];
  private readonly autoProcedures: boolean;
  private readonly invariants: readonly Invariant[];
  private readonly strictInvariants: boolean;
  private readonly origin: TranscriptOrigin;
  private seqNo = 0;
  private parked?: Parked;
  private prevSnap: FullSnapshot;
  private readonly initialHash: string;
  private readonly steps: TranscriptStep[] = [];
  private readonly allViolations: Violation[] = [];
  /** The global card registry this engine was built against (re-installed on every call). */
  private readonly registry: CardDefinitionRegistry;

  constructor(engine: HarnessEngine, opts: EngineBackendOptions = {}) {
    this.engine = engine;
    this.registry = getGlobalCardRegistry();
    this.pool = opts.pool;
    this.players = opts.players ?? Object.keys(engine.getState().players);
    this.autoProcedures = opts.autoProcedures ?? true;
    this.invariants = opts.invariants ?? DEFAULT_INVARIANTS;
    this.strictInvariants = opts.strictInvariants ?? false;
    this.origin = opts.origin ?? { kind: "opaque" };
    this.prevSnap = takeSnapshot(engine);
    this.initialHash = hashSnapshot(this.prevSnap);
  }

  // ---- reads --------------------------------------------------------------

  /**
   * The engine reads card data from a process-global registry; building a
   * second game replaces it. Re-install ours before touching the engine so
   * several Games can coexist in one test file (calls must not interleave
   * concurrently — JS is single-threaded, so sequential awaits are fine).
   */
  activate(): void {
    if (getGlobalCardRegistry() !== this.registry) {
      setGlobalCardRegistry(this.registry);
    }
  }

  seats(): readonly Seat[] {
    return this.players;
  }

  seq(): number {
    return this.seqNo;
  }

  ctx(): DecisionContext {
    this.activate();
    return engineDecisionContext(this.engine, this.seqNo, this.autoProcedures);
  }

  decision(): Decision | null {
    if (this.parked) {
      return this.parkedDecision(this.parked);
    }
    return deriveDecision(this.ctx());
  }

  decisionFor(seat: Seat): Decision | ActionDecision | null {
    const d = this.decision();
    if (d && d.seat === seat) {
      return d;
    }
    if (this.engine.getState().status !== "playing") {
      return null;
    }
    return deriveActionDecision(this.ctx(), seat, false);
  }

  view(viewer: Viewer): Observation {
    this.activate();
    return observe(this.engine, viewer, this.seqNo, this.decision(), this.pool);
  }

  stateHash(): string {
    this.activate();
    return hashSnapshot(takeSnapshot(this.engine));
  }

  cardState(card: CardRef): CardState {
    this.activate();
    return buildCardState(this.engine, card, this.pool);
  }

  cardsIn(zone: string, owner?: Seat): readonly CardRef[] {
    return zoneCards(this.engine, zone, owner);
  }

  hasCard(card: CardRef): boolean {
    return Boolean(getInternalState(this.engine).cards[card]);
  }

  violations(): readonly Violation[] {
    return this.allViolations;
  }

  transcript(): Transcript {
    return {
      finalHash: this.stateHash(),
      initialHash: this.initialHash,
      origin: this.origin,
      players: this.players,
      schema: 1,
      steps: [...this.steps],
    };
  }

  async waitFor(pred: (o: Observation) => boolean, opts: WaitForOptions = {}): Promise<Observation> {
    const o = this.view(opts.viewer ?? "spectator");
    if (pred(o)) {
      return o;
    }
    throw new HarnessError({
      code: "TIMEOUT",
      message: "Predicate false and an in-process engine cannot change without an act()",
    });
  }

  async close(): Promise<void> {
    this.parked = undefined;
  }

  // ---- act ------------------------------------------------------------------

  async act(seat: Seat, answer: Answer): Promise<ActResult> {
    return this.actSync(seat, answer);
  }

  /** Synchronous core of act() (the engine is synchronous; exposed for drivers). */
  actSync(seat: Seat, answer: Answer): ActResult {
    this.activate();
    const fail = (error: HarnessErrorInfo): ActResult => ({
      decision: this.decision(),
      error,
      ok: false,
      seq: this.seqNo,
    });

    const status = this.engine.getState().status;
    // rule 117: the pregame mulligan is answerable through the Decision/Answer
    // protocol, so a seat may act during `setup` while a setup decision is open.
    if (status !== "playing" && !(status === "setup" && this.decision() !== null)) {
      return fail({ code: "GAME_OVER", message: "The game has ended" });
    }

    const cursor = this.decision();
    if (answer.decisionId && cursor && answer.decisionId !== cursor.id) {
      // A free action may cite the seat's own free decision id.
      const own = this.decisionFor(seat);
      if (!own || own.id !== answer.decisionId) {
        return fail({
          code: "STALE_DECISION",
          detail: { current: cursor.id, given: answer.decisionId },
          message: `Answer cites ${answer.decisionId} but current decision is ${cursor.id}`,
        });
      }
    }

    // Follow-up on a parked bundle.
    if (this.parked) {
      if (this.parked.seat !== seat) {
        return fail({
          code: "NOT_YOUR_DECISION",
          detail: { chooser: this.parked.seat, seat },
          message: `A follow-up for ${this.parked.seat} is pending`,
        });
      }
      return this.continueParked(this.parked, answer);
    }

    let target: Decision | null = cursor;
    if (!target || target.seat !== seat) {
      if (answer.kind !== "action") {
        return fail({
          code: target ? "NOT_YOUR_DECISION" : "NO_DECISION",
          detail: { chooser: target?.seat, seat },
          message: target ? `It is ${target.seat}'s decision (${target.kind})` : "Nobody has a decision to make",
        });
      }
      target = deriveActionDecision(this.ctx(), seat, false);
      if (!target) {
        return fail({
          code: "NOT_YOUR_DECISION",
          detail: { chooser: cursor?.seat, seat },
          message: `${seat} has no legal actions right now${cursor ? `; it is ${cursor.seat}'s ${cursor.kind} decision` : ""}`,
        });
      }
    }

    // rule 429.3 / 429.3.a: a payment prompt does not swallow the actions that
    // remain legal during it — route an action answer to the seat's action menu
    // even while that seat's own non-action prompt is open.
    if (target.kind !== "action" && answer.kind === "action" && target.seat === seat) {
      const acting = deriveActionDecision(this.ctx(), seat, false);
      if (acting) {
        target = acting;
      }
    }

    if (target.kind === "action") {
      if (answer.kind !== "action") {
        return fail({
          code: "WRONG_ANSWER_KIND",
          message: `An action decision needs an action answer, got ${answer.kind}`,
        });
      }
      const option = findOption(target, answer.key);
      if (!option) {
        return fail({
          code: "UNKNOWN_OPTION",
          detail: { key: answer.key, options: target.options.map((o) => o.key) },
          message: `No option "${answer.key}" for ${seat}; legal: ${target.options.map((o) => o.key).join(", ") || "(none)"}`,
        });
      }
      const args = answer.args ?? {};
      return this.resolveNarrow(seat, option, args, target.id, narrowVariants(this.ctx(), option, args), 0, answer);
    }

    // rule 117 / 117.1: the pregame mulligan prompt is not an engine
    // pendingChoice — its answer is the set-aside list of the `mulligan` move.
    if (status === "setup" && target.source?.moveId === "mulligan") {
      if (answer.kind !== "pick" && answer.kind !== "decline") {
        return fail({
          code: "WRONG_ANSWER_KIND",
          message: `The mulligan needs a pick (up to two cards) or decline, got ${answer.kind}`,
        });
      }
      const keepCards = answer.kind === "pick" ? answer.keys.map(String) : [];
      return this.execute(seat, target, answer, {
        moveId: "mulligan",
        params: { keepCards, playerId: seat },
        playerId: seat,
      });
    }

    const resolved = resolvePendingAnswer(this.ctx(), target, answer);
    if (resolved.type === "error") {
      return fail(resolved.error);
    }
    return this.execute(seat, target, answer, resolved.move);
  }

  private parkedDecision(p: Parked): Decision {
    const ctx = this.ctx();
    return p.question.kind === "pick"
      ? followUpPickDecision(ctx, p.seat, p.option, p.question.field, p.question.choices, p.n)
      : followUpIntegerDecision(ctx, p.seat, p.option, p.question.min, p.question.max, p.n);
  }

  private resolveNarrow(
    seat: Seat,
    option: ActionOption,
    args: PlayArgs,
    baseDecisionId: string,
    nr: NarrowResult,
    n: number,
    originalAnswer: Answer,
  ): ActResult {
    switch (nr.type) {
      case "none": {
        this.parked = undefined;
        return { decision: this.decision(), error: nr.error, ok: false, seq: this.seqNo };
      }
      case "one": {
        this.parked = undefined;
        const finalAnswer: Answer = { args, key: option.key, kind: "action" };
        return this.execute(seat, { id: baseDecisionId, kind: "action" }, n === 0 ? originalAnswer : finalAnswer, nr.move);
      }
      case "many": {
        this.parked = {
          args,
          baseDecisionId,
          n: n + 1,
          option,
          question: { choices: nr.choices, field: nr.field, kind: "pick" },
          seat,
          variants: nr.variants,
        };
        const followUp = this.parkedDecision(this.parked);
        return { decision: followUp, executed: [], followUp, ok: true, seq: this.seqNo, violations: [] };
      }
      case "needX": {
        this.parked = {
          args,
          baseDecisionId,
          n: n + 1,
          option,
          question: { kind: "x", max: nr.max, min: nr.min, variant: nr.variant },
          seat,
          variants: [nr.variant],
        };
        const followUp = this.parkedDecision(this.parked);
        return { decision: followUp, executed: [], followUp, ok: true, seq: this.seqNo, violations: [] };
      }
      default: {
        const never: never = nr;
        throw new Error(`unreachable ${String(never)}`);
      }
    }
  }

  private continueParked(p: Parked, answer: Answer): ActResult {
    const fail = (error: HarnessErrorInfo): ActResult => ({ decision: this.decision(), error, ok: false, seq: this.seqNo });
    if (answer.kind === "decline") {
      this.parked = undefined;
      return { decision: this.decision(), executed: [], ok: true, seq: this.seqNo, violations: [] };
    }
    const ctx = this.ctx();
    if (p.question.kind === "pick") {
      if (answer.kind !== "pick" || answer.keys.length === 0) {
        return fail({ code: "WRONG_ANSWER_KIND", message: `Follow-up needs a single pick for ${p.question.field}` });
      }
      // A field whose choices are SETS of cards ("targets") is answered by
      // naming the members, in any order — one key per member, not one key.
      const asSet = [...answer.keys].map(String).sort().join("|");
      const key =
        answer.keys.length === 1
          ? (answer.keys[0] as string)
          : (p.question.choices.find(
              (c) => Array.isArray(c.value) && [...(c.value as unknown[])].map(String).sort().join("|") === asSet,
            )?.key ?? answer.keys.join("+"));
      const choice = p.question.choices.find((c) => c.key === key);
      if (!choice) {
        return fail({
          code: "UNKNOWN_OPTION",
          detail: { key, options: p.question.choices.map((c) => c.key) },
          message: `No follow-up option "${key}"; legal: ${p.question.choices.map((c) => c.key).join(", ")}`,
        });
      }
      const remaining = applyFollowUpPick(ctx, p.question.field, p.variants, key);
      const mergedArgs: PlayArgs = { ...p.args, params: { ...(p.args.params ?? {}), [p.question.field]: choice.value } };
      const narrowedOption: ActionOption = { ...p.option, variants: remaining };
      return this.resolveNarrow(p.seat, narrowedOption, mergedArgs, p.baseDecisionId, narrowVariants(ctx, narrowedOption, mergedArgs), p.n, {
        args: mergedArgs,
        key: p.option.key,
        kind: "action",
      });
    }
    if (answer.kind !== "integer") {
      return fail({ code: "WRONG_ANSWER_KIND", message: "Follow-up needs an integer (X)" });
    }
    const mergedArgs: PlayArgs = { ...p.args, x: answer.value };
    const narrowedOption: ActionOption = { ...p.option, variants: [p.question.variant] };
    return this.resolveNarrow(p.seat, narrowedOption, mergedArgs, p.baseDecisionId, narrowVariants(ctx, narrowedOption, mergedArgs), p.n, {
      args: mergedArgs,
      key: p.option.key,
      kind: "action",
    });
  }

  private execute(
    seat: Seat,
    decision: { id: string; kind: Decision["kind"] },
    answer: Answer,
    move: FlatMove,
  ): ActResult {
    const actor = move.playerId || seat;
    const params = { ...move.params } as Record<string, unknown>;
    const r = applyMove(this.engine, this.players, actor, move.moveId, params, {
      autoProcedures: this.autoProcedures,
    });
    if (!r.success) {
      return {
        decision: this.decision(),
        error: {
          code: "ENGINE_REJECTED",
          detail: { errorCode: r.errorCode, moveId: move.moveId, params },
          message: `${move.moveId} rejected: ${r.error ?? r.errorCode ?? "unknown"}`,
        },
        ok: false,
        seq: this.seqNo,
      };
    }
    const executed: ExecutedMove[] = [{ moveId: move.moveId, params, seat: actor }];
    for (const run of r.procedures) {
      executed.push({ auto: true, moveId: run.moveId, params: run.params, seat: run.seat });
    }
    this.seqNo += 1;
    const cur = takeSnapshot(this.engine);
    const found = runInvariants(this.invariants, {
      cur,
      engine: this.engine,
      prev: this.prevSnap,
      step: { executed, seq: this.seqNo },
    });
    const violations: Violation[] = found.map((v) => ({ ...v, seq: this.seqNo }));
    this.allViolations.push(...violations);
    this.prevSnap = cur;
    const hash = hashSnapshot(cur);
    this.steps.push({
      answer,
      decision: { id: decision.id, kind: decision.kind },
      executed,
      hash,
      n: this.seqNo,
      ok: true,
      seat,
    });
    if (this.strictInvariants && violations.length > 0) {
      throw new HarnessError({
        code: "INVARIANT",
        detail: { violations },
        message: violations.map((v) => `${v.invariant}: ${v.message}`).join("; "),
      });
    }
    return { decision: this.decision(), executed, ok: true, seq: this.seqNo, violations };
  }

  /**
   * Execute a raw engine move as `seat` through the same bookkeeping
   * (procedures, invariants, transcript). Escape hatch for L2 `seat.do()`.
   */
  raw(seat: Seat, moveId: string, params: Record<string, unknown>): ActResult {
    this.activate();
    if (this.engine.getState().status !== "playing") {
      return { decision: null, error: { code: "GAME_OVER", message: "The game has ended" }, ok: false, seq: this.seqNo };
    }
    this.parked = undefined;
    const d = this.decision();
    // rule 117 / 118 — the Mulligan is a step of the setup sequence, so its move
    // is legal only while `status === "setup"`. Scenarios are materialised
    // mid-game, so the escape hatch stages a pregame window around a setup-only
    // move and restores the playing state afterwards; the move itself (draw
    // replacements, then Recycle the set-aside cards) is the engine's own.
    const restore = SETUP_ONLY_MOVES.has(moveId) ? this.enterPregameWindow(seat) : undefined;
    try {
      return this.execute(
        seat,
        { id: d?.id ?? `d${this.seqNo}:${seat}:raw`, kind: "action" },
        { args: { params }, key: `${moveId}:raw`, kind: "action" },
        { moveId, params: { playerId: seat, ...params }, playerId: seat },
      );
    } finally {
      restore?.();
    }
  }

  /**
   * Temporarily present the game as being in the pregame setup sequence with
   * `seat` next to act, and return a restorer that puts the previous
   * status/setup record back (leaving everything the move changed in place).
   */
  private enterPregameWindow(seat: Seat): () => void {
    const before = peekCurrentState(this.engine);
    const setup = {
      completedBy: [],
      firstPlayer: seat,
      mulliganedBy: [],
      pendingMulligan: [],
      rolls: {},
      step: "mulligan",
      ...(before.setup ?? {}),
    } as unknown as RiftboundGameState["setup"];
    replaceCurrentState(this.engine, { ...before, setup, status: "setup" } as RiftboundGameState);
    return () => {
      const after = peekCurrentState(this.engine);
      replaceCurrentState(this.engine, {
        ...after,
        setup: before.setup,
        status: before.status,
      } as RiftboundGameState);
    };
  }
}
