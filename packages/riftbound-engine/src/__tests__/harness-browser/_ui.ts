/**
 * DOM probes for the affordance suite: read what the live client SHOWS for the
 * moves the engine enumerates (sidebar action list, on-card action bar, choice
 * modal, targeting banner) and capture what a click WOULD dispatch without
 * sending it (executeMove is swapped for a recorder around the click).
 *
 * All scripts run inside the page (classic-script globals: gameState,
 * availableMoves, interaction, render, executeMove, …).
 */

import type { BrowserBackend } from "../../harness/browser";
import type { PwPage } from "../../harness/browser";

export interface UiButton {
  readonly text: string;
  /** Rendered inside the scrollport of its panel (or the panel can scroll to it). */
  readonly reachable: boolean;
  readonly disabled: boolean;
  readonly title: string;
}

export interface UiModal {
  readonly visible: boolean;
  readonly mode: string | null;
  readonly title: string;
  readonly subtitle: string;
  readonly buttons: readonly string[];
  readonly cards: readonly { readonly id: string | null; readonly label: string; readonly eligible: boolean }[];
  readonly hasCancel: boolean;
}

export interface Captured {
  readonly moveId: string;
  readonly params: Record<string, unknown>;
  readonly playerId?: string;
}

const norm = `((s) => String(s || "").replace(/\\s+/g, " ").trim())`;

/**
 * Neutralise cosmetic :hover lifts (rune fan / hand cards) so a hit point
 * computed from layout geometry is still on the card once the mouse arrives.
 * Idempotent.
 */
export async function prepare(page: PwPage): Promise<void> {
  await page.evaluate(`(() => {
    if (document.getElementById("__rbAffordanceCss")) return;
    const st = document.createElement("style");
    st.id = "__rbAffordanceCss";
    st.textContent = ".card:not(.exhausted):not(.card--exhausted):hover{transform:none!important} .rune-stack .card.exhausted:hover,.rune-stack .card.card--exhausted:hover{transform:rotate(90deg) scale(0.714)!important}";
    document.head.appendChild(st);
  })()`);
}

/** Sidebar `#actionsList` buttons (expanded groups included), top to bottom. */
export async function actionButtons(page: PwPage): Promise<UiButton[]> {
  return page.evaluate<UiButton[]>(`(() => {
    const norm = ${norm};
    const panel = document.getElementById("actionsPanel");
    return Array.from(document.querySelectorAll("#actionsList .action-btn")).map((b) => {
      const hidden = !!b.closest(".hidden");
      const canScroll = panel ? panel.scrollHeight > panel.clientHeight ? getComputedStyle(panel).overflowY !== "hidden" : true : true;
      return { text: norm(b.textContent), reachable: !hidden && b.offsetParent !== null && canScroll, disabled: !!b.disabled, title: b.getAttribute("title") || "" };
    });
  })()`);
}

/** Section titles of the sidebar action list, in order. */
export async function actionSections(page: PwPage): Promise<string[]> {
  return page.evaluate<string[]>(`Array.from(document.querySelectorAll("#actionsList .action-section-title")).map((e) => ${norm}(e.textContent))`);
}

/** Expand a collapsed sidebar move group (toggleMoveGroup) if it is collapsed. */
export async function expandGroup(page: PwPage, moveId: string): Promise<boolean> {
  return page.evaluate<boolean>(`(() => { const el = document.getElementById("move-group-" + ${JSON.stringify(moveId)}); if (!el) return false; if (el.classList.contains("hidden")) toggleMoveGroup(${JSON.stringify(moveId)}); return true; })()`);
}

/** The on-card action bar (after clicking a card): label + button texts; null when hidden. */
export async function actionBar(page: PwPage): Promise<{ label: string; buttons: UiButton[] } | null> {
  return page.evaluate(`(() => {
    const norm = ${norm};
    const bar = document.getElementById("actionBar");
    if (!bar || bar.classList.contains("hidden")) return null;
    return {
      label: norm(document.getElementById("actionBarLabel")?.textContent),
      buttons: Array.from(document.querySelectorAll("#actionBarBtns button")).map((b) => ({ text: norm(b.textContent), reachable: b.offsetParent !== null, disabled: !!b.disabled, title: b.getAttribute("title") || "" })),
    };
  })()`);
}

/** The shared choice modal (#choiceOverlay): pending-choice or play-cost mode. */
export async function modal(page: PwPage): Promise<UiModal> {
  return page.evaluate<UiModal>(`(() => {
    const norm = ${norm};
    const ov = document.getElementById("choiceOverlay");
    const visible = !!ov && ov.classList.contains("visible");
    const box = document.getElementById("choiceBox");
    return {
      visible,
      mode: ov ? (ov.dataset.mode || null) : null,
      title: norm(box?.querySelector(".chain-title")?.textContent),
      subtitle: norm(box?.querySelector(".chain-subtitle")?.textContent),
      buttons: box ? Array.from(box.querySelectorAll(".choice-modal-btn")).map((b) => norm(b.textContent)) : [],
      cards: box ? Array.from(box.querySelectorAll(".choice-modal-card")).map((c) => ({ id: c.getAttribute("data-card-id"), label: c.getAttribute("title") || norm(c.textContent), eligible: c.hasAttribute("data-pick-idx") || c.hasAttribute("data-variant-idx") })) : [],
      hasCancel: !!box?.querySelector(".choice-modal-cancel"),
    };
  })()`);
}

