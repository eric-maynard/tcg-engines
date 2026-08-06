/**
 * Visual act mode: express a resolved engine move as the real UI gesture
 * (selectors from docs/harness/02-ui-surface.md §1/§3) instead of calling
 * `executeMove` directly. The gesture is considered "dispatched" when the
 * client's WS request counter advances; the caller then awaits the outcome
 * exactly like semantic mode and cross-checks the frame the UI actually sent.
 *
 * Coverage (everything else returns {dispatched:false} → semantic fallback):
 *   exhaustRune          click the rune in the rune pool
 *   playUnit (to base)   click hand card [→ play-cost modal variant]
 *   playGear (untargeted) click hand card
 *   playSpell            click hand card [→ click each .valid-target → "Done"/"No target" banner button]
 *   passChainPriority / passShowdownFocus   Space
 *   endTurn              #actionsList "End Turn" button (Space as fallback)
 *   resolvePendingChoice #choiceOverlay .choice-modal-card[data-pick-idx] / .choice-modal-btn[data-other-idx]
 *   standardMove (1 unit from base) drag unit → .battlefield[data-drop-zone]
 *   recallUnit / gankingMove         click unit → action-bar button
 */

import type { PwPage } from "./playwright-loader";
import {
  CLICK_ACTION_BUTTON_FN,
  PENDING_PICK_INDEX_FN,
  PLAY_VARIANT_INDEX_FN,
  READ_FRAME,
  call,
} from "./page-scripts";
import type { PageRead } from "./snapshot-adapter";
import type { FlatMove } from "../types";

export interface VisualOutcome {
  /** true when the UI sent a WS move as a result of the gesture. */
  readonly dispatched: boolean;
  readonly gesture: string;
  /** requestId of the frame the UI sent (when dispatched). */
  readonly requestId?: string;
  /** What the UI actually sent (from the socket tap), for cross-checking. */
  readonly sent?: { moveId: string; params: Record<string, unknown> };
  /** Why we could not (fully) express the move visually. */
  readonly note?: string;
}

const q = (s: string) => JSON.stringify(s);

function cardSel(id: string, zone?: string): string {
  return `#game-scale-wrapper [data-card-id=${q(id)}]${zone ? `[data-zone=${q(zone)}]` : ""}, [data-card-id=${q(id)}]${zone ? `[data-zone=${q(zone)}]` : ""}`;
}

async function read(page: PwPage): Promise<PageRead | null> {
  return page.evaluate<PageRead | null>(READ_FRAME);
}

async function counter(page: PwPage): Promise<number> {
  return (await read(page))?.requestCounter ?? 0;
}

/** Poll until the client's request counter passes `before` (a WS move was sent). */
async function awaitDispatch(page: PwPage, before: number, ms = 900): Promise<string | undefined> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const now = await counter(page);
    if (now > before) {
      return `req-${now}`;
    }
    await page.waitForTimeout(40);
  }
  return undefined;
}

async function lastSent(page: PwPage): Promise<{ moveId: string; params: Record<string, unknown>; requestId?: string } | undefined> {
  return page.evaluate(`(() => { const H = window.__rbHarness; return H && H.sent.length ? H.sent[H.sent.length - 1] : null; })()`).then(
    (v) => (v as { moveId: string; params: Record<string, unknown> } | null) ?? undefined,
  );
}

async function visible(page: PwPage, selector: string): Promise<boolean> {
  try {
    const loc = page.locator(selector).first();
    return (await loc.count()) > 0 && (await loc.isVisible());
  } catch {
    return false;
  }
}

/** null = clicked; otherwise the reason it was not. */
async function tryClick(
  page: PwPage,
  selector: string,
  opts: { timeout?: number; position?: { x: number; y: number } } = {},
): Promise<string | null> {
  const loc = page.locator(selector).first();
  if ((await loc.count()) === 0) {
    return "not in DOM";
  }
  try {
    await loc.click({ position: opts.position, timeout: opts.timeout ?? 1500 });
    return null;
  } catch (error) {
    return `click failed: ${String((error as Error).message ?? error).split("\n")[0]?.slice(0, 160)}`;
  }
}

async function clickIf(page: PwPage, selector: string, timeout = 1500): Promise<boolean> {
  return (await tryClick(page, selector, { timeout })) === null;
}

async function finish(page: PwPage, before: number, gesture: string, note?: string): Promise<VisualOutcome> {
  const requestId = await awaitDispatch(page, before);
  if (!requestId) {
    return { dispatched: false, gesture, note: note ?? `${gesture}: UI did not dispatch a move` };
  }
  const sent = await lastSent(page);
  return { dispatched: true, gesture, note, requestId, sent: sent ? { moveId: sent.moveId, params: sent.params } : undefined };
}

