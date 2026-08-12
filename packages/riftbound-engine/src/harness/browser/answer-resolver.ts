/**
 * Answer → concrete engine move, backend-agnostic.
 *
 * This is the orchestration EngineBackend.actSync() performs before it calls
 * `executeMove` (decision-id staleness, chooser checks, option lookup, bundle
 * narrowing with parked follow-ups, pending-choice answers), lifted out so a
 * backend whose "execute" is asynchronous (BrowserBackend) shares the exact
 * narrowing semantics. All the actual rules live in ../decision.ts; this file
 * only sequences them and owns the parked (partially bound) action.
 *
 * EngineBackend still carries its own copy of this sequencing; it can adopt
 * `AnswerResolver` unchanged (execute = its synchronous `execute()`).
 */

import {
  applyFollowUpPick,
  deriveActionDecision,
  findOption,
  followUpIntegerDecision,
  followUpPickDecision,
  narrowVariants,
  resolvePendingAnswer,
} from "../decision";
import type { DecisionContext, NarrowResult } from "../decision";
import type {
  ActResult,
  ActionDecision,
  ActionOption,
  Answer,
  Decision,
  FlatMove,
  HarnessErrorInfo,
  PickOption,
  PlayArgs,
  Seat,
} from "../types";

export interface ResolverHost {
  ctx(): DecisionContext;
  seq(): number;
  /** Game status of the latest frame. */
  status(): string;
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

export type ResolvePlan =
  | { readonly type: "result"; readonly result: ActResult }
  | {
      readonly type: "execute";
      readonly seat: Seat;
      readonly decision: { readonly id: string; readonly kind: Decision["kind"] };
      readonly answer: Answer;
      readonly move: FlatMove;
    };

export class AnswerResolver {
  private parked?: Parked;
  private readonly host: ResolverHost;
  private readonly derive: (ctx: DecisionContext) => Decision | null;

  constructor(host: ResolverHost, derive: (ctx: DecisionContext) => Decision | null) {
    this.host = host;
    this.derive = derive;
  }

  hasParked(): boolean {
    return this.parked !== undefined;
  }

  clear(): void {
    this.parked = undefined;
  }

  /** The cursor decision including a parked follow-up. */
  decision(): Decision | null {
    if (this.parked) {
      return this.parkedDecision(this.parked);
    }
    if (this.host.status() !== "playing") {
      return null;
    }
    return this.derive(this.host.ctx());
  }

  decisionFor(seat: Seat): Decision | ActionDecision | null {
    const d = this.decision();
    if (d && d.seat === seat) {
      return d;
    }
    if (this.host.status() !== "playing") {
      return null;
    }
    return deriveActionDecision(this.host.ctx(), seat, false);
  }

  private fail(error: HarnessErrorInfo): ResolvePlan {
    return { result: { decision: this.decision(), error, ok: false, seq: this.host.seq() }, type: "result" };
  }

