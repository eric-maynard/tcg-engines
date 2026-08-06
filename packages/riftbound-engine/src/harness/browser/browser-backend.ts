/**
 * L0 over the LIVE web client: a Playwright page connected to the app's game
 * WebSocket. Same GameBackend contract as EngineBackend —
 *
 *   reads   sync against the latest frame pulled from
 *           window.__rbGameState / __rbAvailableMoves / lastSeq
 *   act()   Answer → {moveId, params} via the shared L1 narrowing
 *           (AnswerResolver over decision.ts), dispatched either
 *             semantic: page.evaluate(executeMove(moveId, params, playerId))
 *             visual:   the real UI gesture (visual.ts), semantic fallback
 *           then gated on move_accepted|move_rejected for our requestId,
 *           the goldfish `sandboxAutoPlay` frame, auto procedures, and the
 *           cursor returning to a local seat.
 *
 * Scenario-style placement is engine-only. On the live server the setup
 * vocabulary is: fresh goldfish game (+ optional saved deck) → `tutor(defId)`
 * (card to hand + energy cost+4 + power pips) → `addResources()`.
 */

import { CardDefinitionRegistry, getGlobalCardRegistry, setGlobalCardRegistry } from "../../operations/card-lookup";
import { getActingSeat } from "../../views/acting-seat";
import type { GameBackend, WaitForOptions } from "../backend";
import { loadDefaultCardPool } from "../card-pool";
import { buildCardState } from "../card-state";
import { PROCEDURE_MOVE_IDS, deriveDecision } from "../decision";
import type { DecisionContext } from "../decision";
import type { HarnessEngine } from "../internal";
import { canonicalJson } from "../internal";
import { observe, zoneCards } from "../observation";
import type { Transcript, TranscriptStep } from "../transcript-types";
import type {
  ActResult,
  ActionDecision,
  Answer,
  CardPool,
  CardRef,
  CardState,
  Decision,
  ExecutedMove,
  FlatMove,
  Observation,
  Seat,
  Viewer,
  Violation,
} from "../types";
import { HarnessError } from "../types";
import { AnswerResolver } from "./answer-resolver";
import type { ResolvePlan } from "./answer-resolver";
import { CALM_SCRIPT, DISPATCH_FN, FRAME_AFTER_FN, OUTCOME_FN, READY_FN, READ_FRAME, TAP_SCRIPT, call } from "./page-scripts";
import { launchNodeBridge } from "./bridge";
import { guardPage, launchInProcess } from "./playwright-loader";
import type { LaunchedBrowser, PwPage } from "./playwright-loader";
import {
  SnapshotEngine,
  browserDecisionContext,
  frameHash,
  registerSnapshotCards,
  toFlatMoves,
  toGameState,
} from "./snapshot-adapter";
import type { BrowserFrame, FrameMeta, PageRead, UiMove } from "./snapshot-adapter";
import { performVisual } from "./visual";
import type { VisualOutcome } from "./visual";

export type BrowserActMode = "semantic" | "visual";

export interface BrowserLaunchOptions {
  /** App origin (default http://localhost:3000). */
  readonly baseUrl?: string;
  /** The seat this browser plays (default player-1). */
  readonly seat?: Seat;
  /** "test" = GET /play/test (fastest; sandbox goldfish, P1 first). "goldfish" = the real /play solo lobby flow. */
  readonly mode?: "goldfish" | "test";
  /** #soloDeckSelect value for goldfish mode ("default" or a saved deck id). */
  readonly deck?: string;
  /** goldfish mode: "duel" (Bo1, random battlefield) | "match" (Bo3, pick battlefield). */
  readonly soloMode?: "duel" | "match";
  readonly headless?: boolean;
  /** Drive an existing Playwright page (already on a board, or navigated by us when `navigate` is true). */
  readonly page?: PwPage;
  /** With `page`: run the bootstrap navigation on it (default: only attach). */
  readonly navigate?: boolean;
  readonly actMode?: BrowserActMode;
  readonly pool?: CardPool;
  /** Auto-run resolveFullCombat / endShowdown / resolveChain when the UI offers them to us (default true). */
  readonly autoProcedures?: boolean;
  /** Per-act timeout for server round-trips (default 8000ms). */
  readonly timeoutMs?: number;
  /** How long to wait for the goldfish `sandboxAutoPlay` frame after an accepted WS move (default 2500ms). */
  readonly autoplayGraceMs?: number;
  /** After bootstrap, pass priority/focus until the local seat holds an open main-phase decision (default true). */
  readonly settle?: boolean;
  readonly viewport?: { width: number; height: number };
  /**
   * Where Playwright runs: "node" = a Node child process (bridge.ts / pw-bridge.mjs; default when
   * `node` is on PATH — dependable browser transport, hard-killable), "bun" = inside this process
   * (chromium.launch(); observed to wedge sporadically under Bun). Env: RB_BROWSER_TRANSPORT.
   */
  readonly transport?: "node" | "bun";
  /** Abort /card-image/* requests (saves renderer CPU/bandwidth). Default false: the pending-choice modal's picks ARE <img> elements, so visual mode needs them laid out. */
  readonly blockImages?: boolean;
  /** Inject a stylesheet disabling CSS animations/transitions (stable clicks, less CPU). Default true. */
  readonly calm?: boolean;
}

