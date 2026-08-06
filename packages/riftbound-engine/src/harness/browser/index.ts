/**
 * BrowserBackend — the GameBackend over the live web client (Playwright).
 * See docs/harness/HARNESS-DESIGN.md §8.
 */

export { BrowserBackend } from "./browser-backend";
export type { BrowserActMode, BrowserLaunchOptions, VisualRecord } from "./browser-backend";
export { attachBrowserGame, browserBackendOf, launchBrowserGame } from "./game-browser";
export { AnswerResolver } from "./answer-resolver";
export type { ResolvePlan, ResolverHost } from "./answer-resolver";
export {
  SnapshotEngine,
  browserDecisionContext,
  frameHash,
  registerSnapshotCards,
  toFlatMoves,
  toGameState,
  toInternalView,
} from "./snapshot-adapter";
export type { BrowserFrame, FrameMeta, PageRead, UiCard, UiMove, UiSnapshot } from "./snapshot-adapter";
export { performVisual } from "./visual";
export type { VisualOutcome } from "./visual";
export { loadPlaywright } from "./playwright-loader";
export type { PwBrowser, PwPage } from "./playwright-loader";
