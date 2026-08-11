/**
 * Menu stability (gated — see _gate.ts): the Play menu's solo deck picker and
 * the lobby room keep a fixed footprint while the player changes selections —
 * deck (short / very long name, legality chip, thumbnail), Opponent, Opponent's
 * deck, Bo1/Bo3, opening a rich dropdown. The panel's and the Start/Play
 * button's getBoundingClientRect must be identical before/after every change.
 *
 *   RB_BROWSER_TESTS=1 bun test packages/riftbound-engine/src/__tests__/harness-browser/menu-stability.test.ts
 *   (RB_MENU_SHOTS=<dir> additionally writes a screenshot per step.)
 */

import { afterEach, expect, test } from "bun:test";
import { BrowserBackend } from "../../harness/browser";
import { BASE_URL, LIVE_TIMEOUT, describeLive } from "./_gate";
import { buildDeck } from "./_live";

type LaunchedBrowser = Awaited<ReturnType<typeof BrowserBackend.startBrowser>>;
type Page = LaunchedBrowser["page"];

let browser: LaunchedBrowser | undefined;
const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const c of cleanups.splice(0)) {
    await c().catch(() => undefined);
  }
  await browser?.shutdown().catch(() => undefined);
  browser = undefined;
});

interface Box {
  readonly l: number;
  readonly t: number;
  readonly w: number;
  readonly h: number;
}

const SHOTS = process.env.RB_MENU_SHOTS;

async function until(page: Page, script: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    // A navigation mid-poll (e.g. /login auto-redirect) destroys the context: just poll again.
    if (await page.evaluate<boolean>(script).catch(() => false)) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for: ${script}`);
    }
    await page.waitForTimeout(200);
  }
}

/** Rounded rects of `selectors` (missing / display:none ⇒ null). */
async function rects(page: Page, selectors: readonly string[]): Promise<Record<string, Box | null>> {
  return page.evaluate<Record<string, Box | null>>(`(() => {
    const out = {};
    for (const s of ${JSON.stringify(selectors)}) {
      const el = document.querySelector(s);
      if (!el) { out[s] = null; continue; }
      const r = el.getBoundingClientRect();
      out[s] = (r.width === 0 && r.height === 0) ? null : { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
    }
    return out;
  })()`);
}

function diff(base: Record<string, Box | null>, now: Record<string, Box | null>): string[] {
  const out: string[] = [];
  for (const k of Object.keys(base)) {
    if (JSON.stringify(base[k]) !== JSON.stringify(now[k])) {
      out.push(`${k}: ${JSON.stringify(base[k])} → ${JSON.stringify(now[k])}`);
    }
  }
  return out;
}

/** Dev auto-login, then save two decks: one with a very long name (calm/mind), one short (fury/chaos). */
async function loginAndSaveDecks(page: Page): Promise<{ longId: string; shortId: string; longName: string; shortName: string }> {
  await page.goto(`${BASE_URL}/login`, { timeout: 20_000, waitUntil: "load" });
  await until(page, `document.cookie.includes("rb_token=")`);
  // The login page redirects once the cookie lands; park on a static page before issuing fetches.
  await page.goto(`${BASE_URL}/decks?cb=${Date.now()}`, { timeout: 20_000, waitUntil: "load" });
  const group =(ids: readonly string[], zone: string) => {
    const m = new Map<string, number>();
    for (const id of ids) {
      m.set(id, (m.get(id) ?? 0) + 1);
    }
    return [...m.entries()].map(([cardId, quantity]) => ({ cardId, quantity, zone }));
  };
  const save = async (name: string, domains: readonly [string, string]): Promise<string> => {
    const cfg = await buildDeck({ domains });
    const saved = await page.evaluate<{ id?: string; error?: string }>(`fetch("/api/saved-decks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(${JSON.stringify({
      cards: [...group(cfg.mainDeckCardIds, "main"), ...group(cfg.runeDeckCardIds, "rune"), ...group(cfg.battlefieldIds, "battlefield")],
      championId: cfg.championId,
      legendId: cfg.legendId,
      name,
    })}) }).then(r => r.json())`);
    expect(saved.error).toBeUndefined();
    const id = saved.id as string;
    cleanups.push(async () => {
      await page.evaluate(`fetch("/api/saved-decks/${id}", { method: "DELETE" })`).catch(() => undefined);
    });
    return id;
  };
  const longName = `Menu stability — an absurdly long saved deck name that would stretch any shrink-to-fit panel well past its siblings ${Date.now()}`;
  const shortName = `MS ${Date.now() % 1000}`;
  const longId = await save(longName, ["calm", "mind"]);
  const shortId = await save(shortName, ["fury", "chaos"]);
  return { longId, longName, shortId, shortName };
}

async function freshPlay(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/play?cb=${Date.now()}`, { timeout: 20_000, waitUntil: "load" });
  await page.evaluate(`(() => { try { sessionStorage.removeItem("rb_game"); localStorage.removeItem("rb-opponent-deck"); localStorage.removeItem("rb-opponent"); } catch (e) {} })()`);
  await page.goto(`${BASE_URL}/play?cb=${Date.now() + 1}`, { timeout: 20_000, waitUntil: "load" });
}