export interface VisualRecord {
  readonly seq: number;
  readonly moveId: string;
  readonly gesture: string;
  readonly dispatched: boolean;
  /** Set when the gesture could not express the move and semantic dispatch was used instead. */
  readonly visualFallback?: string;
  /** Set when the UI sent something other than the resolved move. */
  readonly mismatch?: { wanted: FlatMove; sent: { moveId: string; params: Record<string, unknown> } };
}

interface DispatchOutcome {
  readonly ok: boolean;
  readonly frame?: FrameMeta;
  readonly error?: string;
  readonly errorCode?: string;
  readonly via: "ws" | "rest" | "visual";
  readonly acceptedSeq: number;
  /** Visual mode: the move the UI actually sent when it differs from the resolved one. */
  readonly sent?: FlatMove;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** RB_BROWSER_DEBUG=1 traces every dispatch / wait to stderr. */
const DEBUG = process.env.RB_BROWSER_DEBUG === "1";
function trace(...parts: unknown[]): void {
  if (DEBUG) {
    console.error("[browser-backend]", new Date().toISOString().slice(11, 23), ...parts);
  }
}

export class BrowserBackend implements GameBackend {
  /** The Playwright page, wrapped so calls without native timeouts are bounded (see guardPage). */
  readonly page: PwPage;
  /** The unwrapped Playwright page (for callers that need the full API). */
  readonly rawPage: PwPage;
  readonly baseUrl: string;
  readonly pool?: CardPool;
  actMode: BrowserActMode;
  readonly autoProcedures: boolean;
  readonly timeoutMs: number;
  readonly autoplayGraceMs: number;
  /** Notes about visual gestures / fallbacks, newest last. */
  readonly visualLog: VisualRecord[] = [];

  private readonly browser?: LaunchedBrowser;
  private readonly registry = new CardDefinitionRegistry();
  private readonly resolver: AnswerResolver;
  private readonly steps: TranscriptStep[] = [];
  private frame!: BrowserFrame;
  private facade!: SnapshotEngine;
  private initialHash = "";
  private closed = false;

  private constructor(page: PwPage, browser: LaunchedBrowser | undefined, opts: BrowserLaunchOptions) {
    this.rawPage = page;
    this.page = guardPage(page, opts.timeoutMs ?? 8000);
    this.browser = browser;
    this.baseUrl = (opts.baseUrl ?? "http://localhost:3000").replace(/\/$/, "");
    this.pool = opts.pool;
    this.actMode = opts.actMode ?? "semantic";
    this.autoProcedures = opts.autoProcedures ?? true;
    this.timeoutMs = opts.timeoutMs ?? 8000;
    this.autoplayGraceMs = opts.autoplayGraceMs ?? 2500;
    this.resolver = new AnswerResolver(
      { ctx: () => this.ctx(), seq: () => this.seq(), status: () => this.frame?.snapshot.status ?? "setup" },
      (ctx) => deriveDecision(ctx),
    );
  }

  // ---- construction -----------------------------------------------------------

