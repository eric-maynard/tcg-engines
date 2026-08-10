/**
 * /decks — "Import from text" modal + My Decks rows (gated — see _gate.ts).
 *
 *  - the modal opens EMPTY every time (no text / name / errors carried over);
 *  - a successful import saves (POST /api/saved-decks/import), closes the modal,
 *    refreshes My Decks, highlights the new row and toasts "Imported <name> — Legal ✓ | ⚠ n issues";
 *  - a failed import (nothing recognized) keeps the modal open with the paste and the error;
 *  - rows show the legend art as an <img alt=legend name> (+ champion), counts, legality — no colour-chip block;
 *  - the lobby deck picker rows carry the same legend thumbnail.
 *
 *   RB_BROWSER_TESTS=1 bun test packages/riftbound-engine/src/__tests__/harness-browser/decks-page.test.ts
 */

import { afterEach, expect, test } from "bun:test";
import { loadDefaultCardPool } from "../../harness";
import { BrowserBackend } from "../../harness/browser";
import { BASE_URL, LIVE_TIMEOUT, describeLive } from "./_gate";
import { buildDeck } from "./_live";

type LaunchedBrowser = Awaited<ReturnType<typeof BrowserBackend.startBrowser>>;

let browser: LaunchedBrowser | undefined;
let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.().catch(() => undefined);
  cleanup = undefined;
  await browser?.shutdown().catch(() => undefined);
  browser = undefined;
});

async function until(page: LaunchedBrowser["page"], script: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await page.evaluate<boolean>(script)) {return;}
    if (Date.now() > deadline) {throw new Error(`timed out waiting for: ${script}`);}
    await page.waitForTimeout(150);
  }
}

/** The starter-shaped paste (Legend / Champion / MainDeck / Battlefields / Runes) for a legal two-domain deck from the pool. */
async function legalDeckText(): Promise<{ text: string; legendName: string }> {
  const cfg = await buildDeck({ domains: ["calm", "mind"] });
  const pool = await loadDefaultCardPool();
  const byId = new Map(pool.all().map((c) => [c.id as string, c.name as string]));
  const name = (id: string) => byId.get(id) as string;
  const group = (ids: readonly string[]) => {
    const m = new Map<string, number>();
    for (const id of ids) {m.set(name(id), (m.get(name(id)) ?? 0) + 1);}
    return [...m].map(([n, c]) => `${c} ${n}`).join("\n");
  };
  const text = [
    `Legend:\n1 ${name(cfg.legendId as string)}`,
    `Champion:\n1 ${name(cfg.championId as string)}`,
    `MainDeck:\n${group(cfg.mainDeckCardIds)}`,
    `Battlefields:\n${group(cfg.battlefieldIds)}`,
    `Runes:\n${group(cfg.runeDeckCardIds)}`,
  ].join("\n\n");
  return { legendName: name(cfg.legendId as string), text };
}

const modalState = `(() => ({
  open: document.getElementById("importOverlay").classList.contains("visible"),
  text: document.getElementById("importText").value,
  name: document.getElementById("importName").value,
  result: document.getElementById("importResult").textContent,
}))()`;

