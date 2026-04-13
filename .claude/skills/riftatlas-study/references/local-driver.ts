/**
 * Local-driver for the riftatlas-study skill.
 *
 * Drives apps/riftbound-app (localhost:3000) through the named checkpoints
 * defined in SKILL.md and dumps one screenshot + one JSON region snapshot
 * per checkpoint into /tmp/riftatlas-compare/ours-<checkpoint>.{png,json}.
 *
 * Prereqs:
 *   - `bun run server.ts` running on :3000 with SANDBOX_ENABLED=true
 *   - `bun add -d playwright` (or use the monorepo's existing playwright)
 *
 * Run:
 *   bun .claude/skills/riftatlas-study/references/local-driver.ts
 *
 * Notes on why addScriptTag:
 *   Our gameplay scripts are classic <script> tags with top-level `let gameState`.
 *   That binding lives in script-scope, not on `window`, so `page.evaluate`
 *   callbacks can't see it. We inject a poller classic script that copies
 *   the shared binding onto `window.__gs` every 100ms, then read from there.
 */

// Resolve a playwright build whose chromium is actually installed on this
// machine. `.claude/skills/...` isn't a bun workspace so we can't `import
// "playwright"` directly. We try candidates in order: (1) workspace
// installs, (2) bun's global package cache. For each candidate we verify
// that its required chromium-headless-shell revision exists under
// ~/.cache/ms-playwright before using it.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";

const CANDIDATE_PATHS = [
  // Monorepo workspace installs
  ...(existsSync(`${homedir()}/tcg-engines/node_modules/.bun`)
    ? readdirSync(`${homedir()}/tcg-engines/node_modules/.bun`)
        .filter((d) => d.startsWith("playwright@"))
        .map((d) => `${homedir()}/tcg-engines/node_modules/.bun/${d}/node_modules/playwright/index.mjs`)
    : []),
  // Bun global cache
  ...(existsSync(`${homedir()}/.bun/install/cache`)
    ? readdirSync(`${homedir()}/.bun/install/cache`)
        .filter((d) => d.startsWith("playwright@") && d.endsWith("@@@1"))
        .map((d) => `${homedir()}/.bun/install/cache/${d}/index.mjs`)
    : []),
];

function chromiumInstalledFor(playwrightIndex: string): boolean {
  // browsers.json lives next to playwright-core, one up from playwright's dir
  const core = playwrightIndex
    .replace("/playwright/index.mjs", "/playwright-core/browsers.json")
    .replace("playwright@", "playwright-core@")
    .replace("/index.mjs", "/browsers.json");
  try {
    const json = JSON.parse(readFileSync(core, "utf8")) as {
      browsers: Array<{ name: string; revision: string }>;
    };
    const rev = json.browsers.find(
      (b) => b.name === "chromium-headless-shell",
    )?.revision;
    if (!rev) return false;
    return existsSync(
      `${homedir()}/.cache/ms-playwright/chromium_headless_shell-${rev}`,
    );
  } catch {
    return false;
  }
}

let playwrightPath: string | null = null;
for (const p of CANDIDATE_PATHS) {
  if (existsSync(p) && chromiumInstalledFor(p)) {
    playwrightPath = p;
    break;
  }
}
if (!playwrightPath) {
  throw new Error(
    `Could not find a playwright install whose chromium is downloaded.\n` +
      `Tried: ${CANDIDATE_PATHS.join(", ")}\n` +
      `Fix: run \`bunx playwright install chromium\` from a workspace that has playwright.`,
  );
}
console.log(`[driver] using playwright: ${playwrightPath}`);
const { chromium } = (await import(playwrightPath)) as typeof import("playwright");
type Page = Awaited<ReturnType<Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newContext"]>>["newPage"]>>;

import { mkdirSync } from "node:fs";

const OUT = "/tmp/riftatlas-compare";
const URL = "http://localhost:3000/gameplay.html";

type Checkpoint =
  | "C0_lobby"
  | "C1_battlefield_select"
  | "C2_mulligan"
  | "C3_turn1_main"
  | "C4_after_first_play"
  | "C8_endphase";

const REGIONS: Record<string, string> = {
  phaseBar: "#phaseBar",
  battlefieldRow: "#battlefieldRow",
  opponentHand: "#opponent-hand",
  opponentRunePool: "#opponent-runePool",
  opponentDecks: "#opponent-decks",
  opponentLegendChampion: "#opponent-legendChampion",
  playerBase: "#player-base",
  resourceBar: "#resourceBar",
  playerRunePool: "#player-runePool",
  playerHand: "#player-hand",
  playerDecks: "#player-decks",
  playerLegendChampion: "#player-legendChampion",
  actionBar: "#actionBar",
  chainPanel: "#chainPanel",
  gameLog: "#gameLog",
};

mkdirSync(OUT, { recursive: true });

async function snapshotRegion(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return { present: false };
    const rect = el.getBoundingClientRect();
    return {
      present: true,
      childElementCount: el.childElementCount,
      innerHTMLLength: el.innerHTML.length,
      innerHTMLPreview: el.innerHTML.slice(0, 300),
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      visible: rect.width > 0 && rect.height > 0,
    };
  }, selector);
}