  /** Is an app answering on `baseUrl`? (used by the gated tests) */
  static async probe(baseUrl = "http://localhost:3000", timeoutMs = 1500): Promise<boolean> {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeoutMs);
      const r = await fetch(`${baseUrl.replace(/\/$/, "")}/api/config`, { signal: ctl.signal });
      clearTimeout(t);
      return r.ok;
    } catch {
      return false;
    }
  }

  static async launch(opts: BrowserLaunchOptions = {}): Promise<BrowserBackend> {
    const pool = opts.pool ?? (await loadDefaultCardPool());
    let browser: LaunchedBrowser | undefined;
    let page = opts.page;
    if (!page) {
      browser = await BrowserBackend.startBrowser(opts);
      page = browser.page;
    }
    const backend = new BrowserBackend(page, browser, { ...opts, pool });
    try {
      trace("launch: init script");
      await backend.page.addInitScript({ content: TAP_SCRIPT });
      if (opts.calm ?? true) {
        await backend.page.addInitScript({ content: CALM_SCRIPT });
      }
      if (opts.blockImages === true && backend.page.route) {
        await backend.page.route("**/card-image/**", (route) => route.abort());
      }
      if (!opts.page || opts.navigate) {
        trace("launch: bootstrap", opts.mode ?? "test");
        await backend.bootstrap(opts);
      }
      await backend.page.evaluate(TAP_SCRIPT);
      if (opts.calm ?? true) {
        await backend.page.evaluate(CALM_SCRIPT);
      }
      trace("launch: wait ready");
      await backend.waitReady(20_000);
      await backend.refresh();
      trace("launch: board ready", backend.gameId, `seq=${backend.seq()}`);
      const want = opts.seat;
      if (want && want !== backend.frame.viewingPlayer) {
        if (!backend.frame.snapshot.players[want]) {
          throw new HarnessError({ code: "ILLEGAL_ARGS", detail: { seat: want }, message: `No seat "${want}" in this game` });
        }
        await backend.page.evaluate(`switchPlayer(${JSON.stringify(want)})`);
        await backend.waitReady(10_000);
        await backend.page.evaluate(TAP_SCRIPT);
        await backend.refresh();
      }
      backend.initialHash = backend.stateHash();
      if (opts.settle ?? true) {
        await backend.settleOpening();
      }
      return backend;
    } catch (error) {
      await backend.close().catch(() => undefined);
      throw error;
    }
  }

  /** Start chromium via the Node bridge (default) or in-process, per `opts.transport` / RB_BROWSER_TRANSPORT. */
  static async startBrowser(opts: Pick<BrowserLaunchOptions, "headless" | "viewport" | "transport" | "timeoutMs"> = {}): Promise<LaunchedBrowser> {
    const want = opts.transport ?? (process.env.RB_BROWSER_TRANSPORT as "node" | "bun" | undefined) ?? "node";
    const common = { headless: opts.headless ?? true, timeoutMs: opts.timeoutMs, viewport: opts.viewport ?? { height: 900, width: 1440 } };
    if (want === "node") {
      try {
        const b = await launchNodeBridge(common);
        trace("launch: chromium up via node bridge");
        return b;
      } catch (error) {
        trace("launch: node bridge unavailable, falling back to in-process playwright:", (error as Error).message);
      }
    }
    const b = await launchInProcess(common);
    trace("launch: chromium up in-process (bun)");
    return b;
  }

  /** Which transport hosts Playwright ("node" bridge, in-process "bun", or "external" for a caller-supplied page). */
  get transport(): "node" | "bun" | "external" {
    return this.browser?.transport ?? "external";
  }

  /** Page-side diagnostics collected by the transport (console errors, pageerrors, dialogs). */
  get pageErrors(): readonly string[] {
    return this.browser?.pageErrors ?? [];
  }

  private async bootstrap(opts: BrowserLaunchOptions): Promise<void> {
    const mode = opts.mode ?? "test";
    if (mode === "test") {
      await this.page.goto(`${this.baseUrl}/play/test`, { timeout: 20_000, waitUntil: "load" });
      return;
    }
    // Real solo lobby flow (02-ui-surface §4B).
    await this.page.goto(`${this.baseUrl}/play?cb=${Date.now()}`, { timeout: 20_000, waitUntil: "load" });
    await this.page.evaluate(`(() => { try { sessionStorage.removeItem("rb_game"); } catch (e) {} })()`);
    await this.page.goto(`${this.baseUrl}/play?cb=${Date.now() + 1}`, { timeout: 20_000, waitUntil: "load" });
    await this.page.locator("#sandboxOption").first().click({ timeout: 10_000 });
    await this.page.waitForFunction(`!!document.querySelector("#soloDeckPicker:not(.hidden)")`, undefined, { timeout: 10_000 });
    if (opts.deck) {
      await this.page.evaluate(
        `(() => { const s = document.querySelector("#soloDeckSelect"); if (!s) return false; const v = ${JSON.stringify(opts.deck)}; const has = Array.from(s.options).some((o) => o.value === v); if (has) { s.value = v; s.dispatchEvent(new Event("change")); } return has; })()`,
      );
    }
    if (opts.soloMode) {
      await this.page.evaluate(
        `(() => { const r = document.querySelector('input[name="soloMode"][value=${JSON.stringify(opts.soloMode)}]'); if (r) { r.checked = true; r.dispatchEvent(new Event("change")); } })()`,
      );
    }
    await this.page.locator("#soloDeckPicker .start-btn").first().click({ timeout: 10_000 });
    // Pregame: battlefield select (match) and mulligan (keep). The sandbox server completes the
    // goldfish's mulligan but NOT its battlefield pick, so we make that pick over a side socket.
    const deadline = Date.now() + 25_000;
    let goldfishBfDone = false;
    while (Date.now() < deadline) {
      const ready = await this.page.evaluate<boolean>(call(READY_FN));
      if (ready) {
        return;
      }
      const step = await this.page.evaluate<string>(
        `(() => { const ov = document.querySelector("#pregameOverlay.visible"); if (!ov) return "none"; const bf = ov.querySelector(".bf-choice:not(.selected)"); if (bf && !ov.querySelector(".bf-choice.selected")) { bf.click(); return "bf"; } if (ov.querySelector(".pregame-waiting")) return "bf-waiting"; const keep = ov.querySelector(".mulligan-btn-keep") || ov.querySelector("button:not([disabled])"); if (keep) { keep.click(); return "keep"; } return "wait"; })()`,
      );
      if (step === "bf-waiting" && !goldfishBfDone) {
        goldfishBfDone = await this.pickGoldfishBattlefield().catch((error) => {
          trace("goldfish battlefield pick failed:", String(error));
          return false;
        });
      }
      await sleep(400);
    }
    throw new HarnessError({ code: "TIMEOUT", message: "goldfish bootstrap: board did not become playable within 25s" });
  }

  /**
   * Sandbox "match" games: choose the goldfish seat's battlefield (first option) over a short-lived
   * game socket opened as that seat (the game WS trusts ?player=; sandbox only).
   */
  private async pickGoldfishBattlefield(): Promise<boolean> {
    const info = await this.page.evaluate<{ gameId: string; me: string; players: string[] } | null>(
      `(() => window.__rbGameId ? { gameId: window.__rbGameId, me: window.__rbViewingPlayer, players: Object.keys((window.__rbGameState && window.__rbGameState.players) || { "player-1": 1, "player-2": 1 }) } : null)()`,
    );
    if (!info) {
      return false;
    }
    const other = info.players.find((p) => p !== info.me) ?? "player-2";
    const wsUrl = `${this.baseUrl.replace(/^http/, "ws")}/ws/game/${info.gameId}?player=${encodeURIComponent(other)}`;
    trace("goldfish battlefield pick via", wsUrl);
    return new Promise<boolean>((resolve) => {
      const sock = new WebSocket(wsUrl);
      const done = (ok: boolean) => {
        clearTimeout(timer);
        try {
          sock.close();
        } catch {
          /* ignore */
        }
        resolve(ok);
      };
      const timer = setTimeout(() => done(false), 5_000);
      sock.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as { type?: string; pregame?: { phase?: string; battlefieldOptions?: { id: string }[]; battlefieldSelected?: string | null } };
          const pg = msg.pregame;
          if (msg.type !== "sync" || !pg) {
            return;
          }
          if (pg.phase !== "battlefield_select" || pg.battlefieldSelected) {
            done(true);
            return;
          }
          const choice = pg.battlefieldOptions?.[0]?.id;
          if (!choice) {
            done(false);
            return;
          }
          sock.send(JSON.stringify({ battlefieldId: choice, type: "pregame_battlefield_select" }));
        } catch {
          /* ignore */
        }
      };
      sock.onerror = () => done(false);
    });
  }

  private async waitReady(timeout: number): Promise<void> {
    try {
      await this.page.waitForFunction(call(READY_FN), undefined, { timeout });
    } catch {
      throw new HarnessError({ code: "TIMEOUT", detail: { url: this.page.url() }, message: "page has no playable game (status playing + open game socket)" });
    }
  }

  /** Pass priority / focus for the local seat until it holds an open main-phase (or free) decision. */
  async settleOpening(maxSteps = 12): Promise<void> {
    for (let i = 0; i < maxSteps; i++) {
      const d = this.decision();
      if (!d || d.kind !== "action") {
        return;
      }
      if (d.seat !== this.viewingPlayer) {
        await this.waitForLocalCursor(this.timeoutMs).catch(() => undefined);
        const again = this.decision();
        if (!again || again.seat !== this.viewingPlayer) {
          return;
        }
        continue;
      }
      if ((d.context === "chain" || d.context === "showdown") && d.passKey) {
        const r = await this.act(d.seat, { key: d.passKey, kind: "action" });
        if (!r.ok) {
          return;
        }
        continue;
      }
      return;
    }
  }

  // ---- identity -------------------------------------------------------------------

  get viewingPlayer(): Seat {
    return this.frame.viewingPlayer;
  }

  get gameId(): string {
    return this.frame.gameId;
  }

  get sandbox(): boolean {
    return this.frame.sandbox;
  }

  /** The latest cached frame (refresh() to pull a new one). */
  get currentFrame(): BrowserFrame {
    return this.frame;
  }

  // ---- frame ----------------------------------------------------------------------

  /** Pull the client's latest state into the cached frame. */
  async refresh(): Promise<BrowserFrame> {
    let read: PageRead | null;
    try {
      read = await this.page.evaluate<PageRead | null>(READ_FRAME);
    } catch (error) {
      // A renderer busy with a long task (image decode, big re-render on a loaded box) can miss one window; the read is idempotent.
      if (!(error instanceof HarnessError) || error.code !== "TIMEOUT") {
        throw error;
      }
      trace("refresh: evaluate timed out once; retrying");
      read = await this.page.evaluate<PageRead | null>(READ_FRAME);
    }
    if (!read || !read.state) {
      throw new HarnessError({ code: "NO_DECISION", detail: { url: this.page.url() }, message: "page has no __rbGameState (not connected to a game)" });
    }
    const viewingPlayer = read.viewingPlayer;
    const movesBySeat: Record<Seat, FlatMove[]> = { [viewingPlayer]: toFlatMoves(read.moves, viewingPlayer) };
    if (read.sandbox && read.state.status === "playing") {
      // Other seats' menus are only reachable server-side; the sandbox REST hook exposes them.
      for (const seat of Object.keys(read.state.players ?? {})) {
        if (seat === viewingPlayer) {
          continue;
        }
        const fetched = await this.fetchMoves(read.gameId, seat);
        if (fetched) {
          movesBySeat[seat] = fetched;
        }
      }
    }
    this.frame = {
      gameId: read.gameId,
      last: read.last,
      movesBySeat,
      readAt: Date.now(),
      sandbox: read.sandbox,
      seq: read.seq,
      snapshot: read.state,
      viewingPlayer,
    };
    registerSnapshotCards(this.registry, read.state, this.pool);
    this.facade = new SnapshotEngine(this.frame);
    return this.frame;
  }

  private async fetchMoves(gameId: string, seat: Seat): Promise<FlatMove[] | undefined> {
    try {
      const r = await fetch(`${this.baseUrl}/api/game/${gameId}/moves?player=${encodeURIComponent(seat)}`);
      if (!r.ok) {
        return undefined;
      }
      const moves = (await r.json()) as UiMove[];
      return Array.isArray(moves) ? toFlatMoves(moves, seat) : undefined;
    } catch {
      return undefined;
    }
  }

  // ---- reads ----------------------------------------------------------------------

  /** Install this game's card registry as the process-global one (engine helpers read it). */
  activate(): void {
    if (getGlobalCardRegistry() !== this.registry) {
      setGlobalCardRegistry(this.registry);
    }
  }

  /** Read-only RuleEngine stand-in over the cached frame (for L2 helpers that want `game.engine`). */
  get engine(): HarnessEngine {
    this.activate();
    return this.facade.asHarnessEngine();
  }

  seats(): readonly Seat[] {
    const setup = this.frame.snapshot.setup as { firstPlayer?: string; secondPlayer?: string } | undefined;
    const all = Object.keys(this.frame.snapshot.players ?? {});
    if (setup?.firstPlayer && all.includes(setup.firstPlayer)) {
      return [setup.firstPlayer, ...all.filter((s) => s !== setup.firstPlayer)];
    }
    return all;
  }

  seq(): number {
    return this.frame?.seq ?? -1;
  }

  ctx(): DecisionContext {
    this.activate();
    return browserDecisionContext(this.facade, this.seq(), this.autoProcedures);
  }

  decision(): Decision | null {
    this.activate();
    return this.resolver.decision();
  }

  decisionFor(seat: Seat): Decision | ActionDecision | null {
    this.activate();
    return this.resolver.decisionFor(seat);
  }

  view(viewer: Viewer): Observation {
    this.activate();
    return observe(this.facade.asHarnessEngine(), viewer, this.seq(), this.decision(), this.pool);
  }

  stateHash(): string {
    return frameHash(this.frame);
  }

  cardState(card: CardRef): CardState {
    this.activate();
    return buildCardState(this.facade.asHarnessEngine(), card, this.pool);
  }

  cardsIn(zone: string, owner?: Seat): readonly CardRef[] {
    return zoneCards(this.facade.asHarnessEngine(), zone, owner);
  }

  hasCard(card: CardRef): boolean {
    return Boolean(this.facade.internalState.cards[card]);
  }

  violations(): readonly Violation[] {
    return [];
  }

  transcript(): Transcript {
    return {
      finalHash: this.stateHash(),
      initialHash: this.initialHash,
      origin: { kind: "opaque", note: `browser:${this.baseUrl} game ${this.gameId} as ${this.viewingPlayer}` },
      players: this.seats(),
      schema: 1,
      steps: [...this.steps],
    };
  }

  async waitFor(pred: (o: Observation) => boolean, opts: WaitForOptions = {}): Promise<Observation> {
    const viewer = opts.viewer ?? "spectator";
    const deadline = Date.now() + (opts.timeoutMs ?? this.timeoutMs);
    let o = this.view(viewer);
    while (!pred(o)) {
      if (Date.now() > deadline) {
        throw new HarnessError({ code: "TIMEOUT", detail: { seq: this.seq() }, message: `waitFor: predicate still false after ${opts.timeoutMs ?? this.timeoutMs}ms` });
      }
      await sleep(80);
      await this.refresh();
      o = this.view(viewer);
    }
    return o;
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.resolver.clear();
    if (this.browser) {
      trace("close: browser");
      await this.browser.shutdown();
      trace("close: done");
    }
  }

  // ---- act --------------------------------------------------------------------------

  async act(seat: Seat, answer: Answer): Promise<ActResult> {
    await this.refresh();
    this.activate();
    const plan = this.resolver.resolve(seat, answer);
    if (plan.type === "result") {
      return plan.result;
    }
    return this.executePlan(plan);
  }

  /** Raw move escape hatch (L2 `seat.do()`); goes through the same dispatch/wait bookkeeping. */
  async raw(seat: Seat, moveId: string, params: Record<string, unknown>): Promise<ActResult> {
    await this.refresh();
    if (this.frame.snapshot.status !== "playing") {
      return { decision: null, error: { code: "GAME_OVER", message: "The game has ended" }, ok: false, seq: this.seq() };
    }
    this.resolver.clear();
    const d = this.decision();
    return this.executePlan({
      answer: { args: { params }, key: `${moveId}:raw`, kind: "action" },
      decision: { id: d?.id ?? `d${this.seq()}:${seat}:raw`, kind: "action" },
      move: { moveId, params: { playerId: seat, ...params }, playerId: seat },
      seat,
      type: "execute",
    });
  }

  private async executePlan(plan: Extract<ResolvePlan, { type: "execute" }>): Promise<ActResult> {
    const { move } = plan;
    trace("act", plan.seat, move.moveId, JSON.stringify(move.params), `mode=${this.actMode}`, `seq=${this.seq()}`);
    const outcome = await this.dispatch(move, this.actMode);
    trace("outcome", move.moveId, outcome.ok ? "ok" : `REJECTED ${outcome.error}`, `via=${outcome.via}`, `seq=${outcome.acceptedSeq}`);
    if (!outcome.ok) {
      await this.refresh().catch(() => undefined);
      const result: ActResult = {
        decision: this.decision(),
        error: {
          code: "ENGINE_REJECTED",
          detail: { errorCode: outcome.errorCode, moveId: move.moveId, params: move.params, via: outcome.via },
          message: `${move.moveId} rejected: ${outcome.error ?? outcome.errorCode ?? "unknown"}`,
        },
        ok: false,
        seq: this.seq(),
      };
      this.steps.push({
        answer: plan.answer,
        decision: plan.decision,
        error: result.error.message,
        executed: [],
        hash: this.stateHash(),
        n: this.seq(),
        ok: false,
        seat: plan.seat,
      });
      return result;
    }
    const actual = outcome.sent ?? move;
    const executed: ExecutedMove[] = [{ moveId: actual.moveId, params: actual.params, seat: actual.playerId || plan.seat }];
    executed.push(...(await this.afterAccepted(outcome)));
    const result: ActResult = { decision: this.decision(), executed, ok: true, seq: this.seq(), violations: [] };
    this.steps.push({
      answer: plan.answer,
      decision: plan.decision,
      executed,
      hash: this.stateHash(),
      n: this.seq(),
      ok: true,
      seat: plan.seat,
    });
    return result;
  }

  /**
   * After an accepted move: absorb the goldfish frame, auto-run procedures the
   * UI now offers us, and wait until the cursor is back on a local seat.
   */
  private async afterAccepted(outcome: DispatchOutcome): Promise<ExecutedMove[]> {
    const extra: ExecutedMove[] = [];
    let lastSeq = outcome.acceptedSeq;
    if (this.frame.sandbox && outcome.via !== "rest") {
      const gold = await this.waitFrameAfter(lastSeq, "sandboxAutoPlay", this.autoplayGraceMs);
      if (gold?.seq !== undefined) {
        lastSeq = gold.seq;
        extra.push({ auto: true, moveId: "sandboxAutoPlay", params: {}, seat: gold.playerId ?? this.otherSeat() });
      }
    }
    await this.refresh();
    if (this.autoProcedures) {
      for (let i = 0; i < 6; i++) {
        const proc = (this.frame.movesBySeat[this.viewingPlayer] ?? []).find((m) => PROCEDURE_MOVE_IDS.has(m.moveId));
        if (!proc || this.frame.snapshot.status !== "playing") {
          break;
        }
        const r = await this.dispatch(proc, "semantic");
        if (!r.ok) {
          break;
        }
        extra.push({ auto: true, moveId: proc.moveId, params: proc.params, seat: proc.playerId });
        if (this.frame.sandbox && r.via !== "rest") {
          const gold = await this.waitFrameAfter(r.acceptedSeq, "sandboxAutoPlay", this.autoplayGraceMs);
          if (gold) {
            extra.push({ auto: true, moveId: "sandboxAutoPlay", params: {}, seat: gold.playerId ?? this.otherSeat() });
          }
        }
        await this.refresh();
      }
    }
    await this.waitForLocalCursor(this.timeoutMs).catch(() => undefined);
    trace("settled", `seq=${this.seq()}`, `extra=${extra.map((e) => e.moveId).join("+")}`);
    return extra;
  }

  private otherSeat(): Seat {
    return this.seats().find((s) => s !== this.viewingPlayer) ?? this.viewingPlayer;
  }

  /** Poll until nobody / a local seat holds the cursor, or the game ended. */
  async waitForLocalCursor(timeoutMs: number): Promise<void> {
    // In sandbox every seat is drivable (REST hot-seat), so a remote cursor is still actionable:
    // only give the goldfish autoplay a grace period instead of the full timeout.
    const limit = this.frame.sandbox ? Math.min(timeoutMs, this.autoplayGraceMs) : timeoutMs;
    const deadline = Date.now() + limit;
    for (;;) {
      const state = toGameState(this.frame.snapshot);
      const acting = state.status === "playing" ? getActingSeat(state) : undefined;
      if (!acting || acting === this.viewingPlayer || Date.now() > deadline) {
        return;
      }
      await sleep(80);
      await this.refresh();
    }
  }

  private async waitFrameAfter(seq: number, moveId: string | undefined, timeoutMs: number): Promise<FrameMeta | undefined> {
    try {
      await this.page.waitForFunction(call(FRAME_AFTER_FN, { moveId, seq }), undefined, { polling: 30, timeout: timeoutMs });
      return (await this.page.evaluate<FrameMeta | false>(call(FRAME_AFTER_FN, { moveId, seq }))) || undefined;
    } catch {
      return undefined;
    }
  }

  /** Send one move and wait for its acceptance / rejection. */
  private async dispatch(move: FlatMove, mode: BrowserActMode): Promise<DispatchOutcome> {
    const before = this.frame.seq;
    const actor = move.playerId || this.viewingPlayer;
    let requestId: string | undefined;
    let via: DispatchOutcome["via"] = "ws";
    let sent: FlatMove | undefined;

    if (mode === "visual" && actor === this.viewingPlayer) {
      const vis: VisualOutcome = await performVisual(this.page, move);
      const record: VisualRecord = {
        dispatched: vis.dispatched,
        gesture: vis.gesture,
        mismatch:
          vis.sent && (vis.sent.moveId !== move.moveId || canonicalJson(vis.sent.params) !== canonicalJson(move.params))
            ? { sent: vis.sent, wanted: move }
            : undefined,
        moveId: move.moveId,
        seq: before,
        visualFallback: vis.dispatched ? undefined : (vis.note ?? "no gesture"),
      };
      this.visualLog.push(record);
      if (vis.dispatched && vis.requestId) {
        requestId = vis.requestId;
        via = "visual";
        sent = record.mismatch ? { moveId: record.mismatch.sent.moveId, params: record.mismatch.sent.params, playerId: actor } : undefined;
      }
    }

    if (!requestId) {
      const read = await this.page.evaluate<PageRead | null>(READ_FRAME);
      if (actor === this.viewingPlayer && read?.wsOpen) {
        const r = await this.page.evaluate<{ requestId: string | null }>(call(DISPATCH_FN, move.moveId, move.params, actor));
        requestId = r.requestId ?? undefined;
        via = "ws";
        if (!requestId) {
          // executeMove took the client's REST branch (should not happen for the viewing seat) — treat as seq wait.
          via = "rest";
        }
      } else {
        via = "rest";
        const rest = await this.restMove(move, actor);
        if (!rest.ok) {
          return { acceptedSeq: before, error: rest.error, errorCode: rest.errorCode, ok: false, via };
        }
      }
    }

    try {
      await this.page.waitForFunction(call(OUTCOME_FN, { beforeSeq: before, requestId: requestId ?? null }), undefined, {
        polling: 30,
        timeout: this.timeoutMs,
      });
    } catch {
      return { acceptedSeq: before, error: `no response for ${move.moveId} within ${this.timeoutMs}ms`, errorCode: "TIMEOUT", ok: false, sent, via };
    }
    const f = (await this.page.evaluate<FrameMeta | false>(call(OUTCOME_FN, { beforeSeq: before, requestId: requestId ?? null }))) || undefined;
    if (f && (f.type === "move_rejected" || f.type === "error")) {
      return { acceptedSeq: before, error: f.error, errorCode: f.errorCode, frame: f, ok: false, sent, via };
    }
    return { acceptedSeq: typeof f?.seq === "number" ? f.seq : before + 1, frame: f, ok: true, sent, via };
  }

  private async restMove(move: FlatMove, actor: Seat): Promise<{ ok: boolean; error?: string; errorCode?: string }> {
    try {
      const r = await fetch(`${this.baseUrl}/api/game/${this.gameId}/move`, {
        body: JSON.stringify({ moveId: move.moveId, params: move.params, playerId: actor }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const body = (await r.json().catch(() => ({}))) as { success?: boolean; error?: string; errorCode?: string };
      if (!r.ok || body.success === false) {
        return { error: body.error ?? `HTTP ${r.status}`, errorCode: body.errorCode, ok: false };
      }
      return { ok: true };
    } catch (error) {
      return { error: String((error as Error).message ?? error), errorCode: "NETWORK", ok: false };
    }
  }

  // ---- live-server setup helpers ----------------------------------------------------

  /**
   * POST /api/game/:id/tutor — move (or spawn) `defId` into `seat`'s hand and
   * grant energy = cost+4 plus the card's power pips. Sandbox only.
   */
  async tutor(defId: string, seat: Seat = this.viewingPlayer): Promise<{ cardId: CardRef }> {
    const before = this.frame.seq;
    const r = await fetch(`${this.baseUrl}/api/game/${this.gameId}/tutor`, {
      body: JSON.stringify({ defId, playerId: seat }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const body = (await r.json().catch(() => ({}))) as { ok?: boolean; cardId?: string; error?: string };
    if (!r.ok || !body.cardId) {
      throw new HarnessError({ code: "ENGINE_REJECTED", detail: { defId, status: r.status }, message: `tutor(${defId}): ${body.error ?? `HTTP ${r.status}`}` });
    }
    await this.page.waitForFunction(call(OUTCOME_FN, { beforeSeq: before, requestId: null }), undefined, { polling: 30, timeout: this.timeoutMs }).catch(() => undefined);
    await this.refresh();
    return { cardId: body.cardId };
  }

  /** Sandbox `addResources` for `seat` (REST move; no goldfish autoplay). */
  async addResources(seat: Seat, r: { energy?: number; power?: Readonly<Record<string, number>> }): Promise<void> {
    const before = this.frame.seq;
    const res = await this.restMove({ moveId: "addResources", params: { energy: r.energy ?? 0, playerId: seat, power: r.power ?? {} }, playerId: seat }, seat);
    if (!res.ok) {
      throw new HarnessError({ code: "ENGINE_REJECTED", detail: { ...r }, message: `addResources: ${res.error ?? "rejected"}` });
    }
    await this.page.waitForFunction(call(OUTCOME_FN, { beforeSeq: before, requestId: null }), undefined, { polling: 30, timeout: this.timeoutMs }).catch(() => undefined);
    await this.refresh();
  }

  async screenshot(path: string): Promise<void> {
    await this.page.screenshot({ fullPage: false, path });
  }
}
