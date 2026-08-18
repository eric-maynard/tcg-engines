/**
 * [rule:ui-opponent-strip-stable] The "Claude is thinking…" pill must not move
 * the opponent's hand.
 *
 * The opponent row is `#opponent-decks | #opponent-hand (flex:1, centred) |
 * #opponentInfo (flex-shrink:0)`. The pill mounts inside #opponentInfo, so a
 * pill that enters and leaves the flow changes that strip's width, changes the
 * hand's flex basis, and — because the hand centres its cards — slides every
 * opponent card sideways. That happens twice per AI turn, which is what a
 * player actually notices.
 *
 * This measures the hand's box across a thinking toggle rather than asserting
 * on CSS, so any future re-implementation that reintroduces the shift fails.
 *
 *   RB_BROWSER_TESTS=1 bun test packages/riftbound-engine/src/__tests__/harness-browser/ai-pill-stability.test.ts
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

/** Reads the opponent hand's layout box. */
const HAND_BOX = `(() => {
  const el = document.getElementById("opponent-hand");
  const r = el && el.getBoundingClientRect();
  return r ? { left: Math.round(r.left), width: Math.round(r.width) } : null;
})()`;

/**
 * Drives the pill directly. The point under test is the pill's LAYOUT effect,
 * not how the server reports thinking, so this forces the vs-AI branch and
 * calls the renderer rather than staging a real AI turn.
 */
function setThinking(on: boolean): string {
  return `(() => {
    window.isVsAiGame = () => true;
    if (typeof aiOnServerFrame === "function") {
      aiOnServerFrame({ type: "ai_status", ai: { kind: "claude", label: "Claude Opus 5", model: "opus", thinking: ${on} } });
    }
    if (typeof renderAiThinking === "function") { renderAiThinking(); }
    return document.getElementById("aiThinkingPill") ? "mounted" : "absent";
  })()`;
}

describeLive("ai thinking pill", () => {
  test(
    "does not move the opponent hand when it appears or disappears",
    async () => {
      live = await launchTest(BASE_URL);
      const page = live.backend.page;

      await page.evaluate(setThinking(false));
      const idle = await page.evaluate(HAND_BOX);

      const mounted = await page.evaluate(setThinking(true));
      const thinking = await page.evaluate(HAND_BOX);

      await page.evaluate(setThinking(false));
      const idleAgain = await page.evaluate(HAND_BOX);

      // The pill must exist while thinking, or this test proves nothing.
      expect(mounted).toBe("mounted");
      expect(idle).not.toBeNull();
      // Same box in all three states — that is the whole invariant.
      expect(thinking).toEqual(idle);
      expect(idleAgain).toEqual(idle);
    },
    LIVE_TIMEOUT,
  );
});
