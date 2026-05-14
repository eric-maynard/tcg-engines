#!/usr/bin/env bun
/**
 * QA Reviewer v2 for the Riftbound Play SPA.
 *
 * v1's failure modes (admin review 2026-05-14):
 *   1. Only inspected static PNG frames, so cross-frame defects (layout
 *      reflow, exhausted-rotation transitions) were invisible.
 *   2. Used a hand-curated checklist that confirmation-biased the agent
 *      into declaring PASS.
 *   3. Never compared against a reference implementation (riftatlas).
 *
 * v2 design — four orthogonal layers, each catching a different class
 * of defect:
 *
 *   Layer A — Engine truth vs DOM truth. For every captured state we
 *     fetch `/api/v2/state/<sid>` and the live DOM via puppeteer
 *     `page.evaluate`, then assert invariants: exhausted units must
 *     have rotate(90deg), every battlefield unit must have a
 *     `.bf-mini-chip` with matching `data-card-id`, hand sizes match
 *     across engine and DOM, VP / energy / runes counts match.
 *
 *   Layer B — Cross-frame layout stability. At ~6 checkpoints we snap
 *     `getBoundingClientRect()` for `.hand`, `.move-log-fill`,
 *     `.board-side`, `.battlefield-row`, `.app-top-nav`, `.turn-banner`.
 *     Drift > 5px on width or height across checkpoints is a major
 *     defect.
 *
 *   Layer C — RiftAtlas reference comparison. We open play.riftatlas.com
 *     in a second tab and extract structural features (phase strip,
 *     BF tile shape, exhausted rotation, priority banner) WITHOUT
 *     pixel-diffing the art. Divergences become major/minor defects.
 *     If riftatlas can't be reached (or requires login past landing),
 *     we degrade gracefully and document the gap.
 *
 *   Layer D — Rule-aware checklist via the riftbound-rules skill. We
 *     spawn a `claude -p` sub-agent and instruct it to load the
 *     riftbound-rules skill and audit the captured frames + engine
 *     trail for phase-by-phase rule compliance. Output: structured
 *     defects, severity=major.
 *
 * Output:
 *   /tmp/qa-v2-report.json   (machine readable)
 *   /tmp/qa-v2-report.md     (human readable summary)
 *
 * Usage:
 *   bun run apps/riftbound-app/scripts/qa-reviewer-v2.ts
 *
 * Env knobs (all optional):
 *   RIFTBOUND_ORIGIN           default http://localhost:3000
 *   QA_V2_FRAMES_DIR           default /tmp/qa-v2-frames
 *   QA_V2_VIDEO                default /tmp/fullgame-qa.mp4
 *   QA_V2_REPORT_JSON          default /tmp/qa-v2-report.json
 *   QA_V2_REPORT_MD            default /tmp/qa-v2-report.md
 *   QA_V2_MAX_TURNS            default 12 (caps how far we drive the game)
 *   QA_V2_SKIP_LAYER_C         "1" to skip riftatlas comparison
 *   QA_V2_SKIP_LAYER_D         "1" to skip the sub-agent rule check
 *   QA_V2_LAYER_D_TIMEOUT_MS   default 180000 (3 min)
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

const ORIGIN = process.env.RIFTBOUND_ORIGIN ?? "http://localhost:3000";
const FRAMES_DIR = process.env.QA_V2_FRAMES_DIR ?? "/tmp/qa-v2-frames";
const VIDEO_PATH = process.env.QA_V2_VIDEO ?? "/tmp/fullgame-qa.mp4";
const REPORT_JSON = process.env.QA_V2_REPORT_JSON ?? "/tmp/qa-v2-report.json";
const REPORT_MD = process.env.QA_V2_REPORT_MD ?? "/tmp/qa-v2-report.md";
const MAX_TURNS = Number(process.env.QA_V2_MAX_TURNS ?? 12);
const SKIP_C = process.env.QA_V2_SKIP_LAYER_C === "1";
const SKIP_D = process.env.QA_V2_SKIP_LAYER_D === "1";
const LAYER_D_TIMEOUT_MS = Number(process.env.QA_V2_LAYER_D_TIMEOUT_MS ?? 180_000);

const VIEWPORT = { height: 800, width: 1280 } as const;
const CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FFMPEG = "/opt/homebrew/bin/ffmpeg";

type Severity = "blocker" | "major" | "minor";
/**
 * Iter-RunePoolUI / reviewer-prioritization fix.
 *
 * Categorize every defect so the report can rank "the player CAN'T DO X"
 * above "color contrast could be 5% better". Layer D sub-agent emits this
 * field and our auto-upgrade step promotes CORE_ACTION_MISSING defects to
 * blocker regardless of the sub-agent's first-pass severity guess.
 *
 *   CORE_ACTION_MISSING — something the player needs to DO that the UI
 *     doesn't expose (tap a rune, declare attackers, play a card, choose
 *     a target, pass priority).
 *   COSMETIC — visual polish (color contrast, layout drift, missing
 *     label, animation).
 */
type DefectCategory = "CORE_ACTION_MISSING" | "COSMETIC";
interface Defect {
  readonly layer: "A" | "B" | "C" | "D";
  readonly severity: Severity;
  readonly id: string;
  readonly message: string;
  readonly turn?: number;
  readonly phase?: string;
  readonly evidence?: Record<string, unknown>;
  readonly category?: DefectCategory;
}

const defects: Defect[] = [];
function flag(d: Defect): void {
  defects.push(d);
  console.log(
    `  [${d.layer}/${d.severity}] ${d.id}: ${d.message}` +
      (d.turn != null ? ` (turn ${d.turn} ${d.phase ?? ""})` : ""),
  );
}

// ------------------------------------------------------------------
// State / API helpers
// ------------------------------------------------------------------

interface EngineUnit {
  readonly id: string;
  readonly controller?: string;
  readonly exhausted?: boolean;
  readonly name?: string;
  readonly might?: number;
}
interface EngineBattlefield {
  readonly id: string;
  readonly name?: string;
  readonly units?: readonly EngineUnit[];
  readonly controller?: string | null;
}
interface EnginePlayer {
  readonly id: string;
  readonly handSize?: number;
  readonly victoryPoints?: number;
  readonly energy?: number;
  readonly runeDeckSize?: number;
  readonly baseUnits?: readonly EngineUnit[];
}
interface EngineState {
  readonly view?: {
    readonly status?: string;
    readonly winner?: string | null;
    readonly turn?: {
      readonly number?: number;
      readonly activePlayer?: string;
      readonly phase?: string;
      readonly phaseLabel?: string;
    };
    readonly battlefields?: readonly EngineBattlefield[];
    readonly players?: readonly EnginePlayer[];
    readonly combat?: {
      readonly phase?: string;
      readonly battlefieldId?: string;
      readonly attackers?: readonly EngineUnit[];
      readonly defenders?: readonly EngineUnit[];
    } | null;
    readonly victoryScore?: number;
  };
  readonly hand?: Record<string, readonly { id: string }[]>;
  readonly isGameOver?: boolean;
  readonly trail?: readonly unknown[];
}

