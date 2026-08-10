/**
 * UI stability suite (gated — see _gate.ts): things a player notices in ten
 * seconds with a mouse.
 *
 *  (a) [rule:ui-rune-row-stable] hovering / tapping runes never moves any
 *      rune's layout box, the hovered rune really is :hover and topmost at the
 *      pointer, and the DOM nodes survive re-renders;
 *  (b) [rule:ui-hover-preview] hovering a battlefield, a unit at a battlefield,
 *      the legend, the champion, a hand card, a rune and a card tile inside a
 *      prompt shows the floating preview with the card's name + rules text
 *      (fixed, pointer-events none), and it hides on mouseout.
 *
 *   RB_BROWSER_TESTS=1 bun test packages/riftbound-engine/src/__tests__/harness-browser/ui-stability.test.ts
 */

import { afterEach, expect, test } from "bun:test";
import type { PwPage } from "../../harness/browser";
import { BASE_URL, LIVE_TIMEOUT, describeLive } from "./_gate";
import type { LiveGame } from "./_live";
import { cycleTurn, fieldUnit, launchTest } from "./_live";
import * as ui from "./_ui";

let live: LiveGame | undefined;

afterEach(async () => {
  await live?.close().catch(() => undefined);
  live = undefined;
});

interface Box {
  readonly l: number;
  readonly t: number;
  readonly w: number;
  readonly h: number;
}

async function runeRects(page: PwPage): Promise<Record<string, Box>> {
  return page.evaluate<Record<string, Box>>(
    `(() => { const o = {}; for (const el of document.querySelectorAll('#player-runePool .card[data-card-id]')) { const r = el.getBoundingClientRect(); o[el.dataset.cardId] = { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; } return o; })()`,
  );
}

function diffRects(a: Record<string, Box>, b: Record<string, Box>, skip?: string): string[] {
  const out: string[] = [];
  for (const k of Object.keys(a)) {
    if (k === skip) {
      continue;
    }
    const x = a[k] as Box;
    const y = b[k];
    if (!y || x.l !== y.l || x.t !== y.t || x.w !== y.w || x.h !== y.h) {
      out.push(`${k}: ${JSON.stringify(x)} → ${JSON.stringify(y)}`);
    }
  }
  return out;
}