interface Step {
  readonly label: string;
  readonly script: string;
}

/** Run each step, re-measure, screenshot; return every rect drift vs. `base`. */
async function drive(page: Page, tag: string, watch: readonly string[], steps: readonly Step[]): Promise<string[]> {
  await page.mouse.move(2, 2);
  await page.waitForTimeout(250);
  const base = await rects(page, watch);
  for (const s of watch) {
    expect(base[s], `${tag}: ${s} should be rendered before the first step`).not.toBeNull();
  }
  if (SHOTS) {
    await page.screenshot({ path: `${SHOTS}/${tag}-00-base.png` });
  }
  const drifts: string[] = [];
  let i = 0;
  for (const step of steps) {
    i++;
    await page.evaluate(`(async () => { ${step.script}; })()`);
    await page.waitForTimeout(250);
    const now = await rects(page, watch);
    for (const d of diff(base, now)) {
      drifts.push(`[${step.label}] ${d}`);
    }
    if (SHOTS) {
      await page.screenshot({ path: `${SHOTS}/${tag}-${String(i).padStart(2, "0")}-${step.label.replace(/[^a-z0-9]+/gi, "-")}.png` });
    }
  }
  return drifts;
}

// Step scripts are statement lists run inside an async IIFE (see drive()).
const pick = (selectId: string, value: string) =>
  `{ const s = document.getElementById(${JSON.stringify(selectId)}); s.value = ${JSON.stringify(value)}; s.dispatchEvent(new Event("change", { bubbles: true })); }`;
const openDd = (selectId: string) =>
  `{ const b = document.querySelector("#" + ${JSON.stringify(selectId)} + " + .deck-dd .deck-dd-btn"); if (b) b.click(); }`;
const closeDds = `document.body.click()`;
const settle = `await new Promise(r => setTimeout(r, 400))`;