/** Try to perform `move` through the DOM. Never throws; un-mappable moves come back undispatched. */
export async function performVisual(page: PwPage, move: FlatMove): Promise<VisualOutcome> {
  const p = move.params;
  const before = await counter(page);
  try {
    switch (move.moveId) {
      case "exhaustRune": {
        const id = String(p.runeId);
        // Runes of one domain are fanned 26px apart (render/runes.js): aim at the always-visible top strip.
        const why = await tryClick(page, cardSel(id, "runePool"), { position: { x: 14, y: 7 } });
        if (why !== null) {
          return { dispatched: false, gesture: "click rune", note: `rune ${id}: ${why}` };
        }
        return finish(page, before, `click rune ${id}`);
      }

      case "playUnit":
      case "playGear": {
        const id = String(p.cardId);
        const loc = p.location === undefined ? "base" : String(p.location);
        if (move.moveId === "playUnit" && loc !== "base") {
          return { dispatched: false, gesture: "play to battlefield", note: "hand→battlefield play has no click gesture (drag targets base only)" };
        }
        if (p.chosenTargetId !== undefined || (Array.isArray(p.targets) && p.targets.length > 0)) {
          return playWithTargets(page, move, before);
        }
        if (!(await clickIf(page, cardSel(id, "hand")))) {
          return { dispatched: false, gesture: "click hand card", note: `card ${id} not in hand DOM` };
        }
        let requestId = await awaitDispatch(page, before, 500);
        if (!requestId && (await visible(page, `#choiceOverlay.visible[data-mode="playCost"]`))) {
          const idx = await page.evaluate<number>(call(PLAY_VARIANT_INDEX_FN, id, p));
          if (idx < 0) {
            await clickIf(page, "#choiceOverlay .choice-modal-cancel", 800);
            return { dispatched: false, gesture: "play-cost modal", note: "no modal variant matches the resolved params" };
          }
          await clickIf(page, `#choiceOverlay .choice-modal-btn[data-variant-idx="${idx}"]`);
          requestId = await awaitDispatch(page, before);
          if (!requestId) {
            return { dispatched: false, gesture: "play-cost modal", note: "variant button did not dispatch" };
          }
          const sent = await lastSent(page);
          return { dispatched: true, gesture: `click hand ${id} → modal variant #${idx}`, requestId, sent };
        }
        if (!requestId && (await visible(page, "#targetBanner.visible"))) {
          // Untargeted variant of a targetable card: "No target" banner button.
          await page.evaluate(
            `(() => { const b = Array.from(document.querySelectorAll('#targetBanner .target-banner-btn')).find((el) => /no target/i.test(el.textContent || '')); if (b) b.click(); })()`,
          );
          return finish(page, before, `click hand ${id} → "No target"`);
        }
        if (!requestId) {
          // Action bar (cardSelected) → first button.
          if (await visible(page, "#actionBar:not(.hidden) #actionBarBtns button")) {
            await clickIf(page, "#actionBar:not(.hidden) #actionBarBtns button");
            return finish(page, before, `click hand ${id} → action bar`);
          }
          return { dispatched: false, gesture: `click hand ${id}`, note: "click did not dispatch (no modal / banner / action bar)" };
        }
        const sent = await lastSent(page);
        return { dispatched: true, gesture: `click hand ${id}`, requestId, sent };
      }

      case "playSpell": {
        const targets = Array.isArray(p.targets) ? (p.targets as string[]) : [];
        if (p.repeatCount || p.paidAdditionalCost || p.viaFlow || p.xAmount) {
          return { dispatched: false, gesture: "cast", note: "repeat / additional-cost / flow / X variants are not expressible by clicking (UI gap)" };
        }
        if (targets.length === 0) {
          const id = String(p.cardId);
          if (!(await clickIf(page, cardSel(id, "hand")))) {
            return { dispatched: false, gesture: "click hand spell", note: `card ${id} not in hand DOM` };
          }
          const requestId = await awaitDispatch(page, before, 500);
          if (!requestId && (await visible(page, "#targetBanner.visible"))) {
            await page.evaluate(
              `(() => { const b = Array.from(document.querySelectorAll('#targetBanner .target-banner-btn')).find((el) => /no target/i.test(el.textContent || '')); if (b) b.click(); })()`,
            );
            return finish(page, before, `click hand ${id} → "No target"`);
          }
          return requestId
            ? { dispatched: true, gesture: `click hand ${id}`, requestId, sent: await lastSent(page) }
            : { dispatched: false, gesture: `click hand ${id}`, note: "click did not dispatch" };
        }
        return playWithTargets(page, move, before);
      }

      case "passChainPriority":
      case "passShowdownFocus": {
        await page.evaluate(`(() => { window.__rbTurnActionInFlight = false; if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); })()`);
        await page.keyboard.press("Space");
        return finish(page, before, "Space (pass)");
      }

      case "endTurn": {
        const clicked = await page.evaluate<boolean>(call(CLICK_ACTION_BUTTON_FN, "End Turn"));
        if (!clicked) {
          await page.evaluate(`(() => { window.__rbTurnActionInFlight = false; if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); })()`);
          await page.keyboard.press("Space");
          return finish(page, before, "Space (end turn)", "#actionsList had no End Turn button; used Space");
        }
        return finish(page, before, 'click "End Turn"');
      }

      case "resolvePendingChoice": {
        const { playerId: _pid, ...rest } = p as Record<string, unknown>;
        let where = await page.evaluate<{ kind: string; idx: number } | null>(call(PENDING_PICK_INDEX_FN, p));
        if (!where) {
          where = await page.evaluate<{ kind: string; idx: number } | null>(call(PENDING_PICK_INDEX_FN, rest));
        }
        if (!where) {
          return { dispatched: false, gesture: "choice modal", note: "no modal element matches the resolved params" };
        }
        const sel =
          where.kind === "card"
            ? `#choiceOverlay.visible .choice-modal-card[data-pick-idx="${where.idx}"]`
            : `#choiceOverlay.visible .choice-modal-btn[data-other-idx="${where.idx}"]`;
        if (!(await clickIf(page, sel))) {
          // Board glow alternative for card picks.
          if (where.kind === "card" && typeof p.pickedCardId === "string" && (await clickIf(page, cardSel(p.pickedCardId)))) {
            return finish(page, before, `click board card ${String(p.pickedCardId)} (pending pick)`);
          }
          return { dispatched: false, gesture: "choice modal", note: `${sel} not clickable` };
        }
        return finish(page, before, `click ${where.kind === "card" ? "modal card" : "modal button"} #${where.idx}`);
      }

      case "standardMove": {
        const units = Array.isArray(p.unitIds) ? (p.unitIds as string[]) : [];
        if (units.length !== 1) {
          return { dispatched: false, gesture: "drag unit", note: "multi-unit standardMove has no UI gesture (UI gap)" };
        }
        const unit = units[0] as string;
        const dest = String(p.destination);
        const from = page.locator(cardSel(unit)).first();
        const to = page.locator(dest === "base" ? `#player-base[data-drop-zone="player-base"]` : `.battlefield[data-drop-zone=${q(dest)}], .battlefield[data-bf-id=${q(dest)}]`).first();
        if ((await from.count()) === 0 || (await to.count()) === 0) {
          return { dispatched: false, gesture: "drag unit", note: "unit or destination not in DOM" };
        }
        await from.dragTo(to, { timeout: 3000 });
        return finish(page, before, `drag ${unit} → ${dest}`);
      }

      case "recallUnit":
      case "gankingMove": {
        const unit = String(p.unitId);
        if (!(await clickIf(page, cardSel(unit)))) {
          return { dispatched: false, gesture: "click unit", note: `unit ${unit} not in DOM` };
        }
        const label = move.moveId === "recallUnit" ? "Recall" : "Gank";
        const clicked = await page.evaluate<boolean>(
          `(() => { const b = Array.from(document.querySelectorAll('#actionBar:not(.hidden) #actionBarBtns button')).find((el) => (el.textContent || '').indexOf(${q(label)}) >= 0); if (!b) return false; b.click(); return true; })()`,
        );
        if (!clicked) {
          return { dispatched: false, gesture: `click unit → ${label}`, note: "action-bar button missing" };
        }
        return finish(page, before, `click unit ${unit} → ${label}`);
      }

      default: {
        return { dispatched: false, gesture: move.moveId, note: `no visual mapping for ${move.moveId}` };
      }
    }
  } catch (error) {
    return { dispatched: false, gesture: move.moveId, note: `visual gesture threw: ${String((error as Error).message ?? error).slice(0, 200)}` };
  }
}

