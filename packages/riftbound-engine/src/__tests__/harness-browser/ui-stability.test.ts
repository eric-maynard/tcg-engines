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
 *  (c) the preview never STICKS: its subject removed under a still cursor, a
 *      modal opening over it, Escape, a click, or a prompt closing with the
 *      hovered tile all drop it.
 *  (d) [rule:ui-pile-art] deck / rune / trash piles show the main back, the
 *      rune back and the top trash card (both players; empty = placeholder).
 *  (e) rule 723 facedown cards are card BACKS for every seat; hover peeks only
 *      with what this seat's snapshot carries; Hide is an explicit choice.
 *  (f) [rule:ui-bf-one-row] 8 units a side stay in one row, un-scrolled, all
 *      addressable; the spread view opens/closes; attached gear stacks under
 *      its unit; a battlefield unit drags back to base (rule 144.4.b).
 *
 *   RB_BROWSER_TESTS=1 bun test packages/riftbound-engine/src/__tests__/harness-browser/ui-stability.test.ts
 */

import { afterEach, expect, test } from "bun:test";
import type { PwPage } from "../../harness/browser";
import { BASE_URL, LIVE_TIMEOUT, describeLive } from "./_gate";
import type { LiveGame } from "./_live";
import { P1, P2 } from "../../harness";
import { cycleTurn, fieldUnit, launchTest, movesOf } from "./_live";
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

/** Centre (or the top strip for a fanned rune) of the first element matching `sel`, or null. */
async function pointOf(page: PwPage, sel: string, top = false): Promise<{ x: number; y: number } | null> {
  return page.evaluate<{ x: number; y: number } | null>(
    `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: ${top ? "r.top + 4" : "r.top + r.height / 2"} }; })()`,
  );
}

async function previewShown(page: PwPage): Promise<boolean> {
  return page.evaluate<boolean>(`document.getElementById('cardPreview').classList.contains('visible')`);
}

/** Poll (≤ `withinMs`) for the preview to be gone; returns the ms it took, or -1. */
async function previewGoneWithin(page: PwPage, withinMs: number): Promise<number> {
  const t0 = Date.now();
  while (Date.now() - t0 <= withinMs) {
    if (!(await previewShown(page))) {
      return Date.now() - t0;
    }
    await page.waitForTimeout(20);
  }
  return (await previewShown(page)) ? -1 : Date.now() - t0;
}

