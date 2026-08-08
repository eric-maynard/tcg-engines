/**
 * Agent-harness vocabulary: seats, card handles, card state, the Decision /
 * Answer protocol, observations, action results and errors.
 *
 * Everything here is plain data (JSON-serialisable) so the same shapes serve
 * in-process tests, transcripts and a future MCP surface.
 */

import type { CombatRole, GamePhase, RiftboundGameState } from "../types/game-state";
import type { Domain } from "../types/moves";

// ---------------------------------------------------------------------------
// Handles
// ---------------------------------------------------------------------------

/** Player identity ("player-1", …). The chooser of every Decision is a Seat. */
export type Seat = string;

export const P1: Seat = "player-1";
export const P2: Seat = "player-2";
export const P3: Seat = "player-3";
export const P4: Seat = "player-4";

/** Pseudo-seat for omniscient observation (tests, replays). */
export const SPECTATOR = "spectator" as const;
export type Viewer = Seat | typeof SPECTATOR;

/** Opaque engine card-instance id. Scenario aliases are used verbatim as ids. */
export type CardRef = string;

/** Battlefield id (the battlefield card's instance id, e.g. "bf1"). */
export type BattlefieldRef = string;

/** Engine zone ids, verbatim. */
export type SimpleZoneKey =
  | "hand"
  | "base"
  | "trash"
  | "banishment"
  | "mainDeck"
  | "runeDeck"
  | "runePool"
  | "legendZone"
  | "championZone"
  | "battlefieldRow"
  | "chain";
export type ZoneKey = SimpleZoneKey | `battlefield-${string}` | `facedown-${string}`;

export interface ZoneRef {
  readonly zone: ZoneKey;
  /** Owner filter for shared per-player zones (hand/base/…); omitted = all owners. */
  readonly owner?: Seat;
}

/** Where a permanent "is" in rules terms: base or a battlefield. */
export type LocationRef = "base" | BattlefieldRef;

export interface ZoneSummary {
  readonly zone: ZoneKey;
  readonly owner?: Seat;
  readonly count: number;
  /** false when the viewer may not see identities in this zone. */
  readonly visible: boolean;
}

// ---------------------------------------------------------------------------
// Card definitions supplied to the harness
// ---------------------------------------------------------------------------

/** Loose card-definition shape (a `@tcg/riftbound-types` Card or an inline test def). */
export interface CardDefLike {
  readonly id?: string;
  readonly name?: string;
  readonly cardType: string;
  readonly energyCost?: number;
  readonly powerCost?: readonly string[];
  readonly might?: number;
  readonly mightBonus?: number;
  readonly domain?: string | readonly string[];
  readonly keywords?: readonly string[];
  readonly tags?: readonly string[];
  readonly timing?: string;
  readonly isChampion?: boolean;
  readonly championTag?: string;
  readonly rulesText?: string;
  readonly abilities?: readonly unknown[];
  readonly [extra: string]: unknown;
}

export interface CardPool {
  get(defId: string): CardDefLike | undefined;
  all(): readonly CardDefLike[];
  readonly size: number;
}

// ---------------------------------------------------------------------------
// Card state (GetCardState in the mockup)
// ---------------------------------------------------------------------------

export interface GrantedKeywordView {
  readonly keyword: string;
  readonly value?: number;
  readonly duration: string;
}

export interface CardState {
  readonly id: CardRef;
  readonly defId: string;
  readonly name: string;
  readonly cardType: string;
  readonly owner: Seat;
  readonly controller: Seat;
  readonly zone: ZoneKey;
  /** "base", a battlefield id, or undefined when not on the board. */
  readonly location?: LocationRef;
  readonly damage: number;
  readonly baseMight: number;
  /** Effective might: base + buff + mightModifier + staticMightBonus + equipment. */
  readonly might: number;
  readonly energyCost: number;
  readonly powerCost: readonly string[];
  readonly domains: readonly string[];
  /** Printed keywords ∪ granted keywords (names only). */
  readonly keywords: readonly string[];
  readonly grantedKeywords: readonly GrantedKeywordView[];
  readonly isExhausted: boolean;
  /** Alias of isExhausted for the mockup vocabulary. */
  readonly isTapped: boolean;
  readonly isReady: boolean;
  readonly isStunned: boolean;
  readonly isBuffed: boolean;
  readonly isHidden: boolean;
  readonly isEmpowered: boolean;
  readonly isToken: boolean;
  readonly attachedTo?: CardRef;
  readonly attachments: readonly CardRef[];
  readonly combatRole: CombatRole;
  readonly mightModifier: number;
  readonly staticMightBonus: number;
  readonly rulesText?: string;
  /** Raw engine meta (including reserved __flags/__counters) for escape-hatch assertions. */
  readonly meta: Readonly<Record<string, unknown>>;
}