/** Targeting-mode banner: text + button labels; null when not targeting. */
export async function targetBanner(page: PwPage): Promise<{ text: string; buttons: string[]; validTargets: string[] } | null> {
  return page.evaluate(`(() => {
    const norm = ${norm};
    const b = document.getElementById("targetBanner");
    if (!b || !b.classList.contains("visible") || !document.body.classList.contains("targeting-mode")) return null;
    const own = Array.from(b.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ");
    return {
      text: norm(own),
      buttons: Array.from(b.querySelectorAll(".target-banner-btn")).map((x) => norm(x.textContent)),
      validTargets: Array.from(new Set(Array.from(document.querySelectorAll(".valid-target[data-card-id]")).map((e) => e.getAttribute("data-card-id")))),
    };
  })()`);
}

/**
 * Run `body` (clicks etc.) with executeMove swapped for a recorder; returns
 * what the UI tried to dispatch. Nothing reaches the server.
 */
export async function capture(page: PwPage, body: () => Promise<void>): Promise<Captured[]> {
  await page.evaluate(`(() => { window.__rbCap = []; if (!window.__rbExecOrig) window.__rbExecOrig = executeMove; executeMove = (moveId, params, playerId) => { window.__rbCap.push({ moveId, params, playerId }); }; })()`);
  try {
    await body();
  } finally {
    await page.evaluate(`(() => { if (window.__rbExecOrig) { executeMove = window.__rbExecOrig; window.__rbExecOrig = null; } })()`);
  }
  const got = await page.evaluate<Captured[]>(`window.__rbCap || []`);
  // Leave the client idle again (a captured click may have opened targeting / a modal).
  await page.evaluate(`(() => { try { closeChoiceModal(); } catch (e) {} try { cancelInteraction(); } catch (e) {} })()`);
  return got;
}

/**
 * A point on the card a player can actually hit: centre for ordinary cards, the
 * always-visible top strip for fanned rune stacks. Reports the element that
 * would swallow the click when the card is occluded there.
 */
export async function hitPoint(page: PwPage, cardId: string): Promise<{ x: number; y: number; occludedBy: string | null } | null> {
  return page.evaluate(`(() => {
    const el = document.querySelector('#game-scale-wrapper [data-card-id=' + JSON.stringify(${JSON.stringify(cardId)}) + ']') || document.querySelector('[data-card-id=' + JSON.stringify(${JSON.stringify(cardId)}) + ']');
    if (!el) return null;
    el.scrollIntoView({ block: "nearest" });
    const r = el.getBoundingClientRect();
    const rune = el.getAttribute("data-zone") === "runePool";
    const x = r.left + r.width / 2, y = rune ? r.top + 3 : r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    const ok = hit && (hit === el || el.contains(hit));
    return { x, y, occludedBy: ok ? null : (hit ? (hit.id ? "#" + hit.id : hit.getAttribute("data-card-id") ? "[card " + hit.getAttribute("data-card-id") + "]" : "." + String(hit.className).split(" ")[0]) : "nothing") };
  })()`);
}

/** Click a rendered card the way a player would (real mouse down/up at a visible point). Throws when occluded. */
export async function clickCard(page: PwPage, cardId: string, opts: { button?: "left" | "right" } = {}): Promise<void> {
  const pt = await hitPoint(page, cardId);
  if (!pt) {
    throw new Error(`clickCard: ${cardId} is not rendered`);
  }
  if (pt.occludedBy) {
    throw new Error(`clickCard: ${cardId} is covered by ${pt.occludedBy} at (${Math.round(pt.x)},${Math.round(pt.y)})`);
  }
  if (opts.button === "right") {
    // The bridge's mouse API is left-button only; fire the same DOM event a right-click produces.
    const [x, y] = [pt.x, pt.y];
    await page.evaluate(`(() => { const el = document.elementFromPoint(${x}, ${y}); if (el) el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: ${x}, clientY: ${y}, button: 2 })); })()`);
    return;
  }
  await page.mouse.click(pt.x, pt.y);
}

/** Click the first sidebar action button whose text starts with / contains `text`. */
export async function clickAction(page: PwPage, text: string, opts: { contains?: boolean } = {}): Promise<boolean> {
  return page.evaluate<boolean>(`(() => {
    const norm = ${norm};
    const want = ${JSON.stringify(text.toLowerCase())};
    const b = Array.from(document.querySelectorAll("#actionsList .action-btn")).find((el) => { const t = norm(el.textContent).toLowerCase(); return ${opts.contains ? "t.indexOf(want) >= 0" : "t.startsWith(want)"}; });
    if (!b) return false;
    b.scrollIntoView({ block: "nearest" });
    b.click();
    return true;
  })()`);
}