describeLive("ui stability — hover preview never sticks", () => {
  test(
    "subject removed under a still cursor / covered by a modal / Escape / click / prompt closing with the hovered tile → preview gone within 200ms; re-hover shows it again",
    async () => {
      live = await launchTest(BASE_URL);
      const { backend, game } = live;
      const page = backend.page;
      await ui.prepare(page);
      await cycleTurn(live);
      const failures: string[] = [];
      const away = async () => {
        await page.mouse.move(3, 3, { steps: 2 });
        await page.waitForTimeout(120);
      };

      // (1) the hovered rune's DOM node is removed (what a re-render / closing prompt does) — no mouseout ever fires.
      const rune = game.p1.runes()[0] as string;
      let pt = (await pointOf(page, `#player-runePool .card[data-card-id="${rune}"]`, true))!;
      await page.mouse.move(pt.x, pt.y, { steps: 2 });
      await page.waitForTimeout(150);
      if (!(await previewShown(page))) failures.push("rune hover: no preview");
      await page.evaluate(`document.querySelector('#player-runePool .card[data-card-id="${rune}"]').remove()`);
      let ms = await previewGoneWithin(page, 200);
      if (ms < 0) failures.push("node removed under cursor: preview stuck");
      await page.evaluate(`render()`);
      await away();

      // (2) a modal opens on top of the hovered hand card.
      const hand = game.p1.hand()[0] as string;
      pt = (await pointOf(page, `#player-hand .card[data-card-id="${hand}"]`))!;
      await page.mouse.move(pt.x, pt.y, { steps: 2 });
      await page.waitForTimeout(150);
      if (!(await previewShown(page))) failures.push("hand hover: no preview");
      await page.evaluate(`document.getElementById('choiceOverlay').classList.add('visible')`);
      ms = await previewGoneWithin(page, 200);
      if (ms < 0) failures.push("modal opened over the card: preview stuck");
      await page.evaluate(`document.getElementById('choiceOverlay').classList.remove('visible')`);
      await away();

      // (3) Escape and (4) a click dismiss it; moving onto another card shows it again.
      await page.mouse.move(pt.x, pt.y, { steps: 2 });
      await page.waitForTimeout(150);
      if (!(await previewShown(page))) failures.push("re-hover after modal: no preview");
      await page.keyboard.press("Escape");
      if ((await previewGoneWithin(page, 100)) < 0) failures.push("Escape: preview stuck");
      await away();
      const legend = game.p1.legend() as string;
      const lp = (await pointOf(page, `#player-legendChampion [data-card-id="${legend}"]`))!;
      await page.mouse.move(lp.x, lp.y, { steps: 2 });
      await page.waitForTimeout(150);
      if (!(await previewShown(page))) failures.push("legend hover: no preview");
      await ui.capture(page, async () => {
        await page.mouse.click(lp.x, lp.y);
      });
      if ((await previewGoneWithin(page, 100)) < 0) failures.push("click: preview stuck");
      await away();

      // (5) the real thing: hover a card tile inside a prompt (Stacked Deck look-at-3), answer the
      // prompt so the tile vanishes with the modal while the cursor stands still.
      const { cardId: sd } = await backend.tutor("ogn-183-298");
      await game.p1.cast(sd);
      const s1 = await game.settle();
      expect(s1.reason).toBe("unanswered");
      const tileSel = `#choiceOverlay .choice-modal-card[data-card-id]`;
      pt = (await pointOf(page, tileSel))!;
      if (!pt) failures.push("prompt tile not rendered");
      await page.mouse.move(pt.x, pt.y, { steps: 2 });
      await page.waitForTimeout(150);
      if (!(await previewShown(page))) failures.push("prompt tile hover: no preview");
      await game.settle({ policy: "first" }); // answers → modal content replaced / closed under the cursor
      ms = await previewGoneWithin(page, 250);
      if (ms < 0) failures.push("prompt closed with hovered tile: preview stuck");
      await away();

      expect(failures).toEqual([]);
      expect(backend.pageErrors.filter((e) => !/favicon|card-image|Failed to load resource/.test(e))).toEqual([]);
    },
    LIVE_TIMEOUT * 2,
  );
});

