/**
 * Pregame affordances vs a bot (gated — see _gate.ts):
 *  - Bo3 vs Goldfish — ORDER: "Choose Your Battlefield" FIRST (rules 113 /
 *    486.5; three options as card images, hover = full text, lock-in is final:
 *    options disabled, "Locked: X — waiting…", a second raw WS pick gets an error
 *    frame; the Goldfish has already picked server-side), THEN the d20 roll
 *    overlay (rule 115; both dice + who won; the human chooses when it wins —
 *    the answer goes on the game socket —, the bot elects to go first when it
 *    wins), then the mulligan; every pregame screen has a "Leave match" button
 *    that returns to the play menu and frees the game.
 *  - "Skip animations in practice games" restores the instant start (no overlay).
 * Server side: apps/riftbound-app/server/pregame.ts (runBotPregame,
 * selectBattlefield, abandonPregame) + server/__tests__/pregame-bot.test.ts.
 *
 *   RB_BROWSER_TESTS=1 bun test packages/riftbound-engine/src/__tests__/harness-browser/pregame.test.ts
 */

import { afterEach, expect, test } from "bun:test";
import { BrowserBackend } from "../../harness/browser";
import { BASE_URL, LIVE_TIMEOUT, describeLive } from "./_gate";

type LaunchedBrowser = Awaited<ReturnType<typeof BrowserBackend.startBrowser>>;
type Page = LaunchedBrowser["page"];

let browser: LaunchedBrowser | undefined;

afterEach(async () => {
  await browser?.shutdown().catch(() => undefined);
  browser = undefined;
});

async function until(page: Page, script: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await page.evaluate<boolean>(script)) {return;}
    if (Date.now() > deadline) {throw new Error(`timed out waiting for: ${script}`);}
    await page.waitForTimeout(100);
  }
}

/** Fresh /play (no saved session), Goldfish picker open, Bo1/Bo3 chosen, animation preference set. */
async function openGoldfishPicker(page: Page, mode: "duel" | "match", skipAnimations: boolean): Promise<void> {
  await page.goto(`${BASE_URL}/play?cb=${Date.now()}`, { timeout: 20_000, waitUntil: "load" });
  await page.evaluate(`(() => { try { sessionStorage.removeItem("rb_game"); localStorage.setItem("rb-skip-pregame-animations", ${skipAnimations ? '"1"' : '"0"'}); localStorage.setItem("rb-opponent-deck", "mirror"); } catch (e) {} })()`);
  await page.goto(`${BASE_URL}/play?cb=${Date.now() + 1}`, { timeout: 20_000, waitUntil: "load" });
  await page.locator("#sandboxOption").first().click({ timeout: 10_000 });
  await until(page, `Boolean(document.querySelector("#soloDeckPicker:not(.hidden)"))`);
  await page.evaluate(`(() => {
    const m = document.querySelector('input[name="soloMode"][value="${mode}"]'); if (m) m.checked = true;
    // Watch the roll overlay so an instant start can prove it never appeared.
    window.__coinSeen = Boolean(document.querySelector("#coinOverlay.visible"));
    new MutationObserver(() => { if (document.querySelector("#coinOverlay.visible")) window.__coinSeen = true; })
      .observe(document.getElementById("coinOverlay"), { attributes: true, attributeFilter: ["class"] });
  })()`);
}

const leaveBtnProbe = `(() => { const b = document.getElementById("pregameLeaveBtn"); if (!b) return null; const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { text: b.textContent.trim(), visible: r.width > 0 && r.height > 0, onTop: top === b }; })()`;