describeLive("/decks — import modal + My Decks rows", () => {
  test(
    "modal opens empty each time; success ⇒ saved + closed + listed + highlighted + toast; failure ⇒ stays open with errors; rows show legend <img> (alt = legend) and no colour chips",
    async () => {
      browser = await BrowserBackend.startBrowser({ viewport: { height: 900, width: 1300 } });
      const page = browser.page;
      const { text, legendName } = await legalDeckText();
      const deckName = `Import me ${Date.now()}`;

      await page.goto(`${BASE_URL}/decks?cb=${Date.now()}`, { timeout: 20_000, waitUntil: "load" });
      // Dev auto-login lands on the signed-in list (Logout button in the header).
      await until(page, `Boolean(document.querySelector("#authBar .auth-logout"))`);

      // 1. Open → type something → close → reopen: everything is blank again.
      await page.locator("#btnImportPaste").first().click({ timeout: 10_000 });
      await until(page, `document.getElementById("importOverlay").classList.contains("visible")`);
      await page.evaluate(`(() => { document.getElementById("importText").value = "3 leftover line"; document.getElementById("importName").value = "leftover"; document.getElementById("importResult").textContent = "old error"; })()`);
      await page.locator("#importOverlay .confirm-cancel").first().click({ timeout: 10_000 });
      await until(page, `!document.getElementById("importOverlay").classList.contains("visible")`);
      await page.locator("#btnImportPaste").first().click({ timeout: 10_000 });
      await until(page, `document.getElementById("importOverlay").classList.contains("visible")`);
      expect(await page.evaluate<{ open: boolean; text: string; name: string; result: string }>(modalState)).toEqual({ name: "", open: true, result: "", text: "" });

      // 2. Successful import: saved server-side, modal closed, row listed + highlighted, toast names the deck and its verdict.
      await page.evaluate(`(() => { document.getElementById("importText").value = ${JSON.stringify(text)}; document.getElementById("importName").value = ${JSON.stringify(deckName)}; })()`);
      await page.locator("#importGoBtn").first().click({ timeout: 10_000 });
      await until(page, `!document.getElementById("importOverlay").classList.contains("visible") && Boolean(document.querySelector(".deck-card.dc-new"))`);
      const after = await page.evaluate<{ toastVisible: boolean; toastTitle: string; toastBody: string; newName: string; newId: string; imgAlt: string | null; imgSrc: string | null; champImg: boolean; chips: number; counts: string; hasLegal: boolean }>(`(() => {
        const row = document.querySelector(".deck-card.dc-new");
        const img = row && row.querySelector("img.dc-legend-img");
        return {
          toastVisible: document.getElementById("toast").classList.contains("visible"),
          toastTitle: document.getElementById("toastTitle").textContent,
          toastBody: document.getElementById("toastBody").textContent,
          newName: row ? row.querySelector(".dc-name").textContent : "",
          newId: row ? row.dataset.deckId : "",
          imgAlt: img ? img.getAttribute("alt") : null,
          imgSrc: img ? img.getAttribute("src") : null,
          champImg: Boolean(row && row.querySelector(".dc-champ img")),
          chips: document.querySelectorAll(".domain-badge").length,
          counts: row ? row.querySelector(".dc-counts").textContent.replace(/\\s+/g, " ").trim() : "",
          hasLegal: Boolean(row && row.querySelector(".dc-legal")),
        };
      })()`);
      cleanup = async () => {
        if (after.newId) {await page.evaluate(`fetch("/api/saved-decks/${after.newId}", { method: "DELETE", headers: { Authorization: "Bearer " + (localStorage.getItem("rb_token") || "") } })`).catch(() => undefined);}
      };
      expect(after.toastVisible).toBe(true);
      expect(after.toastTitle).toBe(`Imported ${deckName}`);
      expect(after.toastBody).toMatch(/Legal ✓|⚠ \d+ issue/);
      expect(after.newName).toBe(deckName);
      expect(after.imgAlt).toBe(legendName);
      expect(after.imgSrc).toMatch(/^\/card-image\//);
      expect(after.champImg).toBe(true);
      expect(after.chips).toBe(0);
      expect(after.counts).toMatch(/^\d+ main · \d+ side · 12 runes$/);
      expect(after.hasLegal).toBe(true);
      // Saved server-side: the list endpoint has it.
      const listed = await page.evaluate<boolean>(`fetch("/api/saved-decks", { headers: { Authorization: "Bearer " + (localStorage.getItem("rb_token") || "") } }).then(r => r.json()).then(rows => rows.some(r => r.id === ${JSON.stringify(after.newId)}))`);
      expect(listed).toBe(true);

      // 3. Reopen after a success: blank again (nothing preserved from the imported paste).
      await page.locator("#btnImportPaste").first().click({ timeout: 10_000 });
      await until(page, `document.getElementById("importOverlay").classList.contains("visible")`);
      expect(await page.evaluate<{ open: boolean; text: string; name: string; result: string }>(modalState)).toEqual({ name: "", open: true, result: "", text: "" });

      // 4. Failed import (nothing recognized): modal stays open with the paste and the error; no toast change, no new row.
      const rowsBefore = await page.evaluate<number>(`document.querySelectorAll(".deck-card").length`);
      await page.evaluate(`(() => { document.getElementById("importText").value = "3 Totally Made Up Card"; })()`);
      await page.locator("#importGoBtn").first().click({ timeout: 10_000 });
      await until(page, `document.querySelector("#importResult").classList.contains("err") && !document.getElementById("importGoBtn").disabled`);
      const failed = await page.evaluate<{ open: boolean; text: string; name: string; result: string }>(modalState);
      expect(failed.open).toBe(true);
      expect(failed.text).toBe("3 Totally Made Up Card");
      expect(failed.result.length).toBeGreaterThan(0);
      expect(await page.evaluate<number>(`document.querySelectorAll(".deck-card").length`)).toBe(rowsBefore);

      // 5. Lobby / solo deck picker rows carry the legend thumbnail too (same /card-image/ URL, alt = legend).
      await page.goto(`${BASE_URL}/play?cb=${Date.now()}`, { timeout: 20_000, waitUntil: "load" });
      await page.evaluate(`(() => { try { sessionStorage.removeItem("rb_game"); } catch (e) {} })()`);
      await page.goto(`${BASE_URL}/play?cb=${Date.now() + 1}`, { timeout: 20_000, waitUntil: "load" });
      await page.locator("#sandboxOption").first().click({ timeout: 10_000 });
      await until(page, `(() => { const o = document.querySelector("#soloDeckPicker:not(.hidden) #soloDeckSelect optgroup option"); return Boolean(o && document.querySelector('#soloDeckSelect + .deck-dd .deck-dd-item[data-value="' + o.value + '"]')); })()`);
      const thumb = await page.evaluate<{ alt: string | null; src: string | null }>(`(() => {
        const firstSaved = document.querySelector("#soloDeckSelect optgroup option").value;
        const item = document.querySelector('#soloDeckSelect + .deck-dd .deck-dd-item[data-value="' + firstSaved + '"] .deck-dd-thumb img');
        return { alt: item ? item.getAttribute("alt") : null, src: item ? item.getAttribute("src") : null };
      })()`);
      expect(thumb.src).toMatch(/^\/card-image\//);
      expect((thumb.alt ?? "").length).toBeGreaterThan(0);
    },
    LIVE_TIMEOUT,
  );
});
