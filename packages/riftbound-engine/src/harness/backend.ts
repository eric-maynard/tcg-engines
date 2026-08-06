/**
 * L0 — GameBackend: the contract every way-of-playing implements
 * (in-process RuleEngine today; WebSocket / Playwright-driven UI later).
 *
 * Reads are synchronous against the backend's latest known frame; acts are
 * async and resolve once the frame reflecting them (and any automatic
 * follow-on activity) has arrived.
 */

import type {
  ActResult,
  ActionDecision,
  Answer,
  CardRef,
  CardState,
  Decision,
  Observation,
  Seat,
  Viewer,
  ZoneKey,
} from "./types";

export interface WaitForOptions {
  readonly viewer?: Viewer;
  readonly timeoutMs?: number;
}

export interface GameBackend {
  /** Seats in turn order. */
  seats(): readonly Seat[];
  /** Monotonic step counter; embedded in Decision ids and Observations. */
  seq(): number;
  /** The cursor seat's current decision (including harness follow-ups), or null. */
  decision(): Decision | null;
  /** `seat`'s own menu: the cursor decision if it is theirs, else their free actions (or null). */
  decisionFor(seat: Seat): Decision | ActionDecision | null;
  /** Latest known observation for a viewer ("spectator" = omniscient). */
  view(viewer: Viewer): Observation;
  /** Answer a decision (or take a free action) as `seat`. Never throws for game-level failures. */
  act(seat: Seat, answer: Answer): Promise<ActResult>;
  /** Resolve when `pred` holds on a fresh observation; reject with TIMEOUT otherwise. */
  waitFor(pred: (o: Observation) => boolean, opts?: WaitForOptions): Promise<Observation>;
  /** Deterministic hash of the full position (public state + zones + metas). */
  stateHash(): string;
  /** Omniscient card lookup (tests / spectator tooling). */
  cardState(card: CardRef): CardState;
  /** Omniscient zone listing. */
  cardsIn(zone: ZoneKey | string, owner?: Seat): readonly CardRef[];
  close(): Promise<void>;
}
