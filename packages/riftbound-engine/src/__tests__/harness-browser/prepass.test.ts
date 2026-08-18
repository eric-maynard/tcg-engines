/**
 * [rule:ui-prepass-single-shot] Queuing a pass before you have priority.
 *
 * When the opponent's trigger goes on the chain and they are still deciding
 * whether to react, the pass you will make is already decided — but the UI can
 * only take it once priority arrives. Arming a pre-pass records that intent and
 * fires it the moment a pass becomes legal for this seat.
 *
 * The safety property is the one worth testing: it must NOT pass through
 * something new. If the chain grew while it was armed, it cancels and the
 * player gets the prompt normally.
 *
 *   RB_BROWSER_TESTS=1 bun test packages/riftbound-engine/src/__tests__/harness-browser/prepass.test.ts
 */

import { afterEach, expect, test } from "bun:test";
import { BASE_URL, LIVE_TIMEOUT, describeLive } from "./_gate";
import type { LiveGame } from "./_live";
import { launchTest } from "./_live";

let live: LiveGame | undefined;

afterEach(async () => {
  await live?.close().catch(() => undefined);
  live = undefined;
});

describeLive("pre-pass", () => {
  test(
    "arms when priority is elsewhere, fires when it arrives, and never passes through something new",
    async () => {
      live = await launchTest(BASE_URL);
      const page = live.backend.page;

      const wired = await page.evaluate(`(() => ({
        toggle: typeof togglePrepass === "function",
        fire: typeof maybeFirePrepass === "function",
        armed: typeof isPrepassArmed === "function",
      }))()`);
      expect(wired).toEqual({ toggle: true, fire: true, armed: true });

      // With no pass available, the control queues instead of refusing.
      const armed = await page.evaluate(`(() => {
        window.availableMoves = [];
        window.gameState = { chain: [{ id: "x" }] };
        togglePrepass();
        return isPrepassArmed();
      })()`);
      expect(armed).toBe(true);

      // Pressing again cancels.
      const cancelled = await page.evaluate(`(() => { togglePrepass(); return isPrepassArmed(); })()`);
      expect(cancelled).toBe(false);

      // Armed, then priority arrives with the chain unchanged: it fires.
      const fired = await page.evaluate(`(() => {
        window.__sent = [];
        window.executeMove = (moveId) => { window.__sent.push(moveId); };
        window.availableMoves = [];
        window.gameState = { chain: [{ id: "x" }] };
        togglePrepass();
        window.availableMoves = [{ moveId: "passChainPriority", params: {}, playerId: "player-1" }];
        maybeFirePrepass();
        return { sent: window.__sent, stillArmed: isPrepassArmed() };
      })()`);
      expect(fired).toEqual({ sent: ["passChainPriority"], stillArmed: false });

      // Armed, but the chain GREW: it must cancel rather than fire.
      const grew = await page.evaluate(`(() => {
        window.__sent = [];
        window.executeMove = (moveId) => { window.__sent.push(moveId); };
        window.availableMoves = [];
        window.gameState = { chain: [{ id: "x" }] };
        togglePrepass();
        window.gameState = { chain: [{ id: "x" }, { id: "responded" }] };
        window.availableMoves = [{ moveId: "passChainPriority", params: {}, playerId: "player-1" }];
        maybeFirePrepass();
        return { sent: window.__sent, stillArmed: isPrepassArmed() };
      })()`);
      expect(grew).toEqual({ sent: [], stillArmed: false });
    },
    LIVE_TIMEOUT,
  );
});