  resolve(seat: Seat, answer: Answer): ResolvePlan {
    if (this.host.status() !== "playing") {
      return this.fail({ code: "GAME_OVER", message: "The game has ended" });
    }
    const cursor = this.decision();
    if (answer.decisionId && cursor && answer.decisionId !== cursor.id) {
      const own = this.decisionFor(seat);
      if (!own || own.id !== answer.decisionId) {
        return this.fail({
          code: "STALE_DECISION",
          detail: { current: cursor.id, given: answer.decisionId },
          message: `Answer cites ${answer.decisionId} but current decision is ${cursor.id}`,
        });
      }
    }

    if (this.parked) {
      if (this.parked.seat !== seat) {
        return this.fail({
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
        return this.fail({
          code: target ? "NOT_YOUR_DECISION" : "NO_DECISION",
          detail: { chooser: target?.seat, seat },
          message: target ? `It is ${target.seat}'s decision (${target.kind})` : "Nobody has a decision to make",
        });
      }
      target = deriveActionDecision(this.host.ctx(), seat, false);
      if (!target) {
        return this.fail({
          code: "NOT_YOUR_DECISION",
          detail: { chooser: cursor?.seat, seat },
          message: `${seat} has no legal actions right now${cursor ? `; it is ${cursor.seat}'s ${cursor.kind} decision` : ""}`,
        });
      }
    }

    // rule 429.3 / 429.3.a and rule 650 — a seat's own open prompt does not
    // swallow the actions that stay legal during it (conceding above all), so
    // route an action answer to that seat's action menu.
    if (target.kind !== "action" && answer.kind === "action" && target.seat === seat) {
      const free = deriveActionDecision(this.host.ctx(), seat, false);
      const acting = free ?? deriveActionDecision(this.host.ctx(), seat, true);
      if (acting && acting.options.length > 0) {
        target = acting;
      }
    }

    if (target.kind === "action") {
      if (answer.kind !== "action") {
        return this.fail({ code: "WRONG_ANSWER_KIND", message: `An action decision needs an action answer, got ${answer.kind}` });
      }
      const option = findOption(target, answer.key);
      if (!option) {
        return this.fail({
          code: "UNKNOWN_OPTION",
          detail: { key: answer.key, options: target.options.map((o) => o.key) },
          message: `No option "${answer.key}" for ${seat}; legal: ${target.options.map((o) => o.key).join(", ") || "(none)"}`,
        });
      }
      const args = answer.args ?? {};
      return this.resolveNarrow(seat, option, args, target.id, narrowVariants(this.host.ctx(), option, args), 0, answer);
    }

    const resolved = resolvePendingAnswer(this.host.ctx(), target, answer);
    if (resolved.type === "error") {
      return this.fail(resolved.error);
    }
    return { answer, decision: { id: target.id, kind: target.kind }, move: resolved.move, seat, type: "execute" };
  }

  private parkedDecision(p: Parked): Decision {
    const ctx = this.host.ctx();
    return p.question.kind === "pick"
      ? followUpPickDecision(ctx, p.seat, p.option, p.question.field, p.question.choices, p.n)
      : followUpIntegerDecision(ctx, p.seat, p.option, p.question.min, p.question.max, p.n);
  }

  private followUpResult(): ResolvePlan {
    const followUp = this.parkedDecision(this.parked as Parked);
    return {
      result: { decision: followUp, executed: [], followUp, ok: true, seq: this.host.seq(), violations: [] },
      type: "result",
    };
  }

  private resolveNarrow(
    seat: Seat,
    option: ActionOption,
    args: PlayArgs,
    baseDecisionId: string,
    nr: NarrowResult,
    n: number,
    originalAnswer: Answer,
  ): ResolvePlan {
    switch (nr.type) {
      case "none": {
        this.parked = undefined;
        return { result: { decision: this.decision(), error: nr.error, ok: false, seq: this.host.seq() }, type: "result" };
      }
      case "one": {
        this.parked = undefined;
        const finalAnswer: Answer = { args, key: option.key, kind: "action" };
        return {
          answer: n === 0 ? originalAnswer : finalAnswer,
          decision: { id: baseDecisionId, kind: "action" },
          move: nr.move,
          seat,
          type: "execute",
        };
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
        return this.followUpResult();
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
        return this.followUpResult();
      }
      default: {
        const never: never = nr;
        throw new Error(`unreachable ${String(never)}`);
      }
    }
  }

  private continueParked(p: Parked, answer: Answer): ResolvePlan {
    if (answer.kind === "decline") {
      this.parked = undefined;
      return { result: { decision: this.decision(), executed: [], ok: true, seq: this.host.seq(), violations: [] }, type: "result" };
    }
    const ctx = this.host.ctx();
    if (p.question.kind === "pick") {
      if (answer.kind !== "pick" || answer.keys.length !== 1) {
        return this.fail({ code: "WRONG_ANSWER_KIND", message: `Follow-up needs a single pick for ${p.question.field}` });
      }
      const key = answer.keys[0] as string;
      const choice = p.question.choices.find((c) => c.key === key);
      if (!choice) {
        return this.fail({
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
      return this.fail({ code: "WRONG_ANSWER_KIND", message: "Follow-up needs an integer (X)" });
    }
    const mergedArgs: PlayArgs = { ...p.args, x: answer.value };
    const narrowedOption: ActionOption = { ...p.option, variants: [p.question.variant] };
    return this.resolveNarrow(p.seat, narrowedOption, mergedArgs, p.baseDecisionId, narrowVariants(ctx, narrowedOption, mergedArgs), p.n, {
      args: mergedArgs,
      key: p.option.key,
      kind: "action",
    });
  }
}
