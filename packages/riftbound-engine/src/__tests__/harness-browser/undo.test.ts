/**
 * Rewind in the LIVE client (gated — see _gate.ts): the sidebar Rewind / Redo
 * buttons track the engine's history cursor (snapshot.canUndo / canRedo), a
 * click rewinds the visible board (rune untapped, energy back, card back in
 * hand), Ctrl+Z / Ctrl+Shift+Z do the same, and the "Rewound their last
 * action." sentinel arrives as the newest log line.
 *
 *   RB_BROWSER_TESTS=1 bun test packages/riftbound-engine/src/__tests__/harness-browser/undo.test.ts
 */

import { afterEach, expect, test } from "bun:test";
import { P1 } from "../../harness";
import type { PwPage } from "../../harness/browser";
import { BASE_URL, LIVE_TIMEOUT, describeLive } from "./_gate";
import type { LiveGame } from "./_live";
import { launchTest } from "./_live";
import * as ui from "./_ui";

let live: LiveGame | undefined;

afterEach(async () => {
  await live?.close().catch(() => undefined);
  live = undefined;
});

interface RewindUi {
  undoDisabled: boolean;
  redoDisabled: boolean;
  canUndo: boolean;
  canRedo: boolean | undefined;
  energy: number;
  runesTappedDom: number;
  handDom: string[];
  newestLog: string;
}

async function readUi(page: PwPage): Promise<RewindUi> {
  return page.evaluate<RewindUi>(`(() => {
    const gs = window.__rbGameState || {};
    const log = Array.isArray(gs.log) ? gs.log : [];
    const newest = log.length ? (typeof log[log.length - 1] === "string" ? log[log.length - 1] : log[log.length - 1].text) : "";
    return {
      undoDisabled: !!document.getElementById("undoBtn")?.disabled,
      redoDisabled: !!document.getElementById("redoBtn")?.disabled,
      canUndo: !!gs.canUndo,
      canRedo: gs.canRedo,
      energy: (gs.runePools && gs.runePools["player-1"] && gs.runePools["player-1"].energy) || 0,
      runesTappedDom: document.querySelectorAll("#player-runePool .card.exhausted, #player-runePool .card.card--exhausted").length,
      handDom: Array.from(document.querySelectorAll("#player-hand .card[data-card-id]")).map((e) => e.getAttribute("data-card-id")),
      newestLog: String(newest || ""),
    };
  })()`);
}

/** Wait until the page shows a frame satisfying `pred` (polls the DOM/gameState). */
async function until(page: PwPage, pred: (u: RewindUi) => boolean, what: string, timeoutMs = 8000): Promise<RewindUi> {
  const deadline = Date.now() + timeoutMs;
  let last = await readUi(page);
  while (!pred(last)) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}: ${JSON.stringify(last)}`);
    }
    await page.waitForTimeout(60);
    last = await readUi(page);
  }
  return last;
}

/** Canonical JSON of the parts of a client frame a Rewind→Redo round trip must reproduce (log excluded). */
function frameCore(frame: { snapshot: Record<string, unknown> }): string {
  const { log: _log, canUndo: _u, canRedo: _r, ai: _ai, ...rest } = frame.snapshot as Record<string, unknown>;
  const canon = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as Record<string, unknown>).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])])) : v;
  return JSON.stringify(canon(rest));
}

async function clickButton(page: PwPage, id: string): Promise<void> {
  const ok = await page.evaluate<boolean>(`(() => { const b = document.getElementById(${JSON.stringify(id)}); if (!b || b.disabled) return false; b.click(); return true; })()`);
  if (!ok) {
    throw new Error(`#${id} missing or disabled`);
  }
}

