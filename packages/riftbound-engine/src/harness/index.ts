/**
 * Riftbound agent harness — public surface.
 *
 *   L0  GameBackend / EngineBackend        (backend.ts, engine-backend.ts)
 *   L1  Decision / Answer protocol         (types.ts, decision.ts)
 *   L2  Game / Seat ergonomic API          (game.ts)
 *   L3  scenario() builder                 (scenario.ts)
 *   L4  invariants + transcripts           (invariants.ts, transcript.ts)
 *
 * See docs/harness/HARNESS-DESIGN.md.
 */

export * from "./types";
export type { GameBackend, WaitForOptions } from "./backend";
export { EngineBackend } from "./engine-backend";
export type { EngineBackendOptions } from "./engine-backend";
export {
  Game,
  Scenario,
  SeatHandle,
  scenario,
  passivePolicy,
  firstOptionPolicy,
} from "./game";
export type {
  ActivateOptions,
  CardQuery,
  CastOptions,
  GameOptions,
  PlayOptions,
  Policy,
  SettleOptions,
  SettleResult,
  VerbOptions,
} from "./game";
export { ScenarioBuilder, buildScenarioEngine } from "./scenario";
export type {
  BattlefieldOptions,
  BuiltScenario,
  CardPlacement,
  DefSpec,
  InlineCardDef,
  ScenarioBattlefield,
  ScenarioCard,
  ScenarioOptions,
  ScenarioSpec,
  ScriptSpec,
} from "./scenario";
export {
  DEFAULT_INVARIANTS,
  cardConservation,
  costPaid,
  energyNonNegative,
  noOrphanChain,
  pendingChoiceGatesMoves,
  runInvariants,
  singleDecisionCursor,
} from "./invariants";
export type { Invariant, InvariantContext, StepInfo } from "./invariants";
export { rebuildOrigin, replayTranscript } from "./transcript";
export type { ReplayOptions, ReplayResult, Transcript, TranscriptOrigin, TranscriptStep } from "./transcript";
export {
  basicRuneDef,
  createCardPool,
  FILLER_UNIT_DEF,
  loadDefaultCardPool,
  peekDefaultCardPool,
  setDefaultCardPool,
  toLookupPayload,
} from "./card-pool";
export { buildCardState, cardLabel, isTokenInstance, locationOfZone } from "./card-state";
export {
  coerceAnswer,
  deriveActionDecision,
  deriveDecision,
  deriveFromPendingChoice,
  engineDecisionContext,
  groupActions,
  narrowVariants,
  resolvePendingAnswer,
  spellSupportsX,
} from "./decision";
export type { DecisionContext, NarrowResult } from "./decision";
export { endTurn, nextPlayerAfter, PROCEDURE_MOVES, runProcedures } from "./turn-driver";
export type { EndTurnResult, ProcedureRun } from "./turn-driver";
export { observe, listZoneSummaries, isPrivateZone, canSee } from "./observation";
export { getInternalState, hashEngine, takeSnapshot } from "./internal";
export type { FullSnapshot, HarnessEngine } from "./internal";
export { getActingSeat, getPendingChoiceChooser } from "../views/acting-seat";
// L0 over the live web client (Playwright resolved lazily at runtime; safe to import headlessly).
export * as Browser from "./browser";
export { BrowserBackend, attachBrowserGame, launchBrowserGame } from "./browser";
export type { BrowserActMode, BrowserLaunchOptions } from "./browser";
