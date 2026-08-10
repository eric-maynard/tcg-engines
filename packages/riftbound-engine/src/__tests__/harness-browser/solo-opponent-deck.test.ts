/**
 * Solo picker — "Opponent's deck" (gated — see _gate.ts): the Goldfish / VS
 * Claude dialog offers the bot's deck (Same as mine · Random from my decks ·
 * Your Saved Decks · Public Decks · Default starter) with the same rich picker
 * as the player's, remembers the choice in localStorage, and a Goldfish game
 * started with "mirror" seats the opponent with the player's own legend.
 * Server side: apps/riftbound-app/server/opponent-deck.ts (+ its unit test).
 *
 *   RB_BROWSER_TESTS=1 bun test packages/riftbound-engine/src/__tests__/harness-browser/solo-opponent-deck.test.ts
 */

import { afterEach, expect, test } from "bun:test";
import { P1 } from "../../harness";
import { BrowserBackend, attachBrowserGame } from "../../harness/browser";
import { BASE_URL, LIVE_TIMEOUT, describeLive } from "./_gate";
import { buildDeck } from "./_live";

type LaunchedBrowser = Awaited<ReturnType<typeof BrowserBackend.startBrowser>>;

let browser: LaunchedBrowser | undefined;
let backend: BrowserBackend | undefined;
let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.().catch(() => undefined);
  cleanup = undefined;
  await backend?.close().catch(() => undefined);
  backend = undefined;
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

/** Open /play fresh (no saved session) and land on the Goldfish picker with decks loaded. */
async function openGoldfishPicker(page: LaunchedBrowser["page"]): Promise<void> {
  await page.goto(`${BASE_URL}/play?cb=${Date.now()}`, { timeout: 20_000, waitUntil: "load" });
  await page.evaluate(`(() => { try { sessionStorage.removeItem("rb_game"); } catch (e) {} })()`);
  await page.goto(`${BASE_URL}/play?cb=${Date.now() + 1}`, { timeout: 20_000, waitUntil: "load" });
  await page.locator("#sandboxOption").first().click({ timeout: 10_000 });
  await until(page, `Boolean(document.querySelector("#soloDeckPicker:not(.hidden) #soloOppDeckSelect optgroup"))`);
}