describeLive("menu stability — pickers keep their size while selecting", () => {
  test(
    "solo picker: panel + Play button + rows keep identical rects across deck / opponent / opponent-deck / Bo1-Bo3 changes and with a dropdown open",
    async () => {
      browser = await BrowserBackend.startBrowser({ viewport: { height: 1080, width: 1920 } });
      const page = browser.page;
      const decks = await loginAndSaveDecks(page);
      await freshPlay(page);
      await page.locator("#sandboxOption").first().click({ timeout: 10_000 });
      await until(page, `Boolean(document.querySelector("#soloDeckPicker:not(.hidden) #soloOppDeckSelect optgroup")) && Boolean(document.getElementById("soloOpponent"))`);
      await until(page, `Array.from(document.getElementById("soloDeckSelect").options).some(o => o.value === ${JSON.stringify(decks.longId)})`);

      const watch = ["#soloDeckPicker", "#soloDeckPicker .start-btn", "#soloDeckSelect + .deck-dd .deck-dd-btn", ".ai-opp-row", "#soloOppDeckRow", "#soloOppDeckSelect + .deck-dd .deck-dd-btn"];
      const steps: Step[] = [
        { label: "deck→long", script: pick("soloDeckSelect", decks.longId) },
        { label: "deck→short", script: pick("soloDeckSelect", decks.shortId) },
        { label: "open deck dropdown", script: openDd("soloDeckSelect") },
        { label: "close dropdowns", script: closeDds },
        { label: "opponent→haiku", script: pick("soloOpponent", "haiku") },
        { label: "opponent→goldfish", script: pick("soloOpponent", "goldfish") },
        { label: "oppdeck→random-mine", script: pick("soloOppDeckSelect", "random-mine") },
        { label: "oppdeck→default", script: pick("soloOppDeckSelect", "default") },
        { label: "oppdeck→long", script: pick("soloOppDeckSelect", decks.longId) },
        { label: "open oppdeck dropdown", script: openDd("soloOppDeckSelect") },
        { label: "close dropdowns 2", script: closeDds },
        { label: "oppdeck→mirror", script: pick("soloOppDeckSelect", "mirror") },
        { label: "mode→Bo3", script: `document.querySelector('input[name="soloMode"][value="match"]').click()` },
        { label: "deck→default", script: pick("soloDeckSelect", "default") },
      ];
      const drifts = await drive(page, "solo", watch, steps);
      expect(drifts).toEqual([]);
      expect(browser.pageErrors.filter((e) => !/favicon|card-image/.test(e))).toEqual([]);
    },
    LIVE_TIMEOUT * 2,
  );

  test(
    "lobby room: panel + Start button + seat cards keep identical rects across deck changes, Duel/Match, and with the dropdown open",
    async () => {
      browser = await BrowserBackend.startBrowser({ viewport: { height: 1080, width: 1920 } });
      const page = browser.page;
      const decks = await loginAndSaveDecks(page);
      await freshPlay(page);
      await page.locator("#lobbyMenu .mode-card").first().click({ timeout: 10_000 });
      await until(page, `Boolean(document.querySelector("#lobbyRoom:not(.hidden)")) && Array.from(document.getElementById("deckSelect").options).some(o => o.value === ${JSON.stringify(decks.longId)}) && /\\S/.test(document.getElementById("lobbyHost").textContent)`);
      cleanups.unshift(async () => {
        await page.evaluate(`typeof leaveLobby === "function" && leaveLobby()`).catch(() => undefined);
      });

      const watch = ["#lobbyRoom", "#lobbyStartBtn", "#lobbyHost", "#lobbyGuest", "#deckSelect + .deck-dd .deck-dd-btn", "#modeSelector"];
      const steps: Step[] = [
        { label: "deck→default", script: `${pick("deckSelect", "default")}; ${settle}` },
        { label: "deck→long", script: `${pick("deckSelect", decks.longId)}; ${settle}` },
        { label: "open deck dropdown", script: openDd("deckSelect") },
        { label: "close dropdowns", script: closeDds },
        { label: "deck→short", script: `${pick("deckSelect", decks.shortId)}; ${settle}` },
        { label: "mode→match", script: `setGameMode("match"); ${settle}` },
        { label: "mode→duel", script: `setGameMode("duel"); ${settle}` },
        { label: "deck→none", script: `${pick("deckSelect", "")}; ${settle}` },
      ];
      const drifts = await drive(page, "lobby", watch, steps);
      expect(drifts).toEqual([]);
      expect(browser.pageErrors.filter((e) => !/favicon|card-image|WebSocket/.test(e))).toEqual([]);
    },
    LIVE_TIMEOUT * 2,
  );
});