describeLive("Rewind / Redo in the live client", () => {
  test(
    "buttons mirror canUndo/canRedo; Rewind click untaps the rune it tapped (DOM + energy) and posts the sentinel; Redo re-taps; Ctrl+Z / Ctrl+Shift+Z hotkeys; a played unit goes back to the hand and Redo replays it",
    async () => {
      live = await launchTest(BASE_URL);
      const { backend, game } = live;
      const page = backend.page;
      await ui.prepare(page);

      // Invariant at rest: the buttons say exactly what the snapshot says.
      const start = await readUi(page);
      expect(start.undoDisabled).toBe(!start.canUndo);
      expect(start.redoDisabled).toBe(start.canRedo === undefined ? false : !start.canRedo);

      // Tap a rune through the UI.
      const rune = game.p1.runes({ ready: true })[0] as string;
      expect(rune).toBeDefined();
      const e0 = start.energy;
      const tapped0 = start.runesTappedDom;
      await ui.clickCard(page, rune);
      const afterTap = await until(page, (u) => u.energy === e0 + 1 && u.runesTappedDom === tapped0 + 1, "rune tapped");
      expect(afterTap.canUndo).toBe(true);
      expect(afterTap.undoDisabled).toBe(false);
      expect(afterTap.canRedo).toBe(false);
      expect(afterTap.redoDisabled).toBe(true);

      // Rewind button: rune untapped on screen, energy back, sentinel newest, Redo now enabled.
      await clickButton(page, "undoBtn");
      const rewound = await until(page, (u) => u.energy === e0 && u.runesTappedDom === tapped0, "rewind of the tap");
      expect(rewound.newestLog).toBe("Rewound their last action.");
      expect(rewound.canRedo).toBe(true);
      expect(rewound.redoDisabled).toBe(false);
      await game.settle();
      expect(game.state(rune).isExhausted).toBe(false);
      expect(game.p1.energy()).toBe(e0);

      // Redo button re-applies it.
      await clickButton(page, "redoBtn");
      const redone = await until(page, (u) => u.energy === e0 + 1 && u.runesTappedDom === tapped0 + 1, "redo of the tap");
      expect(redone.canRedo).toBe(false);
      expect(redone.redoDisabled).toBe(true);
      expect(redone.newestLog).toBe("Move redone.");

      // Hotkeys: Ctrl+Z rewinds, Ctrl+Shift+Z redoes (Shift reports "Z").
      await page.evaluate(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
      await page.keyboard.press("Control+z");
      await until(page, (u) => u.energy === e0 && u.runesTappedDom === tapped0, "Ctrl+Z rewind");
      await page.keyboard.press("Control+Shift+Z");
      await until(page, (u) => u.energy === e0 + 1, "Ctrl+Shift+Z redo");
      await page.keyboard.press("Control+z");
      const back = await until(page, (u) => u.energy === e0, "second Ctrl+Z");
      expect(back.canRedo).toBe(true);

      // A played unit goes back to the hand on Rewind (and the redo branch of the tap is gone once we act).
      const { cardId: unit } = await backend.tutor("sfd-018-221"); // vanilla 1-cost unit; tutor also grants energy
      const beforePlay = await until(page, (u) => u.handDom.includes(unit), "tutored unit in hand");
      await game.p1.play(unit);
      await game.settle({ policy: "first" });
      const played = await until(page, (u) => !u.handDom.includes(unit), "unit left the hand");
      expect(played.canRedo).toBe(false); // new action truncated the redo branch
      expect(game.zoneOf(unit)).toBe("base");
      await clickButton(page, "undoBtn");
      const unplayed = await until(page, (u) => u.handDom.includes(unit) && u.energy === beforePlay.energy, "unit back in hand");
      expect(unplayed.newestLog).toBe("Rewound their last action.");
      await backend.refresh();
      expect(game.zoneOf(unit)).toBe("hand");
      await clickButton(page, "redoBtn");
      await until(page, (u) => !u.handDom.includes(unit), "redo replays the unit");
      await backend.refresh();
      expect(game.zoneOf(unit)).toBe("base");

      expect(backend.pageErrors.filter((e) => !/favicon|card-image/.test(e))).toEqual([]);
    },
    LIVE_TIMEOUT,
  );

  test(
    "Rewind across End Turn in a Goldfish game: each click takes back one of OUR actions (the Goldfish's whole turn is skipped over, never left half-undone) until we are back before our End Turn with the same hand; Redo walks forward to where we were",
    async () => {
      live = await launchTest(BASE_URL);
      const { backend, game } = live;
      const page = backend.page;
      await ui.prepare(page);
      const t0 = game.turnNumber();
      const hand0 = [...game.p1.hand()].sort();
      await game.p1.endTurn();
      await backend.waitFor((o) => o.turn.activePlayer === P1 && o.turn.number > t0, { timeoutMs: 20_000 });
      await game.settle();
      const t1 = game.turnNumber();
      expect(t1).toBeGreaterThan(t0);
      const there = frameCore(await backend.refresh());

      // Our own priority passes on start-of-turn triggers (if the deck has any) come back first, one per click;
      // the click that reaches our End Turn also removes the Goldfish's entire turn.
      let clicks = 0;
      for (; clicks < 8 && game.turnNumber() !== t0; clicks++) {
        const seq = backend.seq();
        await clickButton(page, "undoBtn");
        await backend.waitFor(() => backend.seq() > seq, { timeoutMs: 10_000 });
        const o = await backend.refresh();
        // Never parked on the Goldfish's turn.
        expect(o.snapshot.turn.activePlayer).toBe(P1);
        expect((await readUi(page)).newestLog).toBe("Rewound their last action.");
      }
      expect(clicks).toBeGreaterThan(0);
      expect(game.turnNumber()).toBe(t0);
      expect(game.turnPlayer()).toBe(P1);
      expect(game.phase()).toBe("main");
      expect([...game.p1.hand()].sort()).toEqual(hand0);
      expect((await readUi(page)).canRedo).toBe(true);

      // Redo the same number of clicks lands exactly where we were.
      for (let i = 0; i < clicks; i++) {
        const seq = backend.seq();
        await clickButton(page, "redoBtn");
        await backend.waitFor(() => backend.seq() > seq, { timeoutMs: 10_000 });
        await backend.refresh();
      }
      expect(game.turnNumber()).toBe(t1);
      expect(frameCore(await backend.refresh())).toBe(there);
      expect((await readUi(page)).canRedo).toBe(false);
    },
    LIVE_TIMEOUT,
  );
});