describeLive("board — piles show backs / top trash card; facedown cards are backs with seat-aware hover; Hide is explicit", () => {
  test(
    "main = main back + count, rune = rune back + count, trash = top card face (hover previews, click opens viewer), empty = placeholder — both players; hidden card = tilted back, owner hover peeks with ribbon, a redacted (opponent-seat) entry previews only a back; hide-only click dispatches nothing and offers 'Hide at …'",
    async () => {
      live = await launchTest(BASE_URL);
      const { backend, game } = live;
      const page = backend.page;
      await ui.prepare(page);
      const failures: string[] = [];

      // ---- piles ----
      type Pile = { pile: string; count: number; back: boolean; empty: boolean; top: string | null };
      const piles = async (who: "player" | "opponent") =>
        page.evaluate<Pile[]>(`Array.from(document.querySelectorAll('#${who}-decks .deck-stack')).map(d => ({ pile: d.dataset.pile, count: Number(d.dataset.count), back: !!d.querySelector('.card-back-art--' + d.dataset.pile), empty: d.classList.contains('deck-stack--empty'), top: d.querySelector('.deck-stack-top') ? d.querySelector('.deck-stack-top').getAttribute('src') : null }))`);
      const zones = backend.currentFrame.snapshot.zones;
      const count = (z: string, seat: string) => (zones[z] ?? []).filter((c) => c.owner === seat).length;
      for (const [who, seat] of [["player", P1], ["opponent", P2]] as const) {
        const ps = await piles(who);
        const by = Object.fromEntries(ps.map((p) => [p.pile, p]));
        if (!by.main?.back || by.main.count !== count("mainDeck", seat)) failures.push(`${who} main pile ${JSON.stringify(by.main)} vs ${count("mainDeck", seat)}`);
        if (!by.rune?.back || by.rune.count !== count("runeDeck", seat)) failures.push(`${who} rune pile ${JSON.stringify(by.rune)}`);
        if (!by.trash || (count("trash", seat) === 0 && !by.trash.empty)) failures.push(`${who} empty trash should be a placeholder ${JSON.stringify(by.trash)}`);
      }
      const bg = await page.evaluate<string[]>(`['main','rune'].map(k => getComputedStyle(document.querySelector('#player-decks .card-back-art--' + k)).backgroundImage)`);
      if (!bg.every((b) => /svg/.test(b) && /gradient/.test(b)) || bg[0] === bg[1]) failures.push("main/rune backs must be distinct drawn backs");
      const { cardId: sd } = await backend.tutor("ogn-183-298"); // Stacked Deck → resolves → trash
      await game.p1.cast(sd);
      await game.settle({ policy: "first" });
      await page.evaluate(`render()`);
      const trash = (await piles("player")).find((p) => p.pile === "trash");
      if (!trash || trash.count < 1 || !/\/card-image\/ogn-183-298$/.test(String(trash.top))) failures.push(`trash top card ${JSON.stringify(trash)}`);
      let pt = (await pointOf(page, `#player-decks .deck-stack--trash`))!;
      await page.mouse.move(pt.x, pt.y, { steps: 2 });
      await page.waitForTimeout(150);
      if ((await page.evaluate<string>(`document.getElementById('previewName').textContent`)) !== "Stacked Deck" || !(await previewShown(page))) failures.push("trash hover should preview the top card");
      await page.mouse.click(pt.x, pt.y);
      await page.waitForTimeout(100);
      if (!(await page.evaluate<boolean>(`!!document.querySelector('#zoneViewer.visible [data-card-id="${sd}"]')`))) failures.push("trash click should open the zone viewer listing the card");
      await page.evaluate(`closeZoneViewer()`);
      await page.mouse.move(3, 3);

      // ---- facedown ----
      const unit = await fieldUnit(live, "unl-001-219"); // enters ready
      const bf = game.battlefields()[0] as string;
      if (game.p1.battlefields({ controlled: true }).length === 0) {
        await game.p1.move(unit, bf);
        await game.settle({ policy: "first" });
        await cycleTurn(live);
      }
      const held = game.p1.battlefields({ controlled: true })[0] as string;
      expect(held).toBeDefined();
      const { cardId: block } = await backend.tutor("ogn-057-298");
      await backend.addResources(P1, { power: { calm: 1 } });
      const hide = movesOf(backend, "hideCard").find((m) => m.params.cardId === block);
      expect(hide).toBeDefined();
      // Hide-only (play variants masked): a bare click must NOT hide — it selects, lights the battlefield, offers "Hide at …".
      const ho = await page.evaluate<{ sent: string[]; btns: string[]; lit: string[] }>(
        `(() => { const saved = availableMoves; const sent = []; const ex = executeMove; executeMove = (a) => sent.push(a); try { availableMoves = saved.filter(m => !(m.moveId === 'playSpell' && m.params && m.params.cardId === '${block}')); onCardClick('${block}'); return { sent, btns: Array.from(document.querySelectorAll('#actionBarBtns .action-bar-btn')).map(b => b.textContent.trim()), lit: Array.from(document.querySelectorAll('.battlefield.valid-target')).map(b => b.dataset.bfId) }; } finally { executeMove = ex; availableMoves = saved; cancelInteraction(); } })()`,
      );
      if (ho.sent.length !== 0) failures.push(`hide-only click dispatched ${ho.sent}`);
      if (!ho.btns.some((b) => b.startsWith("Hide at ")) || !ho.btns.includes("Cancel")) failures.push(`hide-only bar ${ho.btns}`);
      if (!ho.lit.includes(hide?.params.battlefieldId as string)) failures.push(`hide-only should light ${hide?.params.battlefieldId}: ${ho.lit}`);
      await game.p1.hide(block, hide?.params.battlefieldId as string);
      await game.settle();
      await page.evaluate(`render()`);
      const fdSel = `.bf-facedown .card.card--bf-hidden[data-card-id="${block}"]`;
      const fd = await page.evaluate<{ back: boolean; def: string | null; mine: boolean; badge: string } | null>(
        `(() => { const c = document.querySelector(${JSON.stringify(fdSel)}); return c ? { back: !!c.querySelector('.card-back-art'), def: c.dataset.defId || null, mine: c.classList.contains('card--bf-hidden-mine'), badge: (c.querySelector('.card-hidden-badge') || {}).textContent || '' } : null; })()`,
      );
      if (!fd || !fd.back || fd.badge !== "HIDDEN" || !fd.mine || fd.def !== "ogn-057-298") failures.push(`own facedown render ${JSON.stringify(fd)}`);
      pt = (await pointOf(page, fdSel))!;
      await page.mouse.move(pt.x, pt.y, { steps: 2 });
      await page.waitForTimeout(150);
      const pvMine = await page.evaluate<{ v: boolean; name: string; ribbon: string; ribbonShown: boolean; img: boolean }>(
        `({ v: document.getElementById('cardPreview').classList.contains('visible'), name: document.getElementById('previewName').textContent, ribbon: (document.getElementById('previewRibbon') || {}).textContent || '', ribbonShown: !!document.getElementById('previewRibbon') && getComputedStyle(document.getElementById('previewRibbon')).display !== 'none', img: getComputedStyle(document.getElementById('previewImg')).display !== 'none' })`,
      );
      if (!pvMine.v || pvMine.name !== "Block" || !pvMine.ribbonShown || !/only you can see/.test(pvMine.ribbon) || !pvMine.img) failures.push(`owner peek ${JSON.stringify(pvMine)}`);
      await page.mouse.move(3, 3);
      await page.waitForTimeout(100);
      // A seat that may NOT see a hidden card receives exactly this redacted shape for the slot
      // (server/__tests__/snapshot-redaction.test.ts) — render it as if the Goldfish had hidden a card here.
      const z = `facedown-${hide?.params.battlefieldId as string}`;
      await page.evaluate(
        `(() => { window.__fdSaved = gameState.zones[${JSON.stringify(z)}]; gameState.zones[${JSON.stringify(z)}] = window.__fdSaved.map((c, i) => ({ cardType: 'unknown', controller: 'player-2', definitionId: '', id: 'hidden-' + ${JSON.stringify(z)} + '-player-2-' + i, meta: { buffed: false, combatRole: null, damage: 0, exhausted: false, hidden: false, stunned: false }, name: 'Hidden card', owner: 'player-2' })); renderBattlefields(); })()`,
      );
      const rdSel = `.bf-facedown .card.card--bf-hidden[data-facedown="1"]`;
      const rd = await page.evaluate<{ def: string | null; theirs: boolean; peek: boolean; html: string } | null>(
        `(() => { const c = document.querySelector(${JSON.stringify(rdSel)}); return c ? { def: c.dataset.defId || null, theirs: c.classList.contains('card--bf-hidden-theirs'), peek: !!c.querySelector('.card-hidden-peek'), html: c.outerHTML } : null; })()`,
      );
      if (!rd || rd.def !== null || !rd.theirs || rd.peek || /ogn-057-298|Block/.test(rd.html)) failures.push(`redacted facedown render ${JSON.stringify(rd)}`);
      pt = (await pointOf(page, rdSel))!;
      await page.mouse.move(pt.x, pt.y, { steps: 2 });
      await page.waitForTimeout(150);
      const pvR = await page.evaluate<{ v: boolean; name: string; type: string; back: boolean; src: string | null; ribbonShown: boolean }>(
        `({ v: document.getElementById('cardPreview').classList.contains('visible'), name: document.getElementById('previewName').textContent, type: document.getElementById('previewType').textContent, back: !!document.getElementById('previewBack') && getComputedStyle(document.getElementById('previewBack')).display !== 'none', src: document.getElementById('previewImg').getAttribute('src'), ribbonShown: !!document.getElementById('previewRibbon') && getComputedStyle(document.getElementById('previewRibbon')).display !== 'none' })`,
      );
      if (!pvR.v || pvR.name !== "Facedown card" || !/controlled by Goldfish/.test(pvR.type) || !pvR.back || pvR.src || pvR.ribbonShown) failures.push(`redacted preview ${JSON.stringify(pvR)}`);
      await page.mouse.move(3, 3);
      await page.evaluate(`(() => { gameState.zones[${JSON.stringify(z)}] = window.__fdSaved; render(); })()`);

      expect(failures).toEqual([]);
      expect(backend.pageErrors.filter((e) => !/favicon|card-image|Failed to load resource/.test(e))).toEqual([]);
    },
    LIVE_TIMEOUT * 2,
  );
});