/** hand card click → targeting mode → click each target → (Done) */
async function playWithTargets(page: PwPage, move: FlatMove, before: number): Promise<VisualOutcome> {
  const p = move.params;
  const id = String(p.cardId);
  const targets = Array.isArray(p.targets) ? (p.targets as string[]) : p.chosenTargetId ? [String(p.chosenTargetId)] : [];
  if (!(await clickIf(page, cardSel(id, "hand")))) {
    return { dispatched: false, gesture: "click hand card", note: `card ${id} not in hand DOM` };
  }
  // Single-variant cards dispatch on the click itself.
  let requestId = await awaitDispatch(page, before, 250);
  if (requestId) {
    return { dispatched: true, gesture: `click hand ${id}`, requestId, sent: await lastSent(page) };
  }
  const inTargeting = await page.evaluate<boolean>(`document.body.classList.contains("targeting-mode")`);
  if (!inTargeting) {
    return { dispatched: false, gesture: `click hand ${id}`, note: "targeting mode did not open" };
  }
  for (const t of targets) {
    if (!(await clickIf(page, `[data-card-id=${q(t)}].valid-target`, 1500))) {
      await page.keyboard.press("Escape");
      return { dispatched: false, gesture: `target ${t}`, note: `target ${t} is not a .valid-target in the DOM` };
    }
    requestId = await awaitDispatch(page, before, 250);
    if (requestId) {
      return { dispatched: true, gesture: `click hand ${id} → target ${targets.join("+")}`, requestId, sent: await lastSent(page) };
    }
  }
  // Multi-target exact variant: "Done (n)".
  await page.evaluate(
    `(() => { const b = Array.from(document.querySelectorAll('#targetBanner .target-banner-btn')).find((el) => /done|no target/i.test(el.textContent || '')); if (b) b.click(); })()`,
  );
  return finish(page, before, `click hand ${id} → targets ${targets.join("+")} → Done`);
}