async function dumpCheckpoint(page: Page, label: Checkpoint) {
  await page.screenshot({ path: `${OUT}/ours-${label}.png` });
  const regions: Record<string, unknown> = {};
  for (const [name, sel] of Object.entries(REGIONS)) {
    regions[name] = await snapshotRegion(page, sel);
  }
  const state = await page.evaluate(() => {
    const gs = (window as { __gs?: Record<string, unknown> }).__gs;
    const vp = (window as { __vp?: string }).__vp;
    return {
      viewingPlayer: vp,
      turn: gs?.turn,
      phase: (gs?.turn as { phase?: string } | undefined)?.phase,
      pregamePhase: (
        gs?.interaction as { pregame?: { phase?: string } } | undefined
      )?.pregame?.phase,
      runePoolsKeys: gs?.runePools ? Object.keys(gs.runePools) : null,
      runePoolZoneLen: Array.isArray(
        (gs?.zones as Record<string, unknown[]> | undefined)?.runePool,
      )
        ? (gs!.zones as Record<string, unknown[]>).runePool.length
        : "not-array",
      runeDeckZoneLen: Array.isArray(
        (gs?.zones as Record<string, unknown[]> | undefined)?.runeDeck,
      )
        ? (gs!.zones as Record<string, unknown[]>).runeDeck.length
        : "not-array",
      runeDeckOwners: Array.isArray(
        (gs?.zones as Record<string, { owner?: string }[]> | undefined)?.runeDeck,
      )
        ? (gs!.zones as Record<string, { owner?: string }[]>).runeDeck
            .slice(0, 3)
            .map((c) => c.owner)
        : null,
      zoneKeys: gs?.zones ? Object.keys(gs.zones as object) : null,
    };
  });
  await Bun.write(
    `${OUT}/ours-${label}.json`,
    JSON.stringify({ label, state, regions }, null, 2),
  );
  console.log(
    `[${label}] phase=${state.phase ?? state.pregamePhase ?? "?"} runePool=${state.runePoolZoneLen}`,
  );
}

const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();

const logs: string[] = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(URL, { waitUntil: "domcontentloaded" });

// Mirror the script-scoped `gameState` / `viewingPlayer` / `P1` / `P2`
// bindings onto `window` so page.evaluate can read them.
await page.addScriptTag({
  content: `
    setInterval(() => {
      try {
        window.__gs = typeof gameState !== 'undefined' ? gameState : null;
        window.__vp = typeof viewingPlayer !== 'undefined' ? viewingPlayer : null;
        window.__P1 = typeof P1 !== 'undefined' ? P1 : null;
        window.__P2 = typeof P2 !== 'undefined' ? P2 : null;
      } catch (e) {}
    }, 100);
  `,
});
await page.waitForTimeout(500);

// C0 — lobby
await dumpCheckpoint(page, "C0_lobby");

// Click Goldfish → pick default deck → Start
await page
  .locator('#sandboxOption button:has-text("Goldfish")')
  .first()
  .click();
await page.waitForTimeout(1500);
await page.selectOption("#deckSelect", "default");
await page.waitForTimeout(1000);
await page.waitForSelector("#lobbyStartBtn:not(.hidden)", { timeout: 5000 });
await page.locator("#lobbyStartBtn").click();
await page.waitForTimeout(2500);

// Drive pregame loop, dumping each phase exactly once
const dumped = new Set<Checkpoint>();
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(500);

  const phase = await page.evaluate(() => {
    const gs = (window as { __gs?: Record<string, unknown> }).__gs;
    return {
      ready: !!gs,
      pregamePhase: (
        gs?.interaction as { pregame?: { phase?: string } } | undefined
      )?.pregame?.phase,
      phase: (gs?.turn as { phase?: string } | undefined)?.phase,
    };
  });

  if (
    phase.pregamePhase === "battlefield_select" &&
    !dumped.has("C1_battlefield_select")
  ) {
    await dumpCheckpoint(page, "C1_battlefield_select");
    dumped.add("C1_battlefield_select");
  }
  if (phase.pregamePhase === "mulligan" && !dumped.has("C2_mulligan")) {
    await dumpCheckpoint(page, "C2_mulligan");
    dumped.add("C2_mulligan");
  }

  // Advance pregame
  const coinBtn = page.locator("#coinChoose button").first();
  if ((await coinBtn.count()) && (await coinBtn.isVisible().catch(() => false))) {
    await coinBtn.click();
    continue;
  }
  const bf = page.locator("#pregameContent .bf-choice").first();
  if ((await bf.count()) && (await bf.isVisible().catch(() => false))) {
    await bf.click();
    await page.waitForTimeout(600);
    continue;
  }
  const keep = page.locator("button.mulligan-btn-keep");
  if (
    (await keep.count()) &&
    (await keep.first().isVisible().catch(() => false))
  ) {
    await keep.first().click();
    continue;
  }

  if (phase.ready && !phase.pregamePhase && phase.phase) {
    break;
  }
}

// C3 — turn 1 main
await page.waitForTimeout(800);
await dumpCheckpoint(page, "C3_turn1_main");

// C4 — after first play: auto-play first affordable card in hand if possible
// (best-effort; if nothing is affordable, skip to C8)
const played = await page
  .evaluate(() => {
    const first = document.querySelector(
      "#player-hand .card",
    ) as HTMLElement | null;
    if (!first) return false;
    first.click();
    return true;
  })
  .catch(() => false);
if (played) {
  await page.waitForTimeout(1200);
  await dumpCheckpoint(page, "C4_after_first_play");
}

// C8 — end phase: look for an End Turn button
const endTurn = page
  .locator('button:has-text("End Turn"), #endTurnBtn, [data-move="endTurn"]')
  .first();
if ((await endTurn.count()) && (await endTurn.isVisible().catch(() => false))) {
  await endTurn.click();
  await page.waitForTimeout(1200);
  await dumpCheckpoint(page, "C8_endphase");
}

await Bun.write(`${OUT}/ours-console.log`, logs.join("\n"));
await b.close();
console.log(`\nDone. Output: ${OUT}/`);