describeLive("ui stability — rune row never moves under the mouse", () => {
  test(
    "hovering each rune ×3 changes no rune's rect, hovered rune is :hover + topmost at the pointer; a real tap changes no sibling's rect; rune DOM nodes survive re-renders",
    async () => {
      live = await launchTest(BASE_URL);
      const { backend, game } = live;
      const page = backend.page;
      // NOTE: no ui.prepare() — the production stylesheet itself must be stable.
      await cycleTurn(live);
      await cycleTurn(live);
      expect(game.p1.runes().length).toBeGreaterThanOrEqual(5);
      // One exhausted rune in the fan (rotated in its slot), the rest ready.
      await game.p1.tapRune();
      await backend.refresh();
      await page.evaluate(`render()`);

      // Tag the nodes: a re-render must patch, not rebuild, them.
      await page.evaluate(`document.querySelectorAll('#player-runePool .card[data-card-id]').forEach(el => { el.__rbKeep = 1; })`);
      await page.evaluate(`render(); render();`);
      expect(await page.evaluate<number>(`Array.from(document.querySelectorAll('#player-runePool .card[data-card-id]')).filter(el => !el.__rbKeep).length`)).toBe(0);

      await page.mouse.move(4, 4);
      const base = await runeRects(page);
      const ids = Object.keys(base);
      expect(ids.length).toBe(game.p1.runes().length);
      const failures: string[] = [];
      for (const id of ids) {
        const r = base[id] as Box;
        const x = r.l + r.w / 2;
        const y = r.t + 4; // the always-visible top strip of a fanned rune
        for (let i = 0; i < 3; i++) {
          await page.mouse.move(x, y, { steps: 2 });
          await page.waitForTimeout(120);
          const now = await runeRects(page);
          failures.push(...diffRects(base, now).map((d) => `hover ${id}#${i} moved ${d}`));
          const st = await page.evaluate<{ hover: boolean; top: string | null; transform: string }>(
            `(() => { const el = document.querySelector('#player-runePool .card[data-card-id="${id}"]'); const hit = document.elementFromPoint(${x}, ${y}); const c = hit && hit.closest('.card[data-card-id]'); return { hover: !!el && el.matches(':hover'), top: c ? c.dataset.cardId : (hit ? String(hit.className) : null), transform: el ? getComputedStyle(el).transform : '' }; })()`,
          );
          if (!st.hover) {
            failures.push(`hover ${id}#${i}: not :hover (topmost ${st.top})`);
          }
          if (st.top !== id) {
            failures.push(`hover ${id}#${i}: topmost at pointer is ${st.top}`);
          }
          if (!game.state(id).isExhausted && st.transform !== "none") {
            failures.push(`hover ${id}#${i}: ready rune has transform ${st.transform}`);
          }
          // wiggle inside the strip and out below, then come back
          await page.mouse.move(x + 6, y + 2, { steps: 2 });
          await page.mouse.move(x, y + 60, { steps: 2 });
        }
      }
      // The floating preview is up for the hovered rune and never intercepts the pointer.
      const lastId = ids[ids.length - 1] as string;
      const lr = base[lastId] as Box;
      await page.mouse.move(lr.l + lr.w / 2, lr.t + 4, { steps: 2 });
      await page.waitForTimeout(150);
      const pv = await page.evaluate<{ visible: boolean; pe: string; name: string }>(
        `({ visible: document.getElementById('cardPreview').classList.contains('visible'), pe: getComputedStyle(document.getElementById('cardPreview')).pointerEvents, name: document.getElementById('previewName').textContent })`,
      );
      expect(pv).toEqual({ name: game.state(lastId).name, pe: "none", visible: true });

      // Real click on a READY rune's strip → exhaustRune; siblings do not move, the DOM node is the same one.
      const ready = ids.find((id) => !game.state(id).isExhausted) as string;
      const before = await runeRects(page);
      const rr = before[ready] as Box;
      const seq0 = backend.seq();
      await page.mouse.click(rr.l + rr.w / 2, rr.t + 4);
      await backend.waitFor(() => backend.seq() > seq0 && game.state(ready).isExhausted === true, { timeoutMs: 8000 });
      await page.waitForTimeout(250);
      const after = await runeRects(page);
      failures.push(...diffRects(before, after, ready).map((d) => `tap moved sibling ${d}`));
      expect(await page.evaluate<boolean>(`(() => { const el = document.querySelector('#player-runePool .card[data-card-id="${ready}"]'); return !!el && el.__rbKeep === 1 && el.classList.contains('exhausted'); })()`)).toBe(true);
      // The tapped rune stays inside its stack's box (rotation reserved in the slot) and inside the clipped grid.
      expect(await ui.clippedElements(page, "#player-runePool .card, #player-runePool .rune-stack-label")).toEqual([]);
      const inside = await page.evaluate<boolean>(
        `(() => { const el = document.querySelector('#player-runePool .card[data-card-id="${ready}"]'); const s = el.closest('.rune-stack').getBoundingClientRect(); const r = el.getBoundingClientRect(); return r.left >= s.left - 1 && r.right <= s.right + 1 && r.top >= s.top - 1 && r.bottom <= s.bottom + 1; })()`,
      );
      expect(inside).toBe(true);

      expect(failures).toEqual([]);
      expect(backend.pageErrors.filter((e) => !/favicon|card-image/.test(e))).toEqual([]);
    },
    LIVE_TIMEOUT * 2,
  );
});

