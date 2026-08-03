#!/usr/bin/env bun
/**
 * UI Audit — Playwright-driven DOM ↔ engine-state consistency check.
 *
 * Launches headless chromium against a running riftbound-app (localhost:3000),
 * clicks through lobby → pregame → several turns, and at each step:
 *   - screenshots the board
 *   - dumps `window.__rbGameState` to JSON
 *   - cross-checks DOM (hand card IDs, VP counters, phase bar) vs engine state
 *
 * Output: /tmp/ui-audit/{step-N.png, state-N.json, report.md}
 *
 * Run (on a box with the server + chromium):
 *   bun packages/riftbound-engine/src/testing/playtest/ui-audit.ts
 *
 * See UI-AUDIT-README.md for devbox setup.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Playwright resolution shim (see .claude/skills/riftatlas-study/references/
// local-driver.ts). This file lives in a workspace that does NOT declare
// playwright as a dep, so `import "playwright"` won't resolve. We hunt for a
// build whose chromium-headless-shell revision is actually downloaded.
// ---------------------------------------------------------------------------
function candidatePaths(): string[] {
  const roots = [
    `${process.cwd()}/node_modules/.bun`,
    `${homedir()}/tcg/tcg-engines/node_modules/.bun`,
    `${homedir()}/tcg-engines/node_modules/.bun`,
    `${homedir()}/.bun/install/cache`,
  ];
  const out: string[] = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const d of readdirSync(root)) {
      if (!d.startsWith("playwright@")) continue;
      const p = root.includes(".bun/install/cache")
        ? `${root}/${d}/index.mjs`
        : `${root}/${d}/node_modules/playwright/index.mjs`;
      if (existsSync(p)) out.push(p);
    }
  }
  return out;
}

function chromiumInstalledFor(pwIndex: string): boolean {
  const core = pwIndex
    .replace("/playwright/index.mjs", "/playwright-core/browsers.json")
    .replace("playwright@", "playwright-core@")
    .replace("/index.mjs", "/browsers.json");
  try {
    const json = JSON.parse(readFileSync(core, "utf8")) as {
      browsers: Array<{ name: string; revision: string }>;
    };
    const rev = json.browsers.find((b) => b.name === "chromium-headless-shell")?.revision;
    return !!rev && existsSync(`${homedir()}/.cache/ms-playwright/chromium_headless_shell-${rev}`);
  } catch {
    return false;
  }
}

// Minimal structural types — playwright isn't a declared dep of this package,
// so we can't `typeof import("playwright")`.
interface Locator {
  first(): Locator;
  count(): Promise<number>;
  isVisible(): Promise<boolean>;
  click(): Promise<void>;
}
interface Page {
  goto(url: string, opts?: { waitUntil?: string }): Promise<unknown>;
  screenshot(opts: { path: string; fullPage?: boolean }): Promise<unknown>;
  evaluate<R>(fn: () => R): Promise<R>;
  evaluate<R, A>(fn: (a: A) => R, arg: A): Promise<R>;
  addScriptTag(opts: { content: string }): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  waitForSelector(sel: string, opts?: { timeout?: number }): Promise<unknown>;
  selectOption(sel: string, value: string): Promise<unknown>;
  locator(sel: string): Locator;
  on(event: "console", cb: (m: { type(): string; text(): string }) => void): void;
  on(event: "pageerror", cb: (e: Error) => void): void;
}
interface PW {
  chromium: {
    launch(opts: { headless: boolean }): Promise<{
      newContext(opts: { viewport: { width: number; height: number } }): Promise<{
        newPage(): Promise<Page>;
      }>;
      close(): Promise<void>;
    }>;
  };
}

async function loadPlaywright(): Promise<PW> {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — optional dep, resolved at runtime on the devbox
    return (await import("playwright")) as PW;
  } catch {
    /* fall through to shim */
  }
  for (const p of candidatePaths()) {
    if (chromiumInstalledFor(p)) {
      console.log(`[ui-audit] playwright: ${p}`);
      return (await import(p)) as PW;
    }
  }
  throw new Error(
    "No playwright install with a downloaded chromium found.\n" +
      "Fix: bunx playwright install chromium",
  );
}

const { chromium } = await loadPlaywright();

// ---------------------------------------------------------------------------

const BASE = process.env.RIFTBOUND_URL ?? "http://localhost:3000";
const OUT = process.env.UI_AUDIT_OUT ?? "/tmp/ui-audit";

rmSync(OUT, { force: true, recursive: true });
mkdirSync(OUT, { recursive: true });

type Finding = { step: number; label: string; check: string; ok: boolean; detail: string };
const findings: Finding[] = [];
const consoleLog: string[] = [];
let stepN = 0;

function record(label: string, check: string, ok: boolean, detail: string) {
  findings.push({ step: stepN, label, check, ok, detail });
  const tag = ok ? "PASS" : "FAIL";
  console.log(`  [${tag}] ${check}: ${detail}`);
}

/** Pull the client's mirrored game state. state.js exposes it as
 *  `window.__rbGameState`; we also install a `__gs` alias below so the
 *  checkpoint dumps match the local-driver.ts convention. */
