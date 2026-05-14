#!/usr/bin/env bun
/**
 * Headless SPA screenshot harness.
 *
 * Usage:
 *   bun run scripts/headless-screenshot.ts [url] [out] [--scenario <name>]
 *
 * Scenarios:
 *   - default    (current behavior): hydrate fresh game, snapshot.
 *   - mid-combat: drive the API to a state with a contested battlefield +
 *                 active showdown + an assigned attacker, then snapshot.
 *                 Best-effort — if the engine can't be coerced into combat
 *                 from a fresh session, the script logs why and snapshots
 *                 the latest reachable state anyway (don't fail the run).
 *
 * The scenario driver talks to the SPA's API server (`/api/v2/...`) via
 * fetch — same endpoints the SPA uses. We pass through the SAME session
 * id that the page URL uses so the screenshot reflects the driven state.
 */
import puppeteer from "puppeteer-core";

interface Args {
  url: string;
  out: string;
  scenario: "default" | "mid-combat" | "game-over";
}

const VALID_SCENARIOS = new Set<Args["scenario"]>([
  "default",
  "mid-combat",
  "game-over",
]);

function isScenario(v: string): v is Args["scenario"] {
  return VALID_SCENARIOS.has(v as Args["scenario"]);
}

function parseArgs(argv: readonly string[]): Args {
  const positional: string[] = [];
  let scenario: Args["scenario"] = "default";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--scenario") {
      const next = argv[i + 1];
      if (typeof next === "string" && isScenario(next)) {
        scenario = next;
        i++;
      }
      continue;
    }
    if (a.startsWith("--scenario=")) {
      const v = a.slice("--scenario=".length);
      if (isScenario(v)) {scenario = v;}
      continue;
    }
    positional.push(a);
  }
  const url =
    positional[0] ??
    "http://localhost:5173/play/?session=headless-smoke&realDecks=true";
  const out = positional[1] ?? "/tmp/spa-headless.png";
  return { out, scenario, url };
}

function sessionIdFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.searchParams.get("session") ?? "headless-smoke";
  } catch {
    return "headless-smoke";
  }
}

/**
 * Ensure the URL contains ?session=<id> so the SPA uses the same session
 * the scenario driver posts to. Without this, the SPA generates a random UUID
 * and the driver posts to "headless-smoke" — two different sessions.
 */
function ensureSessionParam(url: string, sessionId: string): string {
  try {
    const u = new URL(url);
    if (!u.searchParams.has("session")) {
      u.searchParams.set("session", sessionId);
    }
    return u.toString();
  } catch {
    return url;
  }
}

function apiBaseFromUrl(url: string): string {
  try {
    const u = new URL(url);
    // Vite proxies /api → backend; in dev the same origin works.
    return `${u.origin}/api/v2`;
  } catch {
    return "http://localhost:5173/api/v2";
  }
}

/**
 * Drive the engine into combat by calling the server-side scenario seed
 * endpoint (iter 12). The endpoint directly mutates internalState to place
 * units on a battlefield, mark it contested, push a showdown frame, and
 * tag an attacker — bypassing the non-determinism of trying to reach combat
 * via bot moves on a real deck.
 */
async function driveMidCombat(
  apiBase: string,
  sessionId: string,
): Promise<void> {
  const sid = encodeURIComponent(sessionId);
  try {
    const r = await fetch(`${apiBase}/scenario/mid-combat/${sid}`, {
      body: JSON.stringify({ playerId: "player-1" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const body = (await r.json().catch(() => ({}))) as {
      ok?: boolean;
      seed?: {
        seeded?: boolean;
        battlefieldId?: string;
        attackerUnitId?: string;
        defenderUnitId?: string;
      };
    };
    console.error(
      `[scenario] mid-combat seed: ok=${r.ok} seeded=${body.seed?.seeded ?? "?"} bf=${body.seed?.battlefieldId ?? "?"} attacker=${body.seed?.attackerUnitId ?? "?"}`,
    );
  } catch (error) {
    console.error("[scenario] mid-combat seed error:", (error as Error).message);
  }
}

/**
 * Drive the engine into a finished/game-over state by calling the
 * server-side scenario seed endpoint (iter 16). Mutates `state.status` +
 * `state.winner` directly, bypassing the move pipeline. Mirrors the
 * mid-combat driver above.
 */
async function driveGameOver(
  apiBase: string,
  sessionId: string,
): Promise<void> {
  const sid = encodeURIComponent(sessionId);
  try {
    const r = await fetch(`${apiBase}/scenario/game-over/${sid}`, {
      body: JSON.stringify({ winner: "player-1" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const body = (await r.json().catch(() => ({}))) as {
      ok?: boolean;
      seed?: { seeded?: boolean; winnerId?: string };
    };
    console.error(
      `[scenario] game-over seed: ok=${r.ok} seeded=${body.seed?.seeded ?? "?"} winner=${body.seed?.winnerId ?? "?"}`,
    );
  } catch (error) {
    console.error("[scenario] game-over seed error:", (error as Error).message);
  }
}

const args = parseArgs(process.argv.slice(2));
const sessionId = sessionIdFromUrl(args.url);
// Patch the URL so the SPA receives the same session ID the driver uses.
const navigateUrl = ensureSessionParam(args.url, sessionId);
const apiBase = apiBaseFromUrl(args.url);

const browser = await puppeteer.launch({
  defaultViewport: { width: 1400, height: 1400 },
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
try {
  const page = await browser.newPage();
  page.on("console", (m) => console.error("[console]", m.type(), m.text()));
  page.on("pageerror", (e) => console.error("[pageerror]", e.message));
  await page.goto(navigateUrl, { timeout: 20000, waitUntil: "networkidle2" });
  // Wait a beat for state + card images to load.
  await new Promise((r) => setTimeout(r, 1500));

  if (args.scenario === "mid-combat") {
    console.error(
      `[scenario] mid-combat: driving session ${sessionId} via ${apiBase}`,
    );
    await driveMidCombat(apiBase, sessionId);
    // Force a refresh so the SPA picks up server state.
    await page.reload({ timeout: 20000, waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 1500));
  } else if (args.scenario === "game-over") {
    console.error(
      `[scenario] game-over: driving session ${sessionId} via ${apiBase}`,
    );
    await driveGameOver(apiBase, sessionId);
    await page.reload({ timeout: 20000, waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 1500));
  }

  await page.screenshot({ fullPage: true, path: args.out });
  console.log("[ok] wrote", args.out);
} catch (error) {
  console.error("[err]", (error as Error).message);
  process.exit(1);
} finally {
  await browser.close();
}