describeLive("ui stability — hover preview on battlefields and every board card", () => {
  test(
    "battlefield / unit at a battlefield / legend / champion / hand card / rune / prompt tile: preview shows name + rules text within 150ms, is fixed + pointer-events none, never overlaps the hovered element, hides on mouseout",
    async () => {
      live = await launchTest(BASE_URL);
      const { backend, game } = live;
      const page = backend.page;
      await ui.prepare(page);
      const unit = await fieldUnit(live, "unl-001-219"); // enters ready
      const bf = game.battlefields()[0] as string;
      await game.p1.move(unit, bf);
      await game.settle();
      const legend = game.p1.legend() as string;
      const champ = game.p1.champion() as string;
      const hand = game.p1.hand()[0] as string;
      const rune = game.p1.runes()[0] as string;

      const surfaces: { name: string; sel: string; card: string }[] = [
        { card: bf, name: "battlefield", sel: `.battlefield[data-bf-id="${bf}"] .bf-art` },
        { card: unit, name: "unit at battlefield", sel: `#battlefieldRow .card[data-card-id="${unit}"]` },
        { card: legend, name: "legend", sel: `#player-legendChampion [data-card-id="${legend}"]` },
        { card: champ, name: "champion", sel: `#player-legendChampion [data-card-id="${champ}"]` },
        { card: hand, name: "hand", sel: `#player-hand .card[data-card-id="${hand}"]` },
        { card: rune, name: "rune", sel: `#player-runePool .card[data-card-id="${rune}"]` },
      ];
      const failures: string[] = [];
      const probe = async (s: { name: string; sel: string; card: string }) => {
        await page.mouse.move(3, 3);
        await page.waitForTimeout(120);
        const pt = await page.evaluate<{ x: number; y: number } | null>(
          `(() => { const el = document.querySelector(${JSON.stringify(s.sel)}); if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); const rune = el.getAttribute('data-zone') === 'runePool'; return { x: r.left + r.width / 2, y: rune ? r.top + 4 : r.top + r.height / 2 }; })()`,
        );
        if (!pt) {
          failures.push(`[${s.name}] not rendered (${s.sel})`);
          return;
        }
        await page.mouse.move(pt.x, pt.y, { steps: 2 });
        await page.waitForTimeout(150);
        const st = await page.evaluate<{ visible: boolean; name: string; text: string; textShown: boolean; pos: string; pe: string; img: string; overlap: boolean; inViewport: boolean }>(
          `(() => { const p = document.getElementById('cardPreview'); const cs = getComputedStyle(p); const pr = p.getBoundingClientRect(); const el = document.querySelector(${JSON.stringify(s.sel)}); const anchor = el.closest('.rune-pool-grid') || el.closest('.rune-stack') || el; const er = anchor.getBoundingClientRect(); const overlap = !(pr.right <= er.left || er.right <= pr.left || pr.bottom <= er.top || er.bottom <= pr.top); const t = document.getElementById('previewText'); return { visible: p.classList.contains('visible'), name: document.getElementById('previewName').textContent, text: t.textContent, textShown: getComputedStyle(t).display !== 'none', pos: cs.position, pe: cs.pointerEvents, img: document.getElementById('previewImg').getAttribute('src') || '', overlap, inViewport: pr.left >= 0 && pr.top >= 0 && pr.right <= innerWidth && pr.bottom <= innerHeight }; })()`,
        );
        const cs = game.state(s.card);
        const ctx = `[${s.name}] ${JSON.stringify(st)}`;
        if (!st.visible) failures.push(`${ctx}: preview not visible`);
        if (st.name !== cs.name) failures.push(`${ctx}: name ≠ ${cs.name}`);
        if ((cs.rulesText ?? "").trim() && (!st.textShown || st.text.replace(/\s+/g, " ").trim() !== (cs.rulesText ?? "").replace(/\s+/g, " ").trim())) failures.push(`${ctx}: rules text ≠ ${cs.rulesText}`);
        if (st.pos !== "fixed" || st.pe !== "none") failures.push(`${ctx}: must be position:fixed + pointer-events:none`);
        if (st.overlap) failures.push(`${ctx}: preview overlaps the hovered element`);
        if (!st.inViewport) failures.push(`${ctx}: preview leaves the viewport`);
        if (!/\/card-image\//.test(st.img)) failures.push(`${ctx}: no art`);
        // Still hovering the element (the panel did not steal the pointer).
        const still = await page.evaluate<boolean>(`(() => { const el = document.querySelector(${JSON.stringify(s.sel)}); const hit = document.elementFromPoint(${pt.x}, ${pt.y}); return !!hit && (hit === el || el.contains(hit)); })()`);
        if (!still) failures.push(`${ctx}: element no longer under the pointer`);
        await page.mouse.move(3, 3, { steps: 2 });
        await page.waitForTimeout(200);
        if (await page.evaluate<boolean>(`document.getElementById('cardPreview').classList.contains('visible')`)) failures.push(`[${s.name}] preview still visible after mouseout`);
      };
      for (const s of surfaces) {
        await probe(s);
      }
      // Landscape layout for battlefields.
      await page.mouse.move(3, 3);
      const bfPt = await page.evaluate<{ x: number; y: number }>(`(() => { const r = document.querySelector(${JSON.stringify(surfaces[0]?.sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await page.mouse.move(bfPt.x, bfPt.y, { steps: 2 });
      await page.waitForTimeout(120);
      expect(await page.evaluate<boolean>(`document.getElementById('cardPreview').classList.contains('card-preview--landscape')`)).toBe(true);
      await page.mouse.move(3, 3);

      // A card tile inside a prompt (Stacked Deck look-at-3) previews too, above the modal.
      const { cardId: sd } = await backend.tutor("ogn-183-298");
      await game.p1.cast(sd);
      const s = await game.settle();
      expect(s.reason).toBe("unanswered");
      const tileId = await page.evaluate<string>(`document.querySelector('#choiceOverlay .choice-modal-card[data-card-id]').getAttribute('data-card-id')`);
      await probe({ card: tileId, name: "prompt tile", sel: `#choiceOverlay .choice-modal-card[data-card-id="${tileId}"]` });
      const z = await page.evaluate<{ pz: number; oz: number }>(`({ pz: Number(getComputedStyle(document.getElementById('cardPreview')).zIndex), oz: Number(getComputedStyle(document.getElementById('choiceOverlay')).zIndex) || 0 })`);
      expect(z.pz).toBeGreaterThan(z.oz);
      await game.settle({ policy: "first" });

      expect(failures).toEqual([]);
      expect(backend.pageErrors.filter((e) => !/favicon|card-image/.test(e))).toEqual([]);
    },
    LIVE_TIMEOUT * 2,
  );
});
