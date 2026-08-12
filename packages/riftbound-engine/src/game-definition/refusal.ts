/**
 * A refusal carries its cause.
 *
 * A blocked action used to either vanish from the offered set or fail with an
 * internal string ("no legal variant matches to=\"bfB\"", "condition not met"),
 * so a player could not tell ILLEGAL from BROKEN. Every legality decision that
 * a player can reasonably attempt now returns a `Refusal` instead of a bare
 * `false`: a stable `code`, the RULE it comes from, and a human string naming
 * the OBJECT that blocks it.
 *
 * One channel, four speakers:
 *   - a move `condition` returns `refuse(...)` — core turns it into
 *     `EnumeratedMove.validationError {errorCode, reason, context}` (see
 *     `RuleEngine.checkMoveCondition` / `enumerateMoves`);
 *   - an enumerator that would DROP a candidate a player can still click emits
 *     it anyway, so the invalid row (and its reason) exists to be rendered;
 *   - the harness reads it back with `refusalOf` and puts it on the error it
 *     throws / on the greyed option;
 *   - the app server ships the same rows to the client, which prints the
 *     reason where the card is dimmed, absent, or clicked to no effect.
 *
 * Do NOT write bespoke per-card messages: add a `RefusalCode` and let every
 * blocked action of that shape be explained for free.
 */

import type { ConditionFailure } from "@tcg/core";
import { getGlobalCardRegistry } from "../operations/card-lookup";

/** Stable, machine-readable cause. Clients may branch on these; strings are for humans. */
export type RefusalCode =
  /** rule 331.1.a / 338.1.a.2 / 159.2.a.1 — the card's timing is illegal in this state. */
  | "TIMING_ILLEGAL"
  /** rule 316.5.b — a Neutral Open State belongs to the turn player. */
  | "NOT_YOUR_OPEN_STATE"
  /** rule 312.2.c-d / 338.1.b.1 — someone else holds chain Priority. */
  | "NO_CHAIN_PRIORITY"
  /** rule 313.1 / 347 — someone else holds showdown Focus. */
  | "NO_SHOWDOWN_FOCUS"
  /** rule 054.1 — a "can't play spells this turn" rider. */
  | "SPELLS_FORBIDDEN_THIS_TURN"
  /** rule 054.1 — a "can't play cards this turn" rider. */
  | "CARDS_FORBIDDEN_THIS_TURN"
  /** rule 358.3.a / 419.1 — a permanent's static forbids this play. */
  | "PLAY_FORBIDDEN_BY_STATIC"
  /** rule 358.3.a / 355.2 — a static confines this player's unit plays to their base. */
  | "PLAY_RESTRICTED_TO_BASE"
  /** rule 144.4.c.1 / 810.1.b — a mover lacks [Ganking] for a battlefield→battlefield leg. */
  | "MOVE_NEEDS_GANKING"
  /** rule 350.1 — the unit was told it can't move. */
  | "MOVE_FORBIDDEN";

/**
 * Why an action is refused. Rides on `ConditionFailure.context` so it survives
 * the core's enumeration path unchanged, and is read back with `refusalOf`.
 */
export interface Refusal {
  readonly code: RefusalCode;
  /** Core rule id ("338.1.a.2"), so a client can link the rulebook. */
  readonly rule: string;
  /** Human string naming the blocking object and the rule. */
  readonly message: string;
  /** The object that blocks it (the static's source, the unit without [Ganking], …). */
  readonly objectId?: string;
  readonly objectName?: string;
  /** The object being refused (the card that will not be played, …). */
  readonly subjectId?: string;
  readonly subjectName?: string;
}

/** Printed name of a card instance, falling back to its id (harness aliases are ids). */
export function nameOf(cardId: string | undefined): string | undefined {
  if (!cardId) {
    return undefined;
  }
  try {
    return getGlobalCardRegistry().get(cardId)?.name ?? cardId;
  } catch {
    return cardId;
  }
}

export interface RefuseInput {
  readonly code: RefusalCode;
  /** Core rule id, e.g. "338.1.a.2". */
  readonly rule: string;
  /** The sentence, without the object prefix or the rule suffix. */
  readonly text: string;
  /** Blocking object (id, or {id,name} when the name is already known). */
  readonly object?: string | { readonly id?: string; readonly name?: string };
  /** The card/unit being refused. */
  readonly subject?: string | { readonly id?: string; readonly name?: string };
}

function ref(v: RefuseInput["object"]): { id?: string; name?: string } {
  if (v === undefined) {
    return {};
  }
  if (typeof v === "string") {
    return { id: v, name: nameOf(v) };
  }
  return { id: v.id, name: v.name ?? nameOf(v.id) };
}

/**
 * Build the ConditionFailure a move `condition` returns. The message reads
 * "<blocking object>: <what is wrong> (rule <id>)" so a client never has to
 * assemble one, and two surfaces never word the same refusal differently.
 */
export function refuse(input: RefuseInput): ConditionFailure {
  const object = ref(input.object);
  const subject = ref(input.subject);
  const message = `${object.name ? `${object.name}: ` : ""}${input.text} (rule ${input.rule})`;
  const refusal: Refusal = {
    code: input.code,
    message,
    rule: input.rule,
    ...(object.id ? { objectId: object.id } : {}),
    ...(object.name ? { objectName: object.name } : {}),
    ...(subject.id ? { subjectId: subject.id } : {}),
    ...(subject.name ? { subjectName: subject.name } : {}),
  };
  return { context: { refusal }, errorCode: input.code, reason: message };
}

/** Read a refusal back off an `EnumeratedMove.validationError` / move error. */
export function refusalOf(
  err:
    | { readonly errorCode?: string; readonly reason?: string; readonly context?: Record<string, unknown> }
    | undefined,
): Refusal | undefined {
  const candidate = (err?.context as { refusal?: Refusal } | undefined)?.refusal;
  if (candidate && typeof candidate.message === "string" && typeof candidate.code === "string") {
    return candidate;
  }
  return undefined;
}
