/**
 * Live sideboarding affordance (gated — see _gate.ts): a deck with a
 * sideboard gets the pregame "Sideboarding" step after the battlefield reveal;
 * a swap updates both columns; Lock in proceeds to the mulligan with a freshly
 * drawn 4-card hand. Policy: apps/riftbound-app/server/pregame.ts §Sideboarding.
 *
 *   RB_BROWSER_TESTS=1 bun test packages/riftbound-engine/src/__tests__/harness-browser/sideboard.test.ts
 */

import { afterEach, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool } from "../../harness";
import { BrowserBackend } from "../../harness/browser";
import { BASE_URL, LIVE_TIMEOUT, describeLive } from "./_gate";
import { buildDeck } from "./_live";

type LaunchedBrowser = Awaited<ReturnType<typeof BrowserBackend.startBrowser>>;

let browser: LaunchedBrowser | undefined;

afterEach(async () => {
  await browser?.shutdown().catch(() => undefined);
  browser = undefined;
});

async function until(page: LaunchedBrowser["page"], script: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await page.evaluate<boolean>(script)) {return;}
    if (Date.now() > deadline) {throw new Error(`timed out waiting for: ${script}`);}
    await page.waitForTimeout(200);
  }
}

describeLive("sideboarding — pregame overlay step", () => {
  test(
    "deck with a Sideboard ⇒ overlay appears with Main deck / Sideboard columns + opponent reveal; a swap updates both columns; Lock in proceeds to the mulligan",
    async () => {
      const deck1 = await buildDeck();
      const pool = await loadDefaultCardPool();
      const doms = (c: { domain?: unknown }) => (Array.isArray(c.domain) ? (c.domain as string[]) : c.domain ? [c.domain as string] : []);
      const side = pool
        .all()
        .filter((c) => c.cardType === "spell" && typeof c.id === "string" && !deck1.mainDeckCardIds.includes(c.id) && doms(c).length > 0 && doms(c).every((d) => d === "fury" || d === "chaos"))
        .slice(0, 3)
        .map((c) => c.id as string);
      expect(side).toHaveLength(3);
      const deck2 = await buildDeck();

      const res = await fetch(`${BASE_URL}/api/game/create`, {
        body: JSON.stringify({ deck1: { ...deck1, sideboardCardIds: side }, deck2, sandbox: true }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as { gameId?: string; error?: string };
      expect({ error: body.error, ok: res.ok }).toEqual({ error: undefined, ok: true });

      browser = await BrowserBackend.startBrowser({ viewport: { height: 1080, width: 1920 } });
      const page = browser.page;
      await page.goto(`${BASE_URL}/login`, { timeout: 20_000, waitUntil: "load" });
      const rb = { gameId: body.gameId, isSandbox: true, lobbyRole: "host", playerNames: { [P1]: "Tester", [P2]: "Goldfish" }, viewingPlayer: P1 };
      await page.evaluate(`sessionStorage.setItem("rb_game", ${JSON.stringify(JSON.stringify(rb))}); localStorage.setItem("rb-skip-sideboarding", "0")`);
      await page.goto(`${BASE_URL}/play?cb=${Date.now()}`, { timeout: 20_000, waitUntil: "load" });

      // The step shows up (phase "sideboard"), before any hand exists.
      await until(page, `Boolean(document.querySelector("#pregameOverlay.visible #sbColumns"))`);
      const first = await page.evaluate<{ phase: string; title: string; mainRows: number; sideRows: number; sideCount: string; swaps: string; opp: string; hand: number; lockDisabled: boolean }>(`(() => ({
        phase: pregameState && pregameState.phase,
        title: document.querySelector("#pregameContent .pregame-title")?.textContent || "",
        mainRows: document.querySelectorAll("#sbMainList .sideboard-overlay__row").length,
        sideRows: document.querySelectorAll("#sbSideList .sideboard-overlay__row").length,
        sideCount: document.getElementById("sbSideCount")?.textContent || "",
        swaps: document.getElementById("sbSwapCount")?.textContent || "",
        opp: document.getElementById("sbOpponent")?.textContent || "",
        hand: ((window.__rbGameState && window.__rbGameState.zones && window.__rbGameState.zones.hand) || []).filter((c) => c.owner === "${P1}").length,
        lockDisabled: Boolean(document.getElementById("sbLockBtn")?.disabled),
      }))()`);
      expect(first.phase).toBe("sideboard");
      expect(first.title).toBe("Sideboarding");
      expect(first.mainRows).toBeGreaterThan(0);
      expect(first.sideRows).toBe(3);
      expect(first.sideCount).toBe("3");
      expect(first.swaps).toBe("0");
      expect(first.opp).toContain("Legend");
      expect(first.opp).toContain("Battlefield");
      expect(first.opp).toContain("Locked in"); // Goldfish seat auto-locks
      expect(first.hand).toBe(0);
      expect(first.lockDisabled).toBe(false);

      // Click a main-deck row, then a sideboard row ⇒ one swap; both columns show the crossing.
      const outDef = await page.locator("#sbMainList .sideboard-overlay__row").first().getAttribute("data-def-id");
      const inDef = await page.locator("#sbSideList .sideboard-overlay__row").first().getAttribute("data-def-id");
      await page.locator("#sbMainList .sideboard-overlay__row").first().click();
      await page.locator("#sbSideList .sideboard-overlay__row").first().click();
      await until(page, `document.getElementById("sbSwapCount")?.textContent === "1"`);
      const after = await page.evaluate<{ inMain: boolean; outSide: boolean; badgeIn: number; badgeOut: number; sideCount: string; undo: number }>(`(() => ({
        inMain: Boolean(document.querySelector('#sbMainList .sideboard-overlay__row[data-def-id="${inDef}"]')),
        outSide: Boolean(document.querySelector('#sbSideList .sideboard-overlay__row[data-def-id="${outDef}"]')),
        badgeIn: document.querySelectorAll("#sbMainList .sb-badge--in").length,
        badgeOut: document.querySelectorAll("#sbSideList .sb-badge--out").length,
        sideCount: document.getElementById("sbSideCount")?.textContent || "",
        undo: document.querySelectorAll("#sbSwaps .sb-undo").length,
      }))()`);
      expect(after).toEqual({ badgeIn: 1, badgeOut: 1, inMain: true, outSide: true, sideCount: "3", undo: 1 });

      // Lock in ⇒ mulligan with a 4-card hand (drawn only now).
      await page.locator("#sbLockBtn").click();
      await until(page, `Boolean(pregameState && pregameState.phase === "mulligan" && document.querySelector("#pregameOverlay.visible .mulligan-btn-keep"))`);
      const mull = await page.evaluate<{ cards: number; sb: boolean }>(`(() => ({
        cards: document.querySelectorAll("#mulliganHandCards .card").length,
        sb: Boolean(document.getElementById("sbColumns")),
      }))()`);
      expect(mull).toEqual({ cards: 4, sb: false });
      expect(browser.pageErrors.filter((e) => !/favicon|card-image/.test(e))).toEqual([]);
    },
    LIVE_TIMEOUT,
  );
});