/** A redacted card as seen by a seat that may not know its identity. */
export interface HiddenCardView {
  readonly hidden: true;
  readonly owner: Seat;
  readonly zone: ZoneKey;
  readonly index: number;
}

export type CardView = CardState | HiddenCardView;

export function isHiddenView(v: CardView): v is HiddenCardView {
  return (v as HiddenCardView).hidden === true && !("id" in v);
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export type DecisionTiming = "PRE" | "ACT" | "FIN" | "PAY" | "RES" | "RPL" | "CLN" | "CMB" | "PROC";

export type OptionKey = string;

export interface DecisionSource {
  readonly cardId?: CardRef;
  readonly chainItemId?: string;
  readonly moveId?: string;
  readonly pendingChoiceType?: string;
}

export interface DecisionBase {
  readonly id: string;
  readonly seat: Seat;
  readonly timing: DecisionTiming;
  readonly prompt: string;
  readonly source?: DecisionSource;
  /** true for harness-generated follow-ups (not an engine prompt). */
  readonly synthetic?: boolean;
}

export type ActionContext = "main" | "chain" | "showdown" | "free" | "procedure";

export type ActionVerb =
  | "play"
  | "cast"
  | "equip"
  | "activate"
  | "move"
  | "gank"
  | "recall"
  | "hide"
  | "reveal"
  | "playChampion"
  | "tapRune"
  | "recycleRune"
  | "passPriority"
  | "passFocus"
  | "endTurn"
  | "concede"
  | "resolveCombat"
  | "conquer"
  | "contest"
  | "startShowdown"
  | "endShowdown"
  | "resolveChain"
  | "invite"
  | "score"
  | "other";

export type ActionFieldKind = "card" | "cards" | "zone" | "enum" | "bool" | "int";

export interface ActionField {
  /** Engine param name (targets, location, xAmount, …). */
  readonly name: string;
  /** PlayArgs name (targets, to, x, …). */
  readonly arg: keyof PlayArgs | string;
  readonly kind: ActionFieldKind;
  /** Distinct legal values across variants (JSON values; arrays for tuples). */
  readonly options?: readonly unknown[];
  readonly min?: number;
  readonly max?: number;
  /** true when every variant sets this param (agent must supply or accept a follow-up). */
  readonly required: boolean;
}

export interface FlatMove {
  readonly moveId: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly playerId: Seat;
}

export interface ActionOption {
  readonly key: OptionKey;
  readonly moveId: string;
  readonly verb: ActionVerb;
  readonly label: string;
  readonly card?: CardRef;
  readonly variantCount: number;
  readonly fields: readonly ActionField[];
  /** Flat engine variants behind this option (omitted from redacted summaries). */
  readonly variants: readonly FlatMove[];
}

export interface ActionDecision extends DecisionBase {
  readonly kind: "action";
  readonly context: ActionContext;
  readonly options: readonly ActionOption[];
  readonly passKey?: OptionKey;
  readonly endTurnKey?: OptionKey;
}

export interface PickOption {
  readonly key: OptionKey;
  readonly label: string;
  readonly card?: CardRef;
  readonly zone?: string;
  readonly mode?: number;
  readonly seatRef?: Seat;
  readonly value?: unknown;
}

export type PickSemantics =
  | "target"
  | "drop-target"
  | "destination"
  | "mode"
  | "from-revealed"
  | "equip"
  | "follow-up"
  /** rule 372 — which of several replacement effects applies to one event first. */
  | "replacement-order"
  /** rule 373 — which death a single-use replacement effect is applied to. */
  | "replacement-assign"
  /** rule 355.11.b — a subset of an effect's ORIGINAL targets. */
  | "subset";

export interface PickDecision extends DecisionBase {
  readonly kind: "pick";
  readonly options: readonly PickOption[];
  readonly min: number;
  readonly max: number;
  readonly allowDecline: boolean;
  readonly semantics?: PickSemantics;
  /** Extra engine facts (onPicked / onRest for reveal-and-pick, field name for follow-ups). */
  readonly meta?: Readonly<Record<string, unknown>>;
}

export interface YesNoDecision extends DecisionBase {
  readonly kind: "yes-no";
  readonly consequence?: string;
  /** False when "yes" is not a legal answer right now (e.g. an unpayable "you may [cost] to …"). */
  readonly canAccept?: boolean;
  /**
   * rule 444.2.c / 429.3.a: actions that stay legal while this Pay is being
   * demanded (Reaction [Add] abilities), offered alongside yes/no.
   */
  readonly actions?: readonly ActionOption[];
}

export interface IntegerDecision extends DecisionBase {
  readonly kind: "integer";
  readonly min: number;
  readonly max: number;
  readonly unit: string;
  /**
   * rule 429.3 / 429.3.a: actions that stay legal while this payment is being
   * asked for (Reaction [Add] abilities), offered alongside the number.
   */
  readonly actions?: readonly ActionOption[];
}

export interface DistributeBucket {
  readonly key: OptionKey;
  readonly label: string;
  readonly card?: CardRef;
  readonly min: number;
  readonly max: number;
}

export interface DistributeDecision extends DecisionBase {
  readonly kind: "distribute";
  readonly total: number;
  readonly buckets: readonly DistributeBucket[];
  /**
   * rule 465.2.c.3 — a always-legal forced/greedy allocation, offered so
   * `settle()` can take a combat-damage assignment instead of stalling.
   */
  readonly defaultAllocation?: Readonly<Record<OptionKey, number>>;
}

export interface OrderDecision extends DecisionBase {
  readonly kind: "order";
  readonly items: readonly PickOption[];
  /**
   * rule 383.3.d — a soft offer: the seat MAY `order([...])`, but every other
   * verb / settle() accepts the listed order (answered with no keys).
   */
  readonly defaultable?: boolean;
  /** The seat's ordinary action menu, still available beside a `defaultable` offer. */
  readonly actions?: readonly ActionOption[];
}

export interface DeckArrangeDecision extends DecisionBase {
  readonly kind: "deck-arrange";
  readonly cards: readonly PickOption[];
  readonly mayRecycle: boolean;
  readonly keepMax?: number;
}

export interface NameDecision extends DecisionBase {
  readonly kind: "name";
  readonly vocabulary: readonly string[];
  readonly cardType?: string;
}

export type Decision =
  | ActionDecision
  | PickDecision
  | YesNoDecision
  | IntegerDecision
  | DistributeDecision
  | OrderDecision
  | DeckArrangeDecision
  | NameDecision;

export type DecisionKind = Decision["kind"];

/** What a non-chooser seat sees of somebody else's decision. */
export interface DecisionSummary {
  readonly id: string;
  readonly seat: Seat;
  readonly kind: DecisionKind;
  readonly prompt: string;
  readonly context?: ActionContext;
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

/** The nested optional fields of the play/activate/move bundle (idiomatic names). */
export interface PlayArgs {
  targets?: CardRef | readonly CardRef[];
  x?: number;
  repeat?: number;
  flow?: boolean;
  accelerate?: boolean;
  payOptional?: boolean;
  sacrifice?: CardRef;
  discard?: CardRef;
  /** Location / destination: "base", a battlefield id, or a battlefield zone id. */
  to?: string;
  units?: readonly CardRef[];
  domain?: Domain | string;
  costTarget?: CardRef;
  abilityIndex?: number;
  source?: CardRef;
  /**
   * rule 355.1 / 356 — the cost bundle in one field (mirrors the engine's
   * `costs` param): which alternative (`"flow" | "alt" | "hidden" | …`) and which
   * additional costs are paid — `true`, the paying card, or the paying cards.
   * e.g. `{ paid: { accelerate: true } }`, `{ paid: { kill: "pawn" } }`,
   * `{ paid: { "kill-any": ["a", "b"] } }`, `{ alternativeId: "flow" }`.
   */
  costs?: {
    readonly alternativeId?: string;
    readonly paid?: Readonly<Record<string, true | false | CardRef | readonly CardRef[] | { readonly objects?: readonly CardRef[] }>>;
  };
  /** Raw engine-param constraints for anything not covered above. */
  params?: Readonly<Record<string, unknown>>;
}

export type Answer =
  | { kind: "action"; key: OptionKey; args?: PlayArgs; decisionId?: string }
  | { kind: "pick"; keys: readonly OptionKey[]; decisionId?: string }
  | { kind: "decline"; decisionId?: string }
  | { kind: "yes-no"; value: boolean; decisionId?: string }
  | { kind: "integer"; value: number; decisionId?: string }
  | { kind: "distribute"; allocation: Readonly<Record<OptionKey, number>>; decisionId?: string }
  | { kind: "order"; keys: readonly OptionKey[]; decisionId?: string }
  | { kind: "deck-arrange"; top: readonly OptionKey[]; recycle: readonly OptionKey[]; decisionId?: string }
  | { kind: "name"; name: string; decisionId?: string };

/** Shorthand accepted by L2 `answer()` / scripts, coerced against the live decision. */
export type AnswerShorthand =
  | Answer
  | CardRef
  | readonly CardRef[]
  | number
  | boolean
  | "decline"
  | "pass"
  | "yes"
  | "no";

export type ScriptedAnswer = AnswerShorthand | ((decision: Decision) => AnswerShorthand | undefined);

// ---------------------------------------------------------------------------
// Observation / results / errors
// ---------------------------------------------------------------------------

export interface ExecutedMove {
  readonly moveId: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly seat: Seat;
  /** true when fired by the TurnDriver (auto procedure), not by the answer itself. */
  readonly auto?: boolean;
}

export interface Violation {
  readonly invariant: string;
  readonly message: string;
  readonly seq: number;
}

export interface BattlefieldView {
  readonly id: BattlefieldRef;
  readonly name: string;
  readonly controller: Seat | null;
  readonly contested: boolean;
  readonly contestedBy?: Seat;
  readonly units: readonly CardView[];
  readonly facedownCount: number;
}

export interface Observation {
  readonly seq: number;
  readonly viewer: Viewer;
  readonly status: RiftboundGameState["status"];
  readonly winner?: Seat;
  readonly turn: { readonly number: number; readonly activePlayer: Seat; readonly phase: GamePhase };
  readonly actingSeat?: Seat;
  /** Public game-specific state (no zones). */
  readonly state: RiftboundGameState;
  readonly resources: Readonly<Record<Seat, { energy: number; power: Readonly<Record<string, number>> }>>;
  readonly points: Readonly<Record<Seat, number>>;
  readonly zones: Readonly<Record<string, readonly CardView[]>>;
  readonly battlefields: readonly BattlefieldView[];
  readonly chain: readonly { id: string; cardId: CardRef; name: string; controller: Seat; type: string; triggered: boolean; countered: boolean }[];
  readonly decision: Decision | DecisionSummary | null;
}

export type HarnessErrorCode =
  | "NO_DECISION"
  | "NOT_YOUR_DECISION"
  | "STALE_DECISION"
  | "UNKNOWN_OPTION"
  | "AMBIGUOUS_ACTION"
  | "ILLEGAL_ARGS"
  | "WRONG_ANSWER_KIND"
  | "ENGINE_REJECTED"
  | "CARD_NOT_FOUND"
  | "SCRIPT_EXHAUSTED"
  | "UNSCRIPTED_DECISION"
  | "INVARIANT"
  | "TIMEOUT"
  | "GAME_OVER";

export interface HarnessErrorInfo {
  readonly code: HarnessErrorCode;
  readonly message: string;
  readonly detail?: Readonly<Record<string, unknown>>;
}

export class HarnessError extends Error {
  readonly code: HarnessErrorCode;
  readonly detail?: Readonly<Record<string, unknown>>;
  constructor(info: HarnessErrorInfo) {
    super(`[${info.code}] ${info.message}`);
    this.name = "HarnessError";
    this.code = info.code;
    this.detail = info.detail;
  }
  toInfo(): HarnessErrorInfo {
    return { code: this.code, detail: this.detail, message: this.message };
  }
}

export type ActResult =
  | {
      readonly ok: true;
      readonly seq: number;
      readonly executed: readonly ExecutedMove[];
      readonly decision: Decision | null;
      /** Present when the answer was incomplete and a synthetic follow-up is now pending (nothing executed yet). */
      readonly followUp?: Decision;
      readonly violations: readonly Violation[];
    }
  | {
      readonly ok: false;
      readonly seq: number;
      readonly error: HarnessErrorInfo;
      readonly decision: Decision | null;
    };