describeLive("solo picker — Opponent's deck", () => {
  test(
    "dropdown under the Opponent selector with mirror / random / Your Saved Decks / Default starter groups (rich picker); choice persists in localStorage; Goldfish + 'mirror' ⇒ opponent legend = mine on the board",
    async () => {
      browser = await BrowserBackend.startBrowser({ viewport: { height: 1080, width: 1920 } });
      const page = browser.page;
      // Dev auto-login (cookie) so "Your Saved Decks" is populated; then save a calm/mind deck (≠ the fury/chaos starter legend).
      await page.goto(`${BASE_URL}/login`, { timeout: 20_000, waitUntil: "load" });
      await until(page, `document.cookie.includes("rb_token=")`);
      const cfg = await buildDeck({ domains: ["calm", "mind"] });
      const group = (ids: readonly string[], zone: string) => {
        const m = new Map<string, number>();
        for (const id of ids) {m.set(id, (m.get(id) ?? 0) + 1);}
        return [...m.entries()].map(([cardId, quantity]) => ({ cardId, quantity, zone }));
      };
      const deckName = `Mirror me ${Date.now()}`;
      const saved = await page.evaluate<{ id?: string; name?: string; legendName?: string; error?: string }>(`fetch("/api/saved-decks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(${JSON.stringify({
        cards: [...group(cfg.mainDeckCardIds, "main"), ...group(cfg.runeDeckCardIds, "rune"), ...group(cfg.battlefieldIds, "battlefield")],
        championId: cfg.championId,
        legendId: cfg.legendId,
        name: deckName,
      })}) }).then(r => r.json())`);
      expect(saved.error).toBeUndefined();
      const deckId = saved.id as string;
      cleanup = async () => {
        await page.evaluate(`fetch("/api/saved-decks/${deckId}", { method: "DELETE" })`).catch(() => undefined);
      };
      await page.evaluate(`localStorage.removeItem("rb-opponent-deck")`);

      // 1. The picker: an "Opponent's deck" select right after the Opponent row, dressed with the rich dropdown, with the groups.
      await openGoldfishPicker(page);
      const ui = await page.evaluate<{ label: string; afterOpponent: boolean; values: string[]; groups: string[]; ddGroups: string[]; hasDd: boolean; value: string; mineListed: boolean; playerHasIt: boolean }>(`(() => {
        const sel = document.getElementById("soloOppDeckSelect");
        const row = document.getElementById("soloOppDeckRow");
        const opp = document.getElementById("soloOpponent");
        const order = opp && row ? (opp.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 : false;
        const dd = sel && sel.nextElementSibling && sel.nextElementSibling.classList.contains("deck-dd") ? sel.nextElementSibling : null;
        return {
          label: row ? (row.querySelector("label") || {}).textContent || "" : "",
          afterOpponent: order,
          values: sel ? Array.from(sel.options).map(o => o.value) : [],
          groups: sel ? Array.from(sel.querySelectorAll("optgroup")).map(g => g.label) : [],
          ddGroups: dd ? Array.from(dd.querySelectorAll(".deck-dd-group")).map(g => g.textContent.trim()) : [],
          hasDd: Boolean(dd && dd.querySelector(".deck-dd-btn")),
          value: sel ? sel.value : "",
          mineListed: sel ? Array.from(sel.options).some(o => o.value === ${JSON.stringify(deckId)}) : false,
          playerHasIt: Array.from(document.getElementById("soloDeckSelect").options).some(o => o.value === ${JSON.stringify(deckId)}),
        };
      })()`);
      expect(ui.label).toBe("Opponent's deck");
      expect(ui.afterOpponent).toBe(true);
      expect(ui.hasDd).toBe(true);
      expect(ui.values.slice(0, 2)).toEqual(["mirror", "random-mine"]);
      expect(ui.values).toContain("default");
      expect(ui.mineListed).toBe(true);
      expect(ui.playerHasIt).toBe(true);
      expect(ui.groups).toContain("Your Saved Decks");
      expect(ui.groups.at(-1)).toBe("Default starter");
      expect(ui.ddGroups).toContain("Your Saved Decks");
      expect(ui.ddGroups).toContain("Default starter");
      expect(ui.value).toBe("mirror"); // default when nothing is remembered

      // Mirror chip follows the player's pick (legend · champion like the player's entry).
      await page.evaluate(`(() => { const s = document.getElementById("soloDeckSelect"); s.value = ${JSON.stringify(deckId)}; s.dispatchEvent(new Event("change")); })()`);
      const chip = await page.evaluate<string>(`document.querySelector("#soloOppDeckSelect + .deck-dd .deck-dd-btn .deck-dd-sub")?.textContent || ""`);
      expect(chip).toContain(deckName);
      if (saved.legendName) {expect(chip).toContain(saved.legendName);}

      // 2. Persistence: pick my saved deck for the bot → localStorage; a fresh visit restores it.
      await page.evaluate(`(() => { const s = document.getElementById("soloOppDeckSelect"); s.value = ${JSON.stringify(deckId)}; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
      expect(await page.evaluate<string | null>(`localStorage.getItem("rb-opponent-deck")`)).toBe(deckId);
      const btnText = await page.evaluate<string>(`document.querySelector("#soloOppDeckSelect + .deck-dd .deck-dd-name")?.textContent || ""`);
      expect(btnText).toBe(deckName);
      await openGoldfishPicker(page);
      expect(await page.evaluate<string>(`document.getElementById("soloOppDeckSelect").value`)).toBe(deckId);

      // 3. Goldfish with "mirror": my saved deck for me, "Same as mine" for the bot → Play → keep the opening hand.
      await page.evaluate(`(() => {
        const mineSel = document.getElementById("soloDeckSelect"); mineSel.value = ${JSON.stringify(deckId)}; mineSel.dispatchEvent(new Event("change", { bubbles: true }));
        const s = document.getElementById("soloOppDeckSelect"); s.value = "mirror"; s.dispatchEvent(new Event("change", { bubbles: true }));
        const duel = document.querySelector('input[name="soloMode"][value="duel"]'); if (duel) { duel.checked = true; }
      })()`);
      expect(await page.evaluate<string | null>(`localStorage.getItem("rb-opponent-deck")`)).toBe("mirror");
      await page.locator("#soloDeckPicker .start-btn").first().click({ timeout: 10_000 });
      const deadline = Date.now() + 25_000;
      for (;;) {
        const st = await page.evaluate<string>(
          `(() => { const err = document.getElementById("soloDeckStatus"); if (err && /#d04040|rgb\\(208, 64, 64\\)/.test(err.style.color || "")) return "error:" + err.textContent; const gs = window.__rbGameState; if (gs && gs.status === "playing" && !(typeof pregameState !== "undefined" && pregameState && pregameState.phase)) return "ready"; const ov = document.querySelector("#pregameOverlay.visible"); const keep = ov && (ov.querySelector(".mulligan-btn-keep") || ov.querySelector("button:not([disabled])")); if (keep) { keep.click(); return "keep"; } return "wait"; })()`,
        );
        if (st === "ready") {break;}
        if (st.startsWith("error:")) {throw new Error(`solo start failed: ${st}`);}
        if (Date.now() > deadline) {throw new Error("goldfish mirror game: board did not become playable");}
        await page.waitForTimeout(300);
      }
      backend = await BrowserBackend.launch({ baseUrl: BASE_URL, navigate: false, page, seat: P1 });
      const game = attachBrowserGame(backend);
      const defOf = (id: unknown) => String(id ?? "").replace(/^player-\d-legend-/, "");
      expect(defOf(game.p1.legend())).toBe(cfg.legendId as string);
      expect(defOf(game.p2.legend())).toBe(defOf(game.p1.legend()));
      // …and on the rendered board: the opponent's legend/champion strip shows the same definitions as mine.
      const board = await page.evaluate<{ mine: string[]; theirs: string[] }>(`(() => ({
        mine: Array.from(document.querySelectorAll("#player-legendChampion .card[data-def-id]")).map(c => c.dataset.defId),
        theirs: Array.from(document.querySelectorAll("#opponent-legendChampion .card[data-def-id]")).map(c => c.dataset.defId),
      }))()`);
      expect(board.mine.length).toBeGreaterThan(0);
      expect(board.mine).toContain(cfg.legendId as string);
      expect([...board.theirs].sort()).toEqual([...board.mine].sort());
      expect(browser.pageErrors.filter((e) => !/favicon|card-image/.test(e))).toEqual([]);
    },
    LIVE_TIMEOUT * 2,
  );
});