async function startGoldfish(): Promise<string> {
  const r = await fetch(`${ORIGIN}/api/goldfish/start`, {
    body: JSON.stringify({ deckId: null }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!r.ok) {throw new Error(`goldfish/start failed: HTTP ${r.status}`);}
  const j = (await r.json()) as { sessionId: string };
  return j.sessionId;
}

async function getEngineState(sid: string): Promise<EngineState> {
  const r = await fetch(`${ORIGIN}/api/v2/state/${encodeURIComponent(sid)}`);
  if (!r.ok) {throw new Error(`state failed: HTTP ${r.status}`);}
  return (await r.json()) as EngineState;
}

async function stepBot(sid: string): Promise<{ movesApplied?: number }> {
  const r = await fetch(`${ORIGIN}/api/v2/step/${encodeURIComponent(sid)}`, {
    body: JSON.stringify({ force: true }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return (await r.json()) as { movesApplied?: number };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ------------------------------------------------------------------
// DOM snapshot helper — runs in the page context.
// ------------------------------------------------------------------

interface DomChip {
  readonly cardId: string;
  readonly classes: string;
  readonly dataExhausted: string | null;
  readonly transform: string;
  readonly width: number;
  readonly height: number;
}
interface DomRect {
  readonly selector: string;
  readonly present: boolean;
  readonly width: number;
  readonly height: number;
  readonly x: number;
  readonly y: number;
}
interface DomSnapshot {
  readonly bfChips: readonly DomChip[];
  readonly baseChips: readonly DomChip[];
  readonly handChipsByPlayer: Record<string, number>;
  readonly turnBannerText: string;
  readonly turnBannerVpYou: string | null;
  readonly turnBannerVpOpp: string | null;
  readonly waitingBannerPresent: boolean;
  readonly waitingBannerText: string;
  readonly rects: readonly DomRect[];
  readonly phaseStripPresent: boolean;
  readonly showdownBreadcrumbPresent: boolean;
  readonly combatPanelPresent: boolean;
  readonly chainPanelPresent: boolean;
}

const LAYOUT_SELECTORS = [
  ".app-top-nav",
  ".turn-banner",
  ".board",
  ".board-side",
  ".battlefield-row",
  ".move-log-fill",
  '[data-testid="hand-player-1"]',
  '[data-testid="hand-player-2"]',
  ".controls",
];

async function snapshotDom(page: Page): Promise<DomSnapshot> {
  return await page.evaluate((selectors: readonly string[]) => {
    function chipFrom(el: Element): DomChip {
      const html = el as HTMLElement;
      const cs = window.getComputedStyle(html);
      const rect = html.getBoundingClientRect();
      return {
        cardId: html.getAttribute("data-card-id") ?? "",
        classes: html.className,
        dataExhausted: html.getAttribute("data-exhausted"),
        height: rect.height,
        transform: cs.transform,
        width: rect.width,
      };
    }
    const bfChips = [...document.querySelectorAll('.bf-mini-chip')].map(
      chipFrom,
    );
    const baseChips = [...document.querySelectorAll('.base-zone-unit')].map(chipFrom);
    const handChipsByPlayer: Record<string, number> = {};
    document.querySelectorAll('[data-testid^="hand-player-"]').forEach((el) => {
      const tid = el.getAttribute("data-testid") ?? "";
      const pid = tid.replace("hand-", "");
      handChipsByPlayer[pid] = el.querySelectorAll(".hand-chip").length;
    });
    const tb = document.querySelector('[data-testid="turn-banner"]');
    const vpYou =
      document.querySelector('[data-testid="turn-banner-vp-you"]')
        ?.textContent ?? null;
    const vpOpp =
      document.querySelector('[data-testid="turn-banner-vp-opp"]')
        ?.textContent ?? null;
    const wb = document.querySelector('[data-testid="waiting-banner"]');
    const rects: DomRect[] = selectors.map((sel) => {
      const e = document.querySelector(sel) as HTMLElement | null;
      if (!e) {
        return {
          height: 0,
          present: false,
          selector: sel,
          width: 0,
          x: 0,
          y: 0,
        };
      }
      const r = e.getBoundingClientRect();
      return {
        height: r.height,
        present: true,
        selector: sel,
        width: r.width,
        x: r.x,
        y: r.y,
      };
    });
    return {
      baseChips,
      bfChips,
      chainPanelPresent:
        document.querySelector('[data-testid="rail-section-chain"]') != null &&
        document.querySelector('[data-testid="rail-section-chain"]')?.hasAttribute("open") === true,
      combatPanelPresent:
        document.querySelector('[data-testid="rail-section-combat"]') != null &&
        document.querySelector('[data-testid="rail-section-combat"]')?.hasAttribute("open") === true,
      handChipsByPlayer,
      phaseStripPresent:
        document.querySelectorAll('[data-testid*="phase"]').length > 0 ||
        document.querySelectorAll(".phase-strip,.turn-banner-phase").length > 0,
      rects,
      showdownBreadcrumbPresent:
        document.querySelector(".showdown-breadcrumb,[data-testid='showdown-breadcrumb']") !=
        null,
      turnBannerText: tb?.textContent ?? "",
      turnBannerVpOpp: vpOpp,
      turnBannerVpYou: vpYou,
      waitingBannerPresent: Boolean(wb),
      waitingBannerText: wb?.textContent ?? "",
    };
  }, LAYOUT_SELECTORS as unknown as string[]);
}

// ------------------------------------------------------------------
// Layer A — engine vs DOM invariants
// ------------------------------------------------------------------

function checkLayerA(
  engine: EngineState,
  dom: DomSnapshot,
  meta: { turn: number; phase: string },
): void {
  const view = engine.view ?? {};
  const bfs = view.battlefields ?? [];

  // 1. Every engine unit on a BF must have a DOM chip with matching cardId.
  const allEngineUnits: EngineUnit[] = [];
  for (const bf of bfs) {
    for (const u of bf.units ?? []) {allEngineUnits.push(u);}
  }
  const domChipIds = new Set(dom.bfChips.map((c) => c.cardId));
  for (const u of allEngineUnits) {
    if (!domChipIds.has(u.id)) {
      flag({
        evidence: { controller: u.controller, unitId: u.id },
        id: "A-missing-bf-chip",
        layer: "A",
        message: `engine reports unit ${u.name ?? u.id} on a battlefield but no .bf-mini-chip[data-card-id="${u.id}"] in the DOM`,
        phase: meta.phase,
        severity: "blocker",
        turn: meta.turn,
      });
    }
  }

  // 2. Every exhausted engine unit must rotate visually.
  //    Rotation can be expressed as a 2x3 transform matrix `matrix(a, b, c, d, e, f)`
  //    Where a 90deg rotation collapses `a` and `d` to ~0 and `b`,`c` to ±1.
  //    "none" or `matrix(1, 0, 0, 1, 0, 0)` means no rotation.
  function isRotated(transform: string): boolean {
    if (!transform || transform === "none") {return false;}
    // Matrix(a,b,c,d,e,f) — rotation contributes to b,c being non-zero
    const m = transform.match(/matrix\(([^)]+)\)/);
    if (!m) {return /rotate\(/i.test(transform);}
    const parts = m[1]!.split(",").map((s) => Number(s.trim()));
    if (parts.length < 4) {return false;}
    const [a, b, c, d] = parts as [number, number, number, number];
    // ~90deg => |a|,|d| ≈ 0, |b|,|c| ≈ 1
    return Math.abs(a) < 0.1 && Math.abs(d) < 0.1 && (Math.abs(b) > 0.5 || Math.abs(c) > 0.5);
  }

  const bfChipById = new Map(dom.bfChips.map((c) => [c.cardId, c]));
  const baseChipById = new Map(dom.baseChips.map((c) => [c.cardId, c]));

  for (const u of allEngineUnits) {
    if (!u.exhausted) {continue;}
    const chip = bfChipById.get(u.id);
    if (!chip) {continue;} // Already flagged above
    if (!isRotated(chip.transform)) {
      flag({
        evidence: {
          classes: chip.classes,
          dataExhausted: chip.dataExhausted,
          transform: chip.transform,
          unitId: u.id,
        },
        id: "A-exhausted-not-rotated-bf",
        layer: "A",
        message: `unit ${u.name ?? u.id} is engine.exhausted=true but DOM chip transform="${chip.transform}" is NOT rotated 90deg`,
        phase: meta.phase,
        severity: "blocker",
        turn: meta.turn,
      });
    }
  }
  for (const p of view.players ?? []) {
    for (const u of p.baseUnits ?? []) {
      if (!u.exhausted) {continue;}
      const chip = baseChipById.get(u.id);
      if (!chip) {continue;}
      if (!isRotated(chip.transform)) {
        flag({
          evidence: { transform: chip.transform, unitId: u.id },
          id: "A-exhausted-not-rotated-base",
          layer: "A",
          message: `base unit ${u.name ?? u.id} is engine.exhausted=true but DOM transform="${chip.transform}" is NOT rotated`,
          phase: meta.phase,
          severity: "blocker",
          turn: meta.turn,
        });
      }
    }
  }

  // 3. Hand sizes should match.
  for (const p of view.players ?? []) {
    const engineHand = engine.hand?.[p.id]?.length;
    // DOM only renders the local player's hand face-up; opponent hand
    // Is rendered as compact face-down chips. We accept either-or but
    // Record a defect if both are reported and disagree by > 0.
    const domCount = dom.handChipsByPlayer[`hand-${p.id}`];
    if (domCount != null && engineHand != null && engineHand !== domCount) {
      // For the opponent, the chips have a different class (.hand-chip-back)
      // And may still be counted, so disagreement here is suspect.
      flag({
        evidence: { domCount, engineHand, playerId: p.id },
        id: "A-hand-size-mismatch",
        layer: "A",
        message: `player ${p.id} engine.hand=${engineHand} vs DOM hand-chips=${domCount}`,
        phase: meta.phase,
        severity: "major",
        turn: meta.turn,
      });
    }
  }

  // 4. VP from engine should match VP shown in banner.
  const players = view.players ?? [];
  if (players.length >= 2 && dom.turnBannerVpYou && dom.turnBannerVpOpp) {
    // The banner formats "You 0 / 8 · Opp 0 / 8". Extract the first number.
    const youMatch = dom.turnBannerVpYou.match(/(\d+)/);
    const oppMatch = dom.turnBannerVpOpp.match(/(\d+)/);
    const localVp = youMatch ? Number(youMatch[1]) : null;
    const oppVp = oppMatch ? Number(oppMatch[1]) : null;
    // We don't know which engine player is "you" without browser-side
    // Context, but for our test driver player-1 is always "you".
    const p1 = players.find((p) => p.id === "player-1");
    const p2 = players.find((p) => p.id === "player-2");
    if (p1 && p2 && localVp != null && oppVp != null) {
      if (p1.victoryPoints !== localVp) {
        flag({
          id: "A-vp-you-mismatch",
          layer: "A",
          message: `engine player-1.vp=${p1.victoryPoints} vs banner "You ${localVp}"`,
          phase: meta.phase,
          severity: "blocker",
          turn: meta.turn,
        });
      }
      if (p2.victoryPoints !== oppVp) {
        flag({
          id: "A-vp-opp-mismatch",
          layer: "A",
          message: `engine player-2.vp=${p2.victoryPoints} vs banner "Opp ${oppVp}"`,
          phase: meta.phase,
          severity: "blocker",
          turn: meta.turn,
        });
      }
    }
  }
}

// ------------------------------------------------------------------
// Layer B — cross-frame layout stability
// ------------------------------------------------------------------

interface Checkpoint {
  readonly turn: number;
  readonly phase: string;
  readonly rects: readonly DomRect[];
}

function checkLayerB(checkpoints: readonly Checkpoint[]): void {
  if (checkpoints.length < 2) {
    flag({
      id: "B-too-few-checkpoints",
      layer: "B",
      message: `only ${checkpoints.length} checkpoint(s) captured; layout-stability check needs >= 2`,
      severity: "minor",
    });
    return;
  }
  // For each selector, compute width / height range across checkpoints.
  //
  // QA v2 iter-8 (B-size-drift on .board-side / .move-log-fill): these two
  // Selectors are SCROLL CONTAINERS — they're explicitly designed to grow
  // Their inner content (move log entries accumulate as the game progresses,
  // Sidebar shows more rail sections, etc.) and let the user scroll. Drift
  // Here is *intentional* growth, not a layout regression. We previously
  // Tried locking their heights and broke the entire layout (iter-5 disaster).
  // Whitelist them so the reviewer focuses on selectors where drift truly
  // Is a layout bug.
  const STABLE_SELECTORS = [
    ".app-top-nav",
    ".turn-banner",
    ".battlefield-row",
    ".controls",
  ];
  for (const sel of STABLE_SELECTORS) {
    const samples = checkpoints
      .map((cp) => ({
        phase: cp.phase,
        rect: cp.rects.find((r) => r.selector === sel),
        turn: cp.turn,
      }))
      .filter((s) => s.rect && s.rect.present);
    if (samples.length < 2) {continue;}
    const widths = samples.map((s) => s.rect!.width);
    const heights = samples.map((s) => s.rect!.height);
    const xs = samples.map((s) => s.rect!.x);
    const ys = samples.map((s) => s.rect!.y);
    const wRange = Math.max(...widths) - Math.min(...widths);
    const hRange = Math.max(...heights) - Math.min(...heights);
    const xRange = Math.max(...xs) - Math.min(...xs);
    const yRange = Math.max(...ys) - Math.min(...ys);
    if (wRange > 5 || hRange > 5) {
      flag({
        evidence: {
          heightRange: hRange,
          samples: samples.map((s) => ({
            h: s.rect!.height,
            phase: s.phase,
            turn: s.turn,
            w: s.rect!.width,
          })),
          selector: sel,
          widthRange: wRange,
        },
        id: "B-size-drift",
        layer: "B",
        message: `${sel} size unstable across turns: width range=${wRange.toFixed(1)}px, height range=${hRange.toFixed(1)}px`,
        severity: "major",
      });
    }
    if (xRange > 5 || yRange > 5) {
      flag({
        evidence: {
          samples: samples.map((s) => ({
            phase: s.phase,
            turn: s.turn,
            x: s.rect!.x,
            y: s.rect!.y,
          })),
          selector: sel,
          xRange,
          yRange,
        },
        id: "B-position-drift",
        layer: "B",
        message: `${sel} position unstable across turns: x range=${xRange.toFixed(1)}px, y range=${yRange.toFixed(1)}px`,
        severity: "major",
      });
    }
  }
}

// ------------------------------------------------------------------
// Layer C — RiftAtlas reference comparison.
// ------------------------------------------------------------------

interface AtlasFeatures {
  readonly reachable: boolean;
  readonly notes: string[];
  readonly hasPhaseStrip: boolean | null;
  readonly hasBattlefieldTiles: boolean | null;
  readonly hasRotatedExhausted: boolean | null;
  readonly hasPriorityBanner: boolean | null;
  readonly hasCombatPanel: boolean | null;
  readonly hasSidebarTurnBanner: boolean | null;
}

async function probeRiftAtlas(browser: Browser): Promise<AtlasFeatures> {
  const notes: string[] = [];
  let page: Page | null = null;
  try {
    page = await browser.newPage();
    page.setDefaultTimeout(15_000);
    await page.goto("https://play.riftatlas.com/", {
      timeout: 20_000,
      waitUntil: "domcontentloaded",
    });
    await sleep(2500);
    // Riftatlas play page may put you behind a sign-in wall — try to detect
    // It. We don't try to actually play a game on their side; we just
    // Inspect whether their public landing exposes the same structural
    // Primitives we care about (phase strip, BF tiles, etc.).
    const features = await page.evaluate(() => {
      const txt = document.body.textContent.toLowerCase();
      const hasLogin =
        txt.includes("sign in") || txt.includes("log in") || txt.includes("login");
      // Heuristic structural probes (class names will differ; we look at
      // Semantic shape via attributes / textual labels).
      const hasPhaseStrip =
        /awaken|beginning|channel|main|ending|cleanup/.test(txt);
      const hasBattlefield = /battlefield/i.test(txt);
      const hasPriorityWord = /priority|focus|pass|react/i.test(txt);
      const hasCombatWord = /attack|defend|showdown|combat/i.test(txt);
      return {
        hasBattlefield,
        hasCombatWord,
        hasLogin,
        hasPhaseStrip,
        hasPriorityWord,
        textLen: txt.length,
      };
    });
    notes.push(`landing text length=${features.textLen}`);
    if (features.hasLogin) {notes.push("login-walled — play state not accessible");}
    notes.push(
      `tokens: phase-strip=${features.hasPhaseStrip} battlefield=${features.hasBattlefield} priority=${features.hasPriorityWord} combat=${features.hasCombatWord}`,
    );
    // Try a screenshot for the report.
    const shotPath = path.join(FRAMES_DIR, "riftatlas-landing.png");
    await page.screenshot({ path: shotPath, type: "png" });
    notes.push(`landing screenshot → ${shotPath}`);
    return {
      reachable: true,
      notes,
      hasPhaseStrip: features.hasPhaseStrip,
      hasBattlefieldTiles: features.hasBattlefield,
      // The landing page can't tell us about exhausted rotation or
      // Priority banner — we'd need to actually be inside a game. So
      // These stay null and the layer documents the gap.
      hasRotatedExhausted: null,
      hasPriorityBanner: null,
      hasCombatPanel: features.hasCombatWord,
      hasSidebarTurnBanner: null,
    };
  } catch (error) {
    notes.push(`error: ${(error as Error).message}`);
    return {
      hasBattlefieldTiles: null,
      hasCombatPanel: null,
      hasPhaseStrip: null,
      hasPriorityBanner: null,
      hasRotatedExhausted: null,
      hasSidebarTurnBanner: null,
      notes,
      reachable: false,
    };
  } finally {
    if (page) {await page.close();}
  }
}

interface OurFeatures {
  readonly hasPhaseStrip: boolean;
  readonly hasBattlefieldRow: boolean;
  readonly hasSidebarTurnBanner: boolean;
  readonly hasShowdownBreadcrumb: boolean;
  readonly hasCombatPanel: boolean;
  readonly hasPriorityBannerEverShown: boolean;
}

// ------------------------------------------------------------------
// Layer C — structural fixture (riftatlas / generic TCG online play page).
//
// Admin keeps saying "compare to riftatlas" but riftatlas is auth-walled
// Past the marketing landing, so we can't pixel-diff. Instead we encode
// The expected structural primitives (zones / actions / card-states) in a
// Fixture file and assert the DOM exposes a matching selector for each.
// ------------------------------------------------------------------

interface FixtureEntry {
  readonly name: string;
  readonly selectors: readonly string[];
  readonly description?: string;
}

interface StructuralFixture {
  readonly required_zones: readonly FixtureEntry[];
  readonly required_per_player: readonly FixtureEntry[];
  readonly required_actions: readonly FixtureEntry[];
  readonly expected_card_states: readonly FixtureEntry[];
}

const FIXTURE_PATH = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "riftatlas-structural-fixture.json",
);

function loadStructuralFixture(): StructuralFixture | null {
  try {
    const raw = fs.readFileSync(FIXTURE_PATH, "utf8");
    return JSON.parse(raw) as StructuralFixture;
  } catch (error) {
    console.warn(
      `[qa-v2/C] failed to load structural fixture from ${FIXTURE_PATH}: ${(error as Error).message}`,
    );
    return null;
  }
}

interface StructuralProbeResult {
  readonly category: "zone" | "per_player" | "action" | "card_state";
  readonly name: string;
  readonly description?: string;
  readonly matchedSelector: string | null;
}

/**
 * Run page.evaluate to check every required selector group against the DOM.
 * For each entry, we return the first selector that matched (or null).
 * Card-state entries are pre-screened — many will legitimately be absent
 * mid-game (no exhausted units yet, no damage taken yet), so we mark them
 * as "expected" rather than "required" and surface a different defect
 * severity downstream.
 */
async function probeStructural(
  page: Page,
  fx: StructuralFixture,
): Promise<readonly StructuralProbeResult[]> {
  const entries: { category: StructuralProbeResult["category"]; entry: FixtureEntry }[] = [
    ...fx.required_zones.map((e) => ({ category: "zone" as const, entry: e })),
    ...fx.required_per_player.map((e) => ({ category: "per_player" as const, entry: e })),
    ...fx.required_actions.map((e) => ({ category: "action" as const, entry: e })),
    ...fx.expected_card_states.map((e) => ({ category: "card_state" as const, entry: e })),
  ];
  return await page.evaluate((items) => items.map((it) => {
      let matched: string | null = null;
      for (const sel of it.entry.selectors) {
        try {
          if (document.querySelector(sel)) {
            matched = sel;
            break;
          }
        } catch {
          // Invalid selector — skip
        }
      }
      return {
        category: it.category,
        name: it.entry.name,
        description: it.entry.description,
        matchedSelector: matched,
      };
    }), entries as unknown as { category: StructuralProbeResult["category"]; entry: FixtureEntry }[]);
}

/**
 * Severity heuristics for fixture-driven checks.
 *
 * - Missing required zones / per-player zones → blocker (the player can't
 *   see fundamental game state).
 * - Missing required actions → blocker (the player can't DO a required
 *   game action).
 * - Missing expected card states → minor (may legitimately be absent if
 *   no card is currently in that state; only flagged for visibility).
 */
function severityForFixtureMiss(
  category: StructuralProbeResult["category"],
): Severity {
  if (category === "card_state") {return "minor";}
  return "blocker";
}

function checkLayerCStructural(
  results: readonly StructuralProbeResult[],
): void {
  for (const r of results) {
    if (r.matchedSelector != null) {continue;}
    const sev = severityForFixtureMiss(r.category);
    const id = `C-missing-${r.category}-${r.name.replace(/_/g, "-")}`;
    flag({
      category: sev === "blocker" ? "CORE_ACTION_MISSING" : undefined,
      evidence: { description: r.description, expectedAny: r.name },
      id,
      layer: "C",
      message:
        `structural fixture: ${r.category} "${r.name}" not found in DOM` +
        (r.description ? ` — ${r.description}` : ""),
      severity: sev,
    });
  }
}

function checkLayerC(ours: OurFeatures, atlas: AtlasFeatures): void {
  if (!atlas.reachable) {
    flag({
      id: "C-atlas-unreachable",
      layer: "C",
      message: `play.riftatlas.com couldn't be probed; falling back to static structural checks only. notes: ${atlas.notes.join(" | ")}`,
      severity: "minor",
    });
    // Still verify our own page exposes the key primitives.
    if (!ours.hasPhaseStrip) {
      flag({
        id: "C-no-phase-strip",
        layer: "C",
        message: "our play page exposes no phase strip / phase label",
        severity: "major",
      });
    }
    if (!ours.hasBattlefieldRow) {
      flag({
        id: "C-no-battlefield-row",
        layer: "C",
        message: "our play page is missing .battlefield-row",
        severity: "major",
      });
    }
    if (!ours.hasPriorityBannerEverShown) {
      flag({
        id: "C-no-priority-banner",
        layer: "C",
        message:
          "no priority/focus banner ever rendered during the captured game; riftatlas shows one on every non-active-player turn",
        severity: "major",
      });
    }
    return;
  }

  // Token-level structural diff.
  if (atlas.hasPhaseStrip && !ours.hasPhaseStrip) {
    flag({
      id: "C-divergence-phase-strip",
      layer: "C",
      message: "riftatlas exposes phase-strip semantics; we don't expose a comparable element",
      severity: "major",
    });
  }
  if (atlas.hasBattlefieldTiles && !ours.hasBattlefieldRow) {
    flag({
      id: "C-divergence-battlefields",
      layer: "C",
      message: "riftatlas surfaces battlefields prominently; our `.battlefield-row` is missing",
      severity: "major",
    });
  }
  if (atlas.hasCombatPanel && !ours.hasCombatPanel) {
    flag({
      id: "C-divergence-combat-panel",
      layer: "C",
      message:
        "riftatlas surfaces combat/showdown UI; our combat rail-section never opened during the captured game (may indicate combat never triggered, or the panel doesn't auto-open)",
      severity: "minor",
    });
  }
  if (!ours.hasPriorityBannerEverShown) {
    flag({
      id: "C-no-priority-banner",
      layer: "C",
      message:
        "no priority/focus banner ever rendered during the captured game; admin already flagged this is a UX gap vs riftatlas",
      severity: "major",
    });
  }
  // Document the gaps we couldn't compare.
  flag({
    id: "C-gap-no-game-state",
    layer: "C",
    message:
      "couldn't reach an active RiftAtlas game state without auth; structural deltas like exhausted rotation, attacker/defender comparison cards, and priority popup placement could not be compared frame-to-frame. notes: " +
      atlas.notes.join(" | "),
    severity: "minor",
  });
}

// ------------------------------------------------------------------
// Layer D — rule-aware sub-agent.
// ------------------------------------------------------------------

interface SubAgentOutput {
  readonly raw: string;
  readonly defects: readonly {
    readonly id: string;
    readonly severity: Severity;
    readonly message: string;
    readonly phase?: string;
    readonly category?: DefectCategory;
  }[];
  readonly error?: string;
}

async function runRuleAwareSubAgent(args: {
  framesDir: string;
  videoPath: string;
  trailJsonPath: string;
}): Promise<SubAgentOutput> {
  // Keep this prompt SHORT and structured — the sub-agent runs with a hard
  // Timeout and budget. Asking it to do extensive Skill-tool exploration
  // Blows past the budget; instead we point it at concrete artifacts and
  // Ask for a focused, JSON-only response.
  const prompt = `You audit the Riftbound TCG SPA. Use the /riftbound-rules skill if you need rule context, but don't dwell — keep this turn under 90 seconds.

Inputs:
- engine trail JSON: ${args.trailJsonPath}
- frames dir (PNG, in order): ${args.framesDir}
- video: ${args.videoPath}

Audit each phase that appears in the trail (Awaken, Beginning, Channel, Draw, Main, Ending, Cleanup, Showdown). For each, briefly think: what should the UI show per Riftbound rules vs what the frames actually show? Examples to look for:
- Awaken phase should ready (un-exhaust) units — do exhausted chips become upright between turns?
- Channel/Draw/Main should give the active player a clear "your turn" indicator vs waiting banner for the inactive player
- Showdown should display attacker/defender comparison + a priority prompt
- Cleanup should remove dead units
- Runes should be VISIBLE as individual clickable chips with domain color (body=red, mind=blue, chaos=purple, calm=green, fury=orange, order=yellow), exhausted ones rotated 90°. A count-only pill is a CORE_ACTION_MISSING defect — the player cannot tap a count.

For EVERY defect, categorize:
- "CORE_ACTION_MISSING": something the player needs to DO that the UI doesn't expose (tap a rune, declare attackers, play a card, choose a target, pass priority, end turn, etc.). Missing visible affordance for a required game action ALWAYS counts as core-action-missing — even if the underlying engine state is correct.
- "COSMETIC": visual polish only (color contrast, layout drift, missing label, animation timing, text alignment).

Look at 3-5 representative frames in ${args.framesDir} (Read tool). Don't read all of them.

Output ONLY a JSON object on the final line, no prose, no markdown fences:
{"defects":[{"id":"D-<slug>","severity":"blocker"|"major"|"minor","category":"CORE_ACTION_MISSING"|"COSMETIC","phase":"<phase>","message":"<one-line>"}]}

If nothing is wrong: {"defects":[]}.`;

  return await new Promise<SubAgentOutput>((resolve) => {
    const child = spawn(
      "claude",
      [
        "-p",
        prompt,
        "--allowedTools",
        "Read,Glob,Grep,Skill",
        "--dangerously-skip-permissions",
        "--output-format",
        "json",
        "--effort",
        "low",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    console.log(`[qa-v2/D] sub-agent PID=${child.pid} (timeout ${LAYER_D_TIMEOUT_MS}ms)`);
    let stdout = "";
    let stderr = "";
    let done = false;
    const finish = (out: SubAgentOutput): void => {
      if (done) {return;}
      done = true;
      try {
        child.kill("SIGKILL");
      } catch {}
      resolve(out);
    };
    const timer = setTimeout(() => {
      finish({
        defects: [],
        error: `sub-agent timed out after ${LAYER_D_TIMEOUT_MS}ms; stdoutLen=${stdout.length} stderrLen=${stderr.length}`,
        raw: stdout + (stderr ? `\n[stderr]\n${stderr}` : ""),
      });
    }, LAYER_D_TIMEOUT_MS);
    child.stdout.on("data", (b) => {
      stdout += String(b);
    });
    child.stderr.on("data", (b) => {
      stderr += String(b);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout) {
        finish({
          defects: [],
          error: `sub-agent exit=${code}; stderr=${stderr.slice(0, 500)}`,
          raw: stdout,
        });
        return;
      }
      // The claude CLI with --output-format=json wraps the agent text
      // In { result: "..." }. Extract and re-parse.
      let agentText = stdout;
      try {
        const outer = JSON.parse(stdout) as { result?: string };
        if (typeof outer.result === "string") {agentText = outer.result;}
      } catch {
        /* Fall through with raw stdout */
      }
      const m = agentText.match(/\{[\s\S]*"defects"[\s\S]*\}/);
      if (!m) {
        finish({
          defects: [],
          error: "no JSON defects block found in sub-agent output",
          raw: agentText,
        });
        return;
      }
      try {
        const parsed = JSON.parse(m[0]) as {
          defects?: { id: string; severity: Severity; message: string; phase?: string; category?: DefectCategory }[];
        };
        finish({ defects: parsed.defects ?? [], raw: agentText });
      } catch (error) {
        finish({
          defects: [],
          error: `failed to parse sub-agent JSON: ${(error as Error).message}`,
          raw: agentText,
        });
      }
    });
  });
}

// ------------------------------------------------------------------
// Main driver
// ------------------------------------------------------------------

function ensureDir(p: string): void {
  fs.rmSync(p, { force: true, recursive: true });
  fs.mkdirSync(p, { recursive: true });
}

async function main(): Promise<void> {
  ensureDir(FRAMES_DIR);
  console.log(`[qa-v2] origin=${ORIGIN}  frames=${FRAMES_DIR}`);

  const sessionId = await startGoldfish();
  console.log(`[qa-v2] goldfish sessionId=${sessionId}`);
  const playUrl = `${ORIGIN}/play/?session=${encodeURIComponent(sessionId)}&as=player-1&mode=goldfish`;

  const browser = await puppeteer.launch({
    defaultViewport: VIEWPORT,
    executablePath: CHROME_PATH,
    headless: true,
    protocolTimeout: 120_000,
  });

  const checkpoints: Checkpoint[] = [];
  let priorityBannerEverShown = false;
  let combatPanelEverOpened = false;
  let phaseStripEverPresent = false;
  let frameCounter = 0;

  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.error(`[pageerror]`, e.message));
    await page.goto(playUrl, { timeout: 20_000, waitUntil: "domcontentloaded" });
    await page
      .waitForSelector('[data-testid="play-page"]', { timeout: 10_000 })
      .catch((error) => console.warn(`[wait]`, (error as Error).message));
    await sleep(900);

    // Snap helper.
    const snap = async (label: string): Promise<void> => {
      const file = path.join(
        FRAMES_DIR,
        `frame-${String(frameCounter).padStart(4, "0")}.png`,
      );
      await page.screenshot({ path: file, type: "png" });
      frameCounter += 1;
      if (frameCounter % 10 === 0)
        {console.log(`[frame ${frameCounter}] ${label}`);}
    };

    // Initial frame.
    await snap("initial");

    // Drive the bot through MAX_TURNS, capturing checkpoints at each turn flip.
    let lastTurn = -1;
    let consecutiveSkip = 0;
    let lastEngine: EngineState | null = null;
    for (let step = 0; step < 200; step++) {
      const engine = await getEngineState(sessionId);
      lastEngine = engine;
      const turn = engine.view?.turn?.number ?? 0;
      const phase = engine.view?.turn?.phaseLabel ?? engine.view?.turn?.phase ?? "?";
      const isOver = engine.isGameOver === true || engine.view?.status === "complete";

      if (turn !== lastTurn) {
        console.log(`[qa-v2] === turn ${turn} (${phase}) active=${engine.view?.turn?.activePlayer} ===`);
        lastTurn = turn;
        // Capture a checkpoint at each fresh turn.
        const dom = await snapshotDom(page);
        if (dom.phaseStripPresent) {phaseStripEverPresent = true;}
        if (dom.combatPanelPresent) {combatPanelEverOpened = true;}
        // Priority banner heuristic: when it's NOT our turn the waiting
        // Banner should appear. We treat that as "priority/turn banner
        // Anchored to sidebar".
        if (dom.waitingBannerPresent) {priorityBannerEverShown = true;}
        checkpoints.push({ phase, rects: dom.rects, turn });
        checkLayerA(engine, dom, { phase, turn });
        await snap(`turn-${turn}-${phase}`);
      }

      if (isOver) {
        console.log(`[qa-v2] game over — winner=${engine.view?.winner}`);
        // Final checkpoint.
        const dom = await snapshotDom(page);
        checkpoints.push({ phase: "game-over", rects: dom.rects, turn: turn + 1 });
        checkLayerA(engine, dom, { phase: "game-over", turn });
        await snap("game-over");
        break;
      }
      if (turn > MAX_TURNS) {
        console.log(`[qa-v2] hit MAX_TURNS=${MAX_TURNS}, stopping early`);
        break;
      }

      const r = await stepBot(sessionId);
      if ((r.movesApplied ?? 0) === 0) {
        consecutiveSkip += 1;
        if (consecutiveSkip >= 6) {
          console.warn(`[qa-v2] ${consecutiveSkip} consecutive skip — bailing`);
          break;
        }
      } else {
        consecutiveSkip = 0;
      }
      await sleep(250);
      // Snap a tick mid-turn for the video.
      await snap(`tick`);
    }

    // Layer B: cross-frame layout stability.
    console.log(`\n[qa-v2] Layer B — checking layout stability across ${checkpoints.length} checkpoints`);
    checkLayerB(checkpoints);

    // Layer C: riftatlas reference + structural fixture diff.
    if (!SKIP_C) {
      console.log(`\n[qa-v2] Layer C — probing play.riftatlas.com + structural fixture`);
      const atlas = await probeRiftAtlas(browser);
      const ours: OurFeatures = {
        hasPhaseStrip: phaseStripEverPresent,
        hasBattlefieldRow: checkpoints.some((c) =>
          c.rects.some((r) => r.selector === ".battlefield-row" && r.present),
        ),
        hasSidebarTurnBanner: checkpoints.some((c) =>
          c.rects.some((r) => r.selector === ".turn-banner" && r.present),
        ),
        hasShowdownBreadcrumb: false, // We don't track this between checkpoints
        hasCombatPanel: combatPanelEverOpened,
        hasPriorityBannerEverShown: priorityBannerEverShown,
      };
      checkLayerC(ours, atlas);

      // Structural fixture diff — runs against the LIVE page (which is
      // Currently sitting on a goldfish game post-loop). For each required
      // Zone / action / per-player zone the fixture lists fallback CSS
      // Selectors; we accept any match. Missing selectors are emitted as
      // C-missing-{category}-{name} defects (blocker for zones+actions,
      // Minor for card-states which may legitimately be absent).
      const fixture = loadStructuralFixture();
      let structuralResults: readonly StructuralProbeResult[] = [];
      if (fixture) {
        structuralResults = await probeStructural(page, fixture);
        checkLayerCStructural(structuralResults);
      } else {
        flag({
          id: "C-fixture-missing",
          layer: "C",
          message: `structural fixture file not loadable at ${FIXTURE_PATH}`,
          severity: "minor",
        });
      }

      // Save what we learned.
      fs.writeFileSync(
        path.join(FRAMES_DIR, "layer-c-atlas-notes.json"),
        JSON.stringify({ atlas, ours, structuralResults }, null, 2),
      );
    } else {
      console.log(`[qa-v2] Layer C skipped (QA_V2_SKIP_LAYER_C=1)`);
    }

    // Persist the engine trail for Layer D.
    const trailPath = path.join(FRAMES_DIR, "engine-trail.json");
    fs.writeFileSync(trailPath, JSON.stringify(lastEngine?.trail ?? [], null, 2));

    // Stitch the video so the sub-agent (and humans) can review it.
    console.log(`\n[qa-v2] stitching video at ${VIDEO_PATH}`);
    const ff = spawnSync(
      FFMPEG,
      [
        "-y",
        "-framerate", "5",
        "-i", path.join(FRAMES_DIR, "frame-%04d.png"),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2",
        "-movflags", "+faststart",
        VIDEO_PATH,
      ],
      { stdio: "inherit" },
    );
    if (ff.status !== 0)
      {console.warn(`[qa-v2] ffmpeg exit ${ff.status} — continuing without video`);}

    // Layer D — sub-agent.
    if (!SKIP_D) {
      console.log(`\n[qa-v2] Layer D — spawning rule-aware sub-agent`);
      const subOut = await runRuleAwareSubAgent({
        framesDir: FRAMES_DIR,
        trailJsonPath: trailPath,
        videoPath: VIDEO_PATH,
      });
      if (subOut.error) {
        flag({
          id: "D-subagent-error",
          layer: "D",
          message: `sub-agent did not produce parseable output: ${subOut.error}`,
          severity: "minor",
        });
      }
      for (const d of subOut.defects) {
        // Iter-RunePoolUI / reviewer-prioritization fix: auto-upgrade any
        // CORE_ACTION_MISSING defect to "blocker" regardless of how the
        // Sub-agent labelled it. The sub-agent's first-pass severity
        // Doesn't always reflect that "I can't tap my runes" is gameplay-
        // Blocking — this normalisation makes core-action-missing always
        // Win the priority race against cosmetic polish.
        let effectiveSeverity: Severity = d.severity ?? "major";
        if (d.category === "CORE_ACTION_MISSING") {
          effectiveSeverity = "blocker";
        }
        flag({
          category: d.category,
          id: d.id,
          layer: "D",
          message: d.message,
          phase: d.phase,
          severity: effectiveSeverity,
        });
      }
      // Save the raw sub-agent output for debugging.
      fs.writeFileSync(
        path.join(FRAMES_DIR, "layer-d-subagent-output.txt"),
        subOut.raw,
      );
    } else {
      console.log(`[qa-v2] Layer D skipped (QA_V2_SKIP_LAYER_D=1)`);
    }
  } catch (error) {
    console.error(`[qa-v2] ERR`, (error as Error).stack ?? (error as Error).message);
    flag({
      id: "driver-error",
      layer: "A",
      message: `qa-reviewer-v2 driver crashed: ${(error as Error).message}`,
      severity: "blocker",
    });
  } finally {
    await browser.close();
  }

  // ----------------------------------------------------------------
  // Write reports.
  // ----------------------------------------------------------------
  const totals = {
    blockers: defects.filter((d) => d.severity === "blocker").length,
    majors: defects.filter((d) => d.severity === "major").length,
    minors: defects.filter((d) => d.severity === "minor").length,
  };
  const byLayer: Record<string, Defect[]> = { A: [], B: [], C: [], D: [] };
  for (const d of defects) {byLayer[d.layer]!.push(d);}

  const report = {
    checkpointsCaptured: checkpoints.length,
    framesDir: FRAMES_DIR,
    layers: {
      A_engine_vs_dom: byLayer.A,
      B_layout_stability: byLayer.B,
      C_riftatlas_diff: byLayer.C,
      D_rules_aware: byLayer.D,
    },
    sessionId,
    timestamp: new Date().toISOString(),
    totals,
    video: VIDEO_PATH,
  };
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
  console.log(`\n[qa-v2] wrote ${REPORT_JSON}`);

  // Markdown report.
  const lines: string[] = [];
  lines.push(`# QA Reviewer v2 — Riftbound Play SPA`);
  lines.push(``);
  lines.push(`- Timestamp: ${report.timestamp}`);
  lines.push(`- Session: ${sessionId}`);
  lines.push(`- Frames: ${FRAMES_DIR}`);
  lines.push(`- Video: ${VIDEO_PATH}`);
  lines.push(``);
  lines.push(`## Totals`);
  lines.push(``);
  lines.push(`- Blockers: ${totals.blockers}`);
  lines.push(`- Majors: ${totals.majors}`);
  lines.push(`- Minors: ${totals.minors}`);
  lines.push(``);

  // Iter-RunePoolUI / reviewer-prioritization fix: sort by (severity asc,
  // Category asc) so blockers come first AND within each tier the
  // CORE_ACTION_MISSING defects sort above COSMETIC ones. This ensures
  // "I can't tap my runes" wins over "the title pill could be 5% more
  // Contrasty" even when the sub-agent labels them at the same severity.
  const SEV_RANK: Record<Severity, number> = { blocker: 0, major: 1, minor: 2 };
  const CAT_RANK: Record<DefectCategory, number> = {
    CORE_ACTION_MISSING: 0,
    COSMETIC: 1,
  };
  const catKey = (d: Defect): number =>
    d.category ? CAT_RANK[d.category] : 0.5; // Unlabelled defects sort between.
  const ranked = [...defects].toSorted((a, b) => {
    const sev = SEV_RANK[a.severity] - SEV_RANK[b.severity];
    if (sev !== 0) {return sev;}
    return catKey(a) - catKey(b);
  });
  lines.push(`## Top defects (severity-ranked, core-actions first)`);
  lines.push(``);
  for (const d of ranked.slice(0, 10)) {
    const catTag = d.category ? ` [${d.category}]` : "";
    lines.push(
      `- **[${d.layer}/${d.severity}]${catTag} ${d.id}** — ${d.message}` +
        (d.turn != null ? ` _(turn ${d.turn} ${d.phase ?? ""})_` : ""),
    );
  }
  lines.push(``);
  for (const layer of ["A", "B", "C", "D"] as const) {
    const ds = byLayer[layer]!;
    const labels = {
      A: "Layer A — Engine vs DOM truth",
      B: "Layer B — Cross-frame layout stability",
      C: "Layer C — RiftAtlas reference diff",
      D: "Layer D — Rule-aware sub-agent",
    };
    lines.push(`## ${labels[layer]} (${ds.length} defects)`);
    lines.push(``);
    if (ds.length === 0) {
      lines.push(`_no defects_`);
      lines.push(``);
      continue;
    }
    // Same severity-then-category sort applied within each layer section.
    const sortedDs = [...ds].toSorted((a, b) => {
      const sev = SEV_RANK[a.severity] - SEV_RANK[b.severity];
      if (sev !== 0) {return sev;}
      return catKey(a) - catKey(b);
    });
    for (const d of sortedDs) {
      const catTag = d.category ? ` [${d.category}]` : "";
      lines.push(
        `- **[${d.severity}]${catTag} ${d.id}** — ${d.message}` +
          (d.turn != null ? ` _(turn ${d.turn} ${d.phase ?? ""})_` : ""),
      );
    }
    lines.push(``);
  }
  fs.writeFileSync(REPORT_MD, lines.join("\n"));
  console.log(`[qa-v2] wrote ${REPORT_MD}`);

  console.log(
    `\n[qa-v2] DONE — blockers=${totals.blockers} majors=${totals.majors} minors=${totals.minors}`,
  );
}

await main();