async function readState(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as {
      __gs?: Record<string, unknown>;
      __rbGameState?: Record<string, unknown>;
      __rbViewingPlayer?: string;
    };
    const gs = w.__gs ?? w.__rbGameState ?? null;
    const vp = w.__rbViewingPlayer ?? "player-1";
    const zones = (gs?.zones ?? {}) as Record<string, Array<{ id: string; owner?: string }>>;
    const handIds = Array.isArray(zones.hand)
      ? zones.hand.filter((c) => c.owner === vp).map((c) => c.id)
      : [];
    const players = (gs?.players ?? {}) as Record<string, { victoryPoints?: number }>;
    return {
      hasState: !!gs,
      viewingPlayer: vp,
      turn: gs?.turn,
      phase: (gs?.turn as { phase?: string } | undefined)?.phase,
      pregamePhase: (gs?.interaction as { pregame?: { phase?: string } } | undefined)?.pregame?.phase,
      status: gs?.status,
      handIds,
      zoneKeys: gs?.zones ? Object.keys(gs.zones as object) : [],
      victoryPoints: {
        "player-1": players["player-1"]?.victoryPoints ?? null,
        "player-2": players["player-2"]?.victoryPoints ?? null,
      },
      victoryScore: gs?.victoryScore,
      raw: gs,
    };
  });
}

async function readDom(page: Page) {
  return page.evaluate(() => {
    const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
    const qa = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];
    const rect = (el: HTMLElement | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height, visible: r.width > 0 && r.height > 0 };
    };
    const handCards = qa("#player-hand [data-card-id]");
    return {
      startScreenVisible: !q("#startScreen")?.classList.contains("hidden"),
      phaseBar: { text: q("#phaseBar")?.textContent?.trim() ?? "", rect: rect(q("#phaseBar")) },
      battlefieldRow: { children: q("#battlefieldRow")?.childElementCount ?? 0, rect: rect(q("#battlefieldRow")) },
      playerHand: {
        count: handCards.length,
        ids: handCards.map((el) => el.getAttribute("data-card-id") ?? ""),
        rect: rect(q("#player-hand")),
      },
      playerVpText: q("#playerInfo .stat-value.vp")?.textContent?.trim() ?? null,
      opponentVpText: q("#opponentInfo .stat-value.vp")?.textContent?.trim() ?? null,
      resourceBar: { text: q("#resourceBar")?.textContent?.trim() ?? "", rect: rect(q("#resourceBar")) },
      actionBarVisible: !(q("#actionBar")?.classList.contains("hidden") ?? true),
      runePool: { children: q("#player-runePool")?.childElementCount ?? 0 },
    };
  });
}

async function checkpoint(page: Page, label: string) {
  stepN += 1;
  console.log(`\n[step ${stepN}] ${label}`);
  await page.screenshot({ path: `${OUT}/step-${stepN}.png`, fullPage: false });

  const state = await readState(page);
  const dom = await readDom(page);
  await Bun.write(
    `${OUT}/state-${stepN}.json`,
    JSON.stringify({ step: stepN, label, state, dom }, null, 2),
  );

  // ---- cross-checks ------------------------------------------------------
  if (state.hasState) {
    // Hand: DOM data-card-id set should equal engine hand set for viewingPlayer.
    const domSet = new Set(dom.playerHand.ids);
    const engSet = new Set(state.handIds);
    const missing = [...engSet].filter((id) => !domSet.has(id));
    const extra = [...domSet].filter((id) => !engSet.has(id));
    record(
      label,
      "hand card IDs match engine state",
      missing.length === 0 && extra.length === 0,
      `dom=${dom.playerHand.count} engine=${state.handIds.length}` +
        (missing.length ? ` missing=[${missing.slice(0, 3).join(",")}…]` : "") +
        (extra.length ? ` extra=[${extra.slice(0, 3).join(",")}…]` : ""),
    );

    // VP counters: rendered text should start with engine victoryPoints value.
    const vp = state.victoryPoints[state.viewingPlayer as "player-1" | "player-2"];
    const vpOk =
      dom.playerVpText != null && vp != null && dom.playerVpText.startsWith(`${vp}`);
    record(
      label,
      "VP counter visible & matches engine",
      vpOk,
      `dom="${dom.playerVpText}" engine=${vp}/${state.victoryScore}`,
    );

    // Hand renders: element visible with non-zero rect when engine says cards exist.
    const handRenders =
      state.handIds.length === 0 ||
      (dom.playerHand.rect?.visible === true && dom.playerHand.count > 0);
    record(label, "#player-hand renders", handRenders, JSON.stringify(dom.playerHand.rect));

    // Phase bar populated once past pregame.
    if (state.phase) {
      record(
        label,
        "phase bar reflects a phase",
        dom.phaseBar.text.length > 0 && (dom.phaseBar.rect?.visible ?? false),
        `phase=${state.phase} bar="${dom.phaseBar.text.slice(0, 40)}"`,
      );
    }
  } else {
    record(label, "window.__rbGameState present", false, "no game state on window yet");
  }

  return { state, dom };
}