describeLive("board — crowded battlefield stays one addressable row; spread view; gear under unit; unit drags back to base", () => {
  test(
    "8 Recruits a side: one row each, no scrollbar, none outside the row, every card has a clickable strip and a Might chip; clickCard selects first/middle/last; ⤢ chip opens the spread (8 tiles, hover previews, click selects, Esc / outside click close); Dirk equips under its unit with a clickable peeking edge; a ready unit at a battlefield drags onto the base row → standardMove to base",
    async () => {
      live = await launchTest(BASE_URL);
      const { backend, game } = live;
      const page = backend.page;
      await ui.prepare(page);
      const failures: string[] = [];
      const bf = game.battlefields()[0] as string;

      // ---- gear tucked under its unit ----
      const unit = await fieldUnit(live, "unl-001-219");
      const { cardId: dirk } = await backend.tutor("sfd-009-221");
      await backend.addResources(P1, { energy: 4, power: { fury: 3 } });
      await game.p1.playGear(dirk);
      await game.settle({ policy: "first" });
      const eq = movesOf(backend, "equipCard").find((m) => m.params.equipmentId === dirk && m.params.unitId === unit);
      expect(eq).toBeDefined();
      expect((await backend.raw(P1, "equipCard", eq?.params as Record<string, unknown>)).ok).toBe(true);
      await game.settle({ policy: "first" });
      await page.evaluate(`render()`);
      const st = await page.evaluate<{ peeks: boolean; edgeHitsGear: boolean } | null>(
        `(() => { const s = document.querySelector('#player-base .unit-stack[data-stack-host="${unit}"]'); if (!s) return null; const g = s.querySelector('.unit-stack-gear .card[data-card-id="${dirk}"]'); const h = s.querySelector(':scope > .card[data-card-id="${unit}"]'); if (!g || !h) return null; const gr = g.getBoundingClientRect(), hr = h.getBoundingClientRect(); const hit = document.elementFromPoint(gr.right - 4, gr.top + gr.height / 2); return { peeks: gr.right > hr.right + 6, edgeHitsGear: !!hit && hit.closest('.card') === g }; })()`,
      );
      if (!st || !st.peeks || !st.edgeHitsGear) failures.push(`gear stack ${JSON.stringify(st)}`);

      // ---- 8 a side ----
      expect((await backend.raw(P1, "addToken", { count: 8, tokenName: "Recruit", zoneId: `battlefield-${bf}` })).ok).toBe(true);
      expect((await backend.raw(P2, "addToken", { count: 8, tokenName: "Recruit", zoneId: `battlefield-${bf}` })).ok).toBe(true);
      await backend.refresh();
      await page.evaluate(`render()`);
      type Side = { n: number; cards: string[]; scroll: boolean; wraps: boolean; outside: string[]; thin: string[]; chip: boolean; mightChips: number };
      const sides = await page.evaluate<Record<string, Side>>(`(() => {
        const bfEl = document.querySelector('.battlefield[data-bf-id="${bf}"]'); const out = {};
        for (const side of ['player-side', 'opponent-side']) {
          const row = bfEl.querySelector('.bf-units.' + side); const rr = row.getBoundingClientRect();
          const cards = Array.from(row.querySelectorAll(':scope > .card[data-card-id], :scope > .unit-stack > .card[data-card-id], :scope > .bf-facedown > .card[data-card-id]'));
          const tops = new Set(cards.map(c => Math.round(c.getBoundingClientRect().top / 8)));
          const outside = [], thin = []; let mightChips = 0;
          for (const c of cards) { const r = c.getBoundingClientRect(); if (r.left < rr.left - 1 || r.right > rr.right + 1 || r.top < rr.top - 4 || r.bottom > rr.bottom + 4) outside.push(c.dataset.cardId);
            let w = 0; for (let x = Math.ceil(r.left) + 1; x < r.right - 1; x += 2) { const h = document.elementFromPoint(x, r.top + r.height / 2); if (h && h.closest('.card') === c) w += 2; }
            if (w < 16) thin.push(c.dataset.cardId + ':' + w + 'px');
            const chip = c.querySelector('.card-might-chip'); if (chip && getComputedStyle(chip).display !== 'none') mightChips++; }
          out[side] = { n: Number(row.dataset.n), cards: cards.map(c => c.dataset.cardId), scroll: row.scrollWidth > row.clientWidth + 1 || getComputedStyle(row).overflowX === 'auto' || getComputedStyle(row).overflowX === 'scroll', wraps: tops.size > 1, outside, thin, chip: !!row.querySelector('.bf-spread-chip'), mightChips };
        }
        return out; })()`);
      for (const [side, s] of Object.entries(sides)) {
        if (s.n !== 8 || s.cards.length !== 8) failures.push(`${side}: expected 8 slots, got n=${s.n} cards=${s.cards.length}`);
        if (s.scroll) failures.push(`${side}: row scrolls`);
        if (s.wraps) failures.push(`${side}: row wrapped to a second line`);
        if (s.outside.length) failures.push(`${side}: cards outside the row ${s.outside}`);
        if (s.thin.length) failures.push(`${side}: cards without a clickable strip ${s.thin}`);
        if (!s.chip) failures.push(`${side}: no spread chip`);
        if (s.mightChips !== 8) failures.push(`${side}: might chips visible on ${s.mightChips}/8`);
      }
      // A player can still click any of them (first / middle / last of our fan).
      const mineIds = sides["player-side"]?.cards ?? [];
      for (const id of [mineIds[0], mineIds[4], mineIds[7]] as string[]) {
        await page.evaluate(`cancelInteraction()`);
        await ui.capture(page, async () => {
          await ui.clickCard(page, id);
        }).catch((e) => failures.push(`clickCard ${id}: ${(e as Error).message}`));
        const sel = await page.evaluate<string | null>(`typeof selectedCard === 'string' ? selectedCard : null`);
        // capture() cancels the interaction afterwards; read what the click selected from the action bar label instead.
        void sel;
      }
      for (const id of [mineIds[0], mineIds[4], mineIds[7]] as string[]) {
        const hp = await ui.hitPoint(page, id);
        if (!hp || hp.occludedBy) failures.push(`hitPoint ${id}: ${JSON.stringify(hp)}`);
        else {
          await page.mouse.click(hp.x, hp.y);
          await page.waitForTimeout(60);
          const sel = await page.evaluate<string | null>(`selectedCard`);
          if (sel !== id) failures.push(`click on ${id}'s visible strip selected ${sel}`);
          await page.evaluate(`cancelInteraction()`);
        }
      }
      // ---- spread view ----
      await page.evaluate(`document.querySelector('.battlefield[data-bf-id="${bf}"] .bf-units.opponent-side .bf-spread-chip').click()`);
      await page.waitForTimeout(80);
      const sp = await page.evaluate<{ tiles: number; inViewport: boolean; tileW: number } | null>(
        `(() => { const p = document.getElementById('bfSpread'); if (!p) return null; const t = p.querySelectorAll('.bf-spread-tile'); const r = p.getBoundingClientRect(); return { tiles: t.length, inViewport: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, tileW: Math.round(t[0].querySelector('.card').getBoundingClientRect().width) }; })()`,
      );
      if (!sp || sp.tiles !== 8 || !sp.inViewport || sp.tileW < 90) failures.push(`spread ${JSON.stringify(sp)}`);
      const theirs = sides["opponent-side"]?.cards ?? [];
      const tp = (await pointOf(page, `#bfSpread .bf-spread-tile[data-spread-for="${theirs[5]}"] .card`))!;
      await page.mouse.move(tp.x, tp.y, { steps: 2 });
      await page.waitForTimeout(150);
      if (!(await previewShown(page))) failures.push("spread tile hover: no preview");
      await page.mouse.click(tp.x, tp.y);
      await page.waitForTimeout(80);
      if ((await page.evaluate<string | null>(`selectedCard`)) !== theirs[5]) failures.push("spread tile click should select the board card");
      if (!(await page.evaluate<boolean>(`!!document.getElementById('bfSpread')`))) failures.push("spread should stay open after a tile click");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(60);
      if (await page.evaluate<boolean>(`!!document.getElementById('bfSpread')`)) failures.push("Esc should close the spread");
      await page.evaluate(`document.querySelector('.battlefield[data-bf-id="${bf}"] .bf-units.player-side .bf-spread-chip').click()`);
      await page.waitForTimeout(60);
      await page.mouse.click(6, Math.round((await page.evaluate<number>(`innerHeight`)) - 6));
      await page.waitForTimeout(60);
      if (await page.evaluate<boolean>(`!!document.getElementById('bfSpread')`)) failures.push("outside click should close the spread");
      await page.evaluate(`cancelInteraction()`);

      // ---- battlefield unit → base by drag (rule 144.4.b) ----
      await game.p1.move(unit, bf);
      await game.settle({ policy: "first" });
      await cycleTurn(live);
      await page.evaluate(`render()`);
      const back = movesOf(backend, "standardMove").find((m) => m.params.destination === "base" && (m.params.unitIds as string[] | undefined)?.length === 1 && (m.params.unitIds as string[])[0] === unit);
      if (!back) failures.push("engine did not offer the battlefield→base standard move");
      else {
        await ui.clickCard(page, unit);
        const bar = await ui.actionBar(page);
        if (!bar?.buttons.some((b) => b.text === "Move to Base")) failures.push(`unit bar lacks Move to Base: ${JSON.stringify(bar?.buttons.map((b) => b.text))}`);
        if (!(await page.evaluate<boolean>(`document.getElementById('player-base').classList.contains('valid-target')`))) failures.push("base row not highlighted for the move");
        await page.evaluate(`cancelInteraction()`);
        const got = await ui.capture(page, () => page.locator(`#battlefieldRow .card[data-card-id="${unit}"]`).first().dragTo(page.locator(`#player-base`).first(), { timeout: 5000 }));
        if (got.length !== 1 || got[0]?.moveId !== "standardMove" || (got[0]?.params as { destination?: string }).destination !== "base" || JSON.stringify((got[0]?.params as { unitIds?: string[] }).unitIds) !== JSON.stringify([unit])) failures.push(`drag to base dispatched ${JSON.stringify(got)}`);
      }

      expect(failures).toEqual([]);
      // Token art (Recruit) has no image on the CDN → resource 404s are expected here; JS errors are not.
      expect(backend.pageErrors.filter((e) => !/favicon|card-image|Failed to load resource/.test(e))).toEqual([]);
    },
    LIVE_TIMEOUT * 2,
  );
});