/** Click an action-bar button by (partial) text. */
export async function clickBarButton(page: PwPage, text: string): Promise<boolean> {
  return page.evaluate<boolean>(`(() => {
    const norm = ${norm};
    const want = ${JSON.stringify(text.toLowerCase())};
    const b = Array.from(document.querySelectorAll("#actionBar:not(.hidden) #actionBarBtns button")).find((el) => norm(el.textContent).toLowerCase().indexOf(want) >= 0);
    if (!b) return false;
    b.click();
    return true;
  })()`);
}

/** Click a choice-modal button by (partial) text. */
export async function clickModalButton(page: PwPage, text: string): Promise<boolean> {
  return page.evaluate<boolean>(`(() => {
    const norm = ${norm};
    const want = ${JSON.stringify(text.toLowerCase())};
    const b = Array.from(document.querySelectorAll("#choiceOverlay.visible .choice-modal-btn, #choiceOverlay.visible .choice-modal-cancel")).find((el) => norm(el.textContent).toLowerCase().indexOf(want) >= 0);
    if (!b) return false;
    b.click();
    return true;
  })()`);
}

/**
 * Inject a synthetic pendingChoice + resolvePendingChoice menu into the client
 * and re-render (nothing is sent). `requestResync()`/the next frame restores.
 */
export async function injectPending(page: PwPage, pending: Record<string, unknown>, variants: readonly Record<string, unknown>[], extraState: Record<string, unknown> = {}): Promise<void> {
  await page.evaluate(`(() => {
    const me = viewingPlayer;
    const pending = ${JSON.stringify(pending)};
    if (pending && pending.playerId === "$me") pending.playerId = me;
    if (pending && pending.prompter === "$me") pending.prompter = me;
    const extra = ${JSON.stringify(extraState)};
    gameState = Object.assign({}, gameState, extra, { pendingChoice: pending || undefined });
    availableMoves = ${JSON.stringify(variants)}.map((p) => ({ moveId: "resolvePendingChoice", params: Object.assign({ playerId: me }, p), playerId: me })).concat(extra.__keepMoves ? (window.__rbAvailableMoves || []).filter((m) => m.moveId !== "resolvePendingChoice") : []);
    window.__rbAvailableMoves = availableMoves;
    render();
  })()`);
}

/** Undo an injectPending: pull a fresh sync from the server and wait for it. */
export async function resync(backend: BrowserBackend): Promise<void> {
  const before = await backend.page.evaluate<number>(`(typeof lastSeq !== "undefined" ? lastSeq : -1)`);
  await backend.page.evaluate(`requestResync()`);
  await backend.page.waitForFunction(`(typeof lastSeq !== "undefined" ? lastSeq : -1) > ${before}`, undefined, { timeout: 5000 }).catch(() => undefined);
  await backend.refresh();
}

/** Bounding boxes of two selectors overlap (both present)? */
export async function overlaps(page: PwPage, a: string, b: string): Promise<boolean | null> {
  return page.evaluate<boolean | null>(`(() => {
    const ea = document.querySelector(${JSON.stringify(a)}), eb = document.querySelector(${JSON.stringify(b)});
    if (!ea || !eb) return null;
    const ra = ea.getBoundingClientRect(), rb = eb.getBoundingClientRect();
    if (ra.width === 0 || rb.width === 0) return null;
    return !(ra.right <= rb.left || rb.right <= ra.left || ra.bottom <= rb.top || rb.bottom <= ra.top);
  })()`);
}

/** Is every matched element fully inside its nearest clipping ancestor (overflow != visible)? Returns offenders. */
export async function clippedElements(page: PwPage, selector: string, tolerancePx = 2): Promise<string[]> {
  return page.evaluate<string[]>(`(() => {
    const tol = ${tolerancePx};
    const out = [];
    for (const el of document.querySelectorAll(${JSON.stringify(selector)})) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      let p = el.parentElement;
      while (p && p !== document.body) {
        const cs = getComputedStyle(p);
        if (cs.overflow !== "visible" || cs.overflowX !== "visible" || cs.overflowY !== "visible") {
          const pr = p.getBoundingClientRect();
          const scrolls = (cs.overflowY === "auto" || cs.overflowY === "scroll") && p.scrollHeight > p.clientHeight;
          if (!scrolls && (r.top < pr.top - tol || r.bottom > pr.bottom + tol || r.left < pr.left - tol || r.right > pr.right + tol)) {
            out.push((el.getAttribute("data-card-id") || el.id || el.className) + " in " + (p.id || p.className) + " [" + Math.round(r.top) + "," + Math.round(r.bottom) + " vs " + Math.round(pr.top) + "," + Math.round(pr.bottom) + "]");
          }
          break;
        }
        p = p.parentElement;
      }
    }
    return out;
  })()`);
}