async function clickIfVisible(page: Page, selector: string): Promise<boolean> {
  const loc = page.locator(selector).first();
  if ((await loc.count()) === 0) return false;
  if (!(await loc.isVisible().catch(() => false))) return false;
  await loc.click();
  return true;
}

// ---------------------------------------------------------------------------
// Drive
// ---------------------------------------------------------------------------
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
page.on("console", (m) => consoleLog.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => consoleLog.push(`[pageerror] ${e.message}`));

console.log(`[ui-audit] → ${BASE}/play`);
await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" });

// Mirror script-scoped state onto window.__gs (local-driver.ts convention).
// state.js already defines window.__rbGameState; this alias keeps checkpoint
// dumps compatible with the riftatlas-study tooling.
await page.addScriptTag({
  content: `
    setInterval(() => {
      try {
        window.__gs = (typeof window.__rbGameState !== 'undefined' && window.__rbGameState)
          || (typeof gameState !== 'undefined' ? gameState : null);
        window.__vp = (typeof window.__rbViewingPlayer !== 'undefined' && window.__rbViewingPlayer)
          || (typeof viewingPlayer !== 'undefined' ? viewingPlayer : null);
      } catch (e) {}
    }, 100);
  `,
});
await page.waitForTimeout(400);

// step 1 — lobby
await checkpoint(page, "lobby");

// Goldfish → deck → Start
await clickIfVisible(page, '#sandboxOption button:has-text("Goldfish")');
await page.waitForTimeout(1200);
await page.selectOption("#deckSelect", "default").catch(() => {});
await page.waitForTimeout(600);
await page.waitForSelector("#lobbyStartBtn:not(.hidden)", { timeout: 8000 }).catch(() => {});
await clickIfVisible(page, "#lobbyStartBtn");
await page.waitForTimeout(1500);

// Pregame loop — coin flip, battlefield select, mulligan keep. Dump each once.
const seen = new Set<string>();
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(400);
  const s = await readState(page);
  if (s.pregamePhase && !seen.has(s.pregamePhase)) {
    seen.add(s.pregamePhase);
    await checkpoint(page, `pregame:${s.pregamePhase}`);
  }
  if (await clickIfVisible(page, "#coinChoose button")) continue;
  if (await clickIfVisible(page, "#pregameContent .bf-choice")) {
    await page.waitForTimeout(400);
    continue;
  }
  if (await clickIfVisible(page, "button.mulligan-btn-keep")) continue;
  if (s.hasState && !s.pregamePhase && s.phase) break;
}

// step — turn 1 initial board
await page.waitForTimeout(800);
await checkpoint(page, "turn1-initial");

// Play/end-turn loop — 5 iterations ≈ 5–10 moves.
for (let turn = 0; turn < 5; turn++) {
  // Try to play the first hand card (best-effort — may be unaffordable).
  const played = await page
    .evaluate(() => {
      const el = document.querySelector("#player-hand .card") as HTMLElement | null;
      if (!el) return false;
      el.click();
      return true;
    })
    .catch(() => false);
  if (played) {
    await page.waitForTimeout(800);
    // Confirm targets/action-bar if one appeared.
    await clickIfVisible(page, "#actionBarBtns button");
    await page.waitForTimeout(600);
    await checkpoint(page, `turn${turn + 1}-after-play`);
  }

  // End turn / pass focus.
  const ended = await clickIfVisible(
    page,
    'button:has-text("End Turn"), #endTurnBtn, [data-move="endTurn"], [data-move="passFocus"]',
  );
  await page.waitForTimeout(800);
  if (ended) await checkpoint(page, `turn${turn + 1}-end`);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const fails = findings.filter((f) => !f.ok);
const lines: string[] = [
  "# riftbound-app UI Audit",
  "",
  `Target: \`${BASE}/play\`  ·  Steps: ${stepN}  ·  Checks: ${findings.length}  ·  Failures: **${fails.length}**`,
  "",
  "| step | label | check | result | detail |",
  "|---:|---|---|:---:|---|",
];
for (const f of findings) {
  lines.push(
    `| ${f.step} | ${f.label} | ${f.check} | ${f.ok ? "✅" : "❌"} | ${f.detail.replace(/\|/g, "\\|")} |`,
  );
}
if (fails.length) {
  lines.push("", "## Failures", "");
  for (const f of fails) lines.push(`- **step ${f.step}** \`${f.label}\` — ${f.check}: ${f.detail}`);
}
lines.push(
  "",
  "## Artifacts",
  "",
  ...Array.from({ length: stepN }, (_, i) => `- step-${i + 1}.png · state-${i + 1}.json`),
  "",
  `Console log lines captured: ${consoleLog.length} (see console.log)`,
);
await Bun.write(`${OUT}/report.md`, lines.join("\n"));
await Bun.write(`${OUT}/console.log`, consoleLog.join("\n"));

await browser.close();
console.log(`\n[ui-audit] done → ${OUT}/report.md  (${fails.length} failure${fails.length === 1 ? "" : "s"})`);
process.exit(fails.length ? 1 : 0);