describeLive("pregame vs a bot — roll overlay, card-art battlefield picker, final lock-in, Leave match", () => {
  test(
    "Bo3 vs Goldfish: battlefield picker FIRST (card images, hover text, final lock-in — UI + raw WS refused) → THEN the roll overlay (both dice + winner; human chooses / bot decides) → mulligan → Leave match returns to the menu and frees the game",
    async () => {
      browser = await BrowserBackend.startBrowser({ viewport: { height: 900, width: 1440 } });
      const page = browser.page;
      await openGoldfishPicker(page, "match", false);
      // The preference toggle is offered in the picker, unchecked by default state we set.
      expect(await page.evaluate<boolean | null>(`(() => { const t = document.getElementById("soloSkipAnimToggle"); return t ? t.checked : null; })()`)).toBe(false);
      await page.locator("#soloDeckPicker .start-btn").first().click({ timeout: 10_000 });

      // 1. Battlefield picker FIRST (rules 113 / 486.5 before 115): three card-image options, name under the art, Leave button on top — and NO roll yet.
      await until(page, `Boolean(document.querySelector("#pregameOverlay.visible #bfChoices .bf-choice"))`, 20_000);
      expect(await page.evaluate<boolean>(`window.__coinSeen`)).toBe(false);
      expect(await page.evaluate<string>(`(document.querySelector("#pregameContent .pregame-info") || {}).textContent || ""`)).toMatch(/decided after battlefields are locked/);
      const picker = await page.evaluate<{ n: number; imgs: number; names: string[]; disabled: number; hint: string; leave: unknown; coinHidden: boolean }>(`(() => ({
        n: document.querySelectorAll("#bfChoices .bf-choice").length,
        imgs: Array.from(document.querySelectorAll("#bfChoices .bf-choice img.bf-choice-img")).filter((i) => (i.getAttribute("src") || "").startsWith("/card-image/")).length,
        names: Array.from(document.querySelectorAll("#bfChoices .bf-choice .bf-name")).map((e) => e.textContent.trim()),
        disabled: document.querySelectorAll("#bfChoices .bf-choice:disabled").length,
        hint: document.getElementById("bfPickHint")?.textContent || "",
        leave: ${leaveBtnProbe},
        coinHidden: !document.querySelector("#coinOverlay.visible"),
      }))()`);
      expect(picker.n).toBe(3);
      expect(picker.imgs).toBe(3);
      expect(picker.names.every((n) => n.length > 0 && !/^[a-z]{3}-\d{3}/.test(n))).toBe(true);
      expect(picker.disabled).toBe(0);
      expect(picker.hint).toMatch(/final/);
      expect(picker.leave).toEqual({ onTop: true, text: "Leave match", visible: true });
      expect(picker.coinHidden).toBe(true);

      // Hover a battlefield option → the shared preview shows its name + printed text (text stays accessible).
      const box = await page.evaluate<{ x: number; y: number }>(`(() => { const r = document.querySelector("#bfChoices .bf-choice").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await page.mouse.move(5, 5);
      await page.mouse.move(box.x, box.y, { steps: 4 });
      await until(page, `Boolean(document.querySelector("#cardPreview.visible")) && (document.getElementById("previewName").textContent || "").length > 0`, 5_000);
      const preview = await page.evaluate<{ name: string; text: string; landscape: boolean }>(`(() => ({ name: document.getElementById("previewName").textContent, text: document.getElementById("previewText").textContent || "", landscape: document.getElementById("cardPreview").classList.contains("card-preview--landscape") }))()`);
      expect(preview.name).toBe(picker.names[0] as string);
      expect(preview.text.length).toBeGreaterThan(0);
      expect(preview.landscape).toBe(true);
      await page.mouse.move(5, 5);

      // 3. Lock-in is final. Raw WS: pick A then B → B is refused with an error frame; A stands.
      const ids = await page.evaluate<string[]>(`Array.from(document.querySelectorAll("#bfChoices .bf-choice")).map((b) => b.dataset.bfId)`);
      await page.evaluate(`(() => { window.__wsErrs = []; ws.addEventListener("message", (e) => { try { const m = JSON.parse(e.data); if (m.type === "error") window.__wsErrs.push(m); } catch (x) {} }); })()`);
      await page.locator(`#bfChoices .bf-choice[data-bf-id="${ids[0]}"]`).click();
      const afterClick = await page.evaluate<{ disabled: number; selected: string[] }>(`(() => ({
        disabled: document.querySelectorAll("#bfChoices .bf-choice:disabled").length,
        selected: Array.from(document.querySelectorAll("#bfChoices .bf-choice.selected")).map((b) => b.dataset.bfId),
      }))()`);
      // Either still on the picker (all three disabled, ours selected) or already past it (Goldfish had picked) — never re-choosable.
      if (afterClick.disabled > 0) {
        expect(afterClick).toEqual({ disabled: 3, selected: [ids[0] as string] });
      }
      await page.evaluate(`ws.send(JSON.stringify({ type: "pregame_battlefield_select", battlefieldId: ${JSON.stringify(ids[1])} }))`);
      await until(page, `window.__wsErrs.length > 0`, 5_000);
      const errs = await page.evaluate<{ error: string; errorCode?: string }[]>(`window.__wsErrs`);
      expect(errs[0]?.errorCode).toBe("BATTLEFIELD_SELECT");
      expect(String(errs[0]?.error)).toMatch(/already locked in|Not choosing battlefields/);

      // 3b. THEN the d20 overlay (rule 115) with both server rolls; a Leave button is on it too.
      await until(page, `Boolean(document.querySelector("#coinOverlay.visible"))`, 15_000);
      await until(page, `["settled","choose","decided","waiting"].includes(document.getElementById("coinOverlay").dataset.stage || "")`, 10_000);
      const roll = await page.evaluate<{ r1: string; r2: string; result: string; stage: string; leave: boolean }>(`(() => ({
        r1: document.getElementById("duelRoll1").textContent, r2: document.getElementById("duelRoll2").textContent,
        result: document.getElementById("coinResult").textContent || "",
        stage: document.getElementById("coinOverlay").dataset.stage || "",
        leave: Boolean(document.querySelector("#coinOverlay #coinLeaveBtn")),
      }))()`);
      expect(Number(roll.r1)).toBeGreaterThanOrEqual(1);
      expect(Number(roll.r2)).toBeGreaterThanOrEqual(1);
      expect(Number(roll.r1)).not.toBe(Number(roll.r2));
      expect(roll.result).toMatch(/rolled higher/);
      expect(roll.leave).toBe(true);
      const humanWon = Number(roll.r1) > Number(roll.r2);
      if (humanWon) {
        // Human won: the go-first / go-second choice is offered (answer goes on the GAME socket); take "I'll go first".
        await until(page, `document.getElementById("coinOverlay").dataset.stage === "choose" && document.getElementById("coinChoose").style.display === "flex"`, 5_000);
        await page.locator("#coinChoose .coin-choose-btn").first().click();
        await until(page, `document.getElementById("coinOverlay").dataset.stage === "decided"`, 5_000);
        expect(await page.evaluate<string>(`document.getElementById("coinDetail").textContent`)).toMatch(/You go first/);
      } else {
        // Bot won: it decides (go first) and the overlay says so, then proceeds by itself.
        await until(page, `document.getElementById("coinOverlay").dataset.stage === "decided"`, 5_000);
        expect(await page.evaluate<string>(`document.getElementById("coinDetail").textContent`)).toMatch(/won the roll and chose to go first/);
      }
      // ⇒ mulligan (hands drawn only now, rule 116), with OUR first battlefield pick in play; the roll overlay is gone.
      await until(page, `Boolean(pregameState && pregameState.phase === "mulligan" && document.querySelector("#pregameOverlay.visible .mulligan-btn-keep")) && !document.querySelector("#coinOverlay.visible")`, 20_000);
      expect(await page.evaluate<string>(`pregameState.battlefieldSelected`)).toBe(ids[0] as string);
      expect(await page.evaluate<string>(`pregameState.firstPlayer`)).toBe(humanWon ? "player-1" : "player-2");
      // The locked picker rendering (what a player sees while a slower opponent chooses): options inert + status line.
      const lockedRender = await page.evaluate<{ disabled: number; status: string; badge: number }>(`(() => {
        const box = document.createElement("div");
        renderBattlefieldSelection({ battlefieldOptions: pregameState.battlefieldOptions, battlefieldSelected: ${JSON.stringify(ids[0])}, battlefieldSelectedName: ${JSON.stringify(picker.names[0])}, firstPlayer: "player-1" }, box);
        return { disabled: box.querySelectorAll(".bf-choice:disabled").length, status: box.querySelector("#bfLockedStatus")?.textContent || "", badge: box.querySelectorAll(".bf-choice.selected .bf-choice-badge").length };
      })()`);
      expect(lockedRender.disabled).toBe(3);
      expect(lockedRender.badge).toBe(1);
      expect(lockedRender.status).toContain(`Locked: ${picker.names[0]}`);
      expect(lockedRender.status).toMatch(/waiting for opponent/);

      // 4. Mulligan screen also carries Leave match → confirm → back on the play menu; the game is gone server-side.
      const gid = await page.evaluate<string>(`gameId`);
      expect(await page.evaluate(leaveBtnProbe)).toEqual({ onTop: true, text: "Leave match", visible: true });
      await page.locator("#pregameLeaveBtn").click();
      await until(page, `document.getElementById("confirmLeave").classList.contains("visible")`, 5_000);
      // The confirmation must be ABOVE the pregame overlay (features.js used to sink it to z-index 300).
      expect(await page.evaluate<boolean>(`(() => { const b = document.querySelector("#confirmLeave .confirm-yes"); const r = b.getBoundingClientRect(); return document.elementFromPoint(r.left + 4, r.top + 4) === b; })()`)).toBe(true);
      await page.locator("#confirmLeave .confirm-yes").click();
      await until(page, `!document.getElementById("startScreen").classList.contains("hidden") && !document.getElementById("lobbyMenu").classList.contains("hidden") && !document.querySelector("#pregameOverlay.visible") && gameId === null`, 10_000);
      await page.waitForTimeout(300);
      const gone = await fetch(`${BASE_URL}/api/game/${gid}/state`);
      expect(gone.status).toBe(404);
      expect(await page.evaluate<string | null>(`sessionStorage.getItem("rb_game")`)).toBeNull();
      // The picker is re-armed for another go.
      await page.locator("#sandboxOption").first().click({ timeout: 10_000 });
      await until(page, `Boolean(document.querySelector("#soloDeckPicker:not(.hidden)")) && !document.querySelector("#soloDeckPicker .start-btn").disabled`, 5_000);

      // 5. The other pregame screens expose the same button (sideboard / waiting-for-opponent renders).
      const others = await page.evaluate<{ sideboard: unknown; waiting: unknown }>(`(() => {
        isSandboxGame = false;
        handlePregameSync({ phase: "sideboard", sandbox: false, you: null, opponent: { name: "Opp", status: "choosing", battlefields: [] }, battlefieldOptions: [], mulliganComplete: [] }, gameState);
        const sideboard = ${leaveBtnProbe};
        handlePregameSync({ phase: "mulligan", firstPlayer: "player-2", mulliganComplete: ["player-1"], battlefieldOptions: [] }, { zones: { hand: [] } });
        const waiting = Object.assign(${leaveBtnProbe} || {}, { waitingText: document.querySelector("#pregameContent .pregame-waiting")?.textContent || "" });
        hidePregame();
        return { sideboard, waiting };
      })()`);
      expect(others.sideboard).toEqual({ onTop: true, text: "Leave match", visible: true });
      expect(others.waiting).toEqual({ onTop: true, text: "Leave match", visible: true, waitingText: "Waiting for opponent..." });
      expect(browser.pageErrors.filter((e) => !/favicon|card-image|401 \(Unauthorized\)/.test(e))).toEqual([]);
    },
    LIVE_TIMEOUT * 2,
  );

  test(
    "roll overlay when the BOT wins: dice settle, '<bot> won the roll and chose to go first', proceeds by itself (click skips); 'Skip animations in practice games' ⇒ Bo1 Goldfish start goes straight to the mulligan with no overlay",
    async () => {
      browser = await BrowserBackend.startBrowser({ viewport: { height: 900, width: 1440 } });
      const page = browser.page;
      await openGoldfishPicker(page, "duel", true);
      expect(await page.evaluate<boolean>(`document.getElementById("soloSkipAnimToggle").checked`)).toBe(true);

      // Deterministic overlay check (in-page): the bot (player-2) won 17 vs 4 and already chose to go first.
      const overlay = await page.evaluate<Promise<{ stages: string[]; r1: string; r2: string; detail: string; done: boolean; leave: boolean }>>(`new Promise((resolve) => {
        isSandboxGame = true; viewingPlayer = "player-1"; playerNames["player-1"] = "Me"; playerNames["player-2"] = "Goldfish";
        const ov = document.getElementById("coinOverlay");
        const stages = [];
        const mo = new MutationObserver(() => { const s = ov.dataset.stage; if (s && stages[stages.length - 1] !== s) stages.push(s); });
        mo.observe(ov, { attributes: true, attributeFilter: ["data-stage"] });
        let done = false;
        showCoinFlip({ p1Roll: 4, p2Roll: 17, winner: "player-2", firstPlayer: "player-2" }, () => { done = true; });
        setTimeout(() => {
          const out = { stages, r1: document.getElementById("duelRoll1").textContent, r2: document.getElementById("duelRoll2").textContent, detail: document.getElementById("coinDetail").textContent, done, leave: Boolean(ov.querySelector("#coinLeaveBtn")) };
          mo.disconnect(); ov.classList.remove("visible"); _coinFlipShown = false; document.getElementById("startScreen").classList.remove("hidden");
          resolve(out);
        }, 4200);
      })`);
      expect(overlay.stages.slice(0, 3)).toEqual(["rolling", "settled", "decided"]);
      expect(overlay.r1).toBe("4");
      expect(overlay.r2).toBe("17");
      expect(overlay.detail).toBe("Goldfish won the roll and chose to go first");
      expect(overlay.done).toBe(true); // proceeded by itself (~1.5s roll + 0.5s + 1.5s linger)
      expect(overlay.leave).toBe(true);
      // Click-to-skip: two clicks finish immediately.
      const skipped = await page.evaluate<Promise<{ done: boolean; ms: number }>>(`new Promise((resolve) => {
        const ov = document.getElementById("coinOverlay");
        let done = false; const t0 = performance.now();
        showCoinFlip({ p1Roll: 3, p2Roll: 12, winner: "player-2", firstPlayer: "player-2" }, () => { done = true; });
        setTimeout(() => { ov.click(); ov.click(); setTimeout(() => { ov.classList.remove("visible"); _coinFlipShown = false; document.getElementById("startScreen").classList.remove("hidden"); resolve({ done, ms: Math.round(performance.now() - t0) }); }, 50); }, 200);
      })`);
      expect(skipped.done).toBe(true);
      expect(skipped.ms).toBeLessThan(1000);

      // Preference ON: a real Bo1 Goldfish start never shows the overlay and lands on the mulligan.
      await page.evaluate(`window.__coinSeen = false`);
      await page.locator("#soloDeckPicker .start-btn").first().click({ timeout: 10_000 });
      await until(page, `Boolean(pregameState && pregameState.phase === "mulligan" && document.querySelector("#pregameOverlay.visible .mulligan-btn-keep"))`, 25_000);
      expect(await page.evaluate<boolean>(`window.__coinSeen`)).toBe(false);
      // Clean up: leave so the server drops the practice game.
      await page.locator("#pregameLeaveBtn").click();
      await page.locator("#confirmLeave .confirm-yes").click();
      await until(page, `gameId === null && !document.getElementById("startScreen").classList.contains("hidden")`, 10_000);
      expect(browser.pageErrors.filter((e) => !/favicon|card-image|401 \(Unauthorized\)/.test(e))).toEqual([]);
    },
    LIVE_TIMEOUT * 2,
  );
});
