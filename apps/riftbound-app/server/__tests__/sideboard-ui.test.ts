/**
 * Sideboarding overlay (public/js/gameplay/pregame.js §Sideboarding — the
 * `SideboardUI` model + HTML): dense Main | Side lists, one row per distinct
 * card with −/+ steppers, row order fixed for the whole step, ghost rows for
 * incoming copies, swap summary, size validation, and the batch `sideboard_lock`
 * frame computed from the quantity deltas. The browser script is evaluated in a
 * sandbox with a synthetic pregame frame (no DOM library needed): the model is
 * exercised directly and the rendered HTML is checked as a string.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

interface Card { id: string; defId: string; name: string; cardType: string; energyCost: number }
interface Model { mainRows: string[]; sideRows: string[]; delta: Record<string, number>; sel: { col: string; defId: string } | null; mainSize: number; sideSize: number; sideMax: number; key: string }
interface SB {
  buildModel(you: unknown, rules?: unknown, gid?: string): Model;
  adjust(m: Model, defId: string, dir: number): boolean;
  canAdjust(m: Model, defId: string, dir: number): boolean;
  reset(m: Model): void;
  mainCount(m: Model, defId: string): number;
  sideCount(m: Model, defId: string): number;
  totals(m: Model): { main: number; side: number; net: number };
  validity(m: Model): { ok: boolean; reason: string | null; warn: string | null };
  summary(m: Model): { text: string; swaps: number; nIn: number; nOut: number; outs: { name: string; count: number }[]; ins: { name: string; count: number }[] };
  computeSwaps(m: Model, you: unknown): { swaps: { out: string; in: string }[]; balanced: boolean; outgoing: string[]; incoming: string[] };
  lockMessages(m: Model, you: unknown): { type: string; swaps: { out: string; in: string }[] }[];
  columnRows(m: Model, col: string): { col: string; defId: string; ghost: boolean }[];
  allRows(m: Model): { col: string; defId: string; ghost: boolean }[];
  stepHtml(pregame: unknown, m: Model, opts?: unknown): string;
}

function loadSideboardUI(): SB {
  const src = readFileSync(path.resolve(import.meta.dir, "../../public/js/gameplay/pregame.js"), "utf8");
  const mod: { exports?: SB } = { exports: {} as SB };
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)) };
  // Browser globals the script may probe; `document`/`window` are absent so no DOM wiring runs.
  const fn = new Function("module", "localStorage", "sessionStorage", `${src}\nreturn module.exports;`);
  return fn(mod, storage, storage) as SB;
}

const SB = loadSideboardUI();

function mk(col: "main" | "side", defs: [string, string, string, number, number][]): Card[] {
  return defs.flatMap(([defId, name, cardType, energyCost, n], j) => Array.from({ length: n }, (_, i) => ({ cardType, defId, energyCost, id: `player-1-${col}-${j * 4 + i}-${defId}`, name })));
}
function frame() {
  const main = mk("main", [
    ["u-merchant", "Traveling Merchant", "unit", 2, 3],
    ["s-frigid", "Frigid Touch", "spell", 1, 3],
    ["s-gust", "Gust", "spell", 1, 2],
    ["u-phoenix", "Immortal Phoenix", "unit", 3, 2],
    ["g-seal", "Seal of Rage", "gear", 0, 2],
  ]);
  const side = mk("side", [
    ["s-cleave", "Cleave", "spell", 1, 3],
    ["s-gust", "Gust", "spell", 1, 1], // Same card on both sides
    ["s-beam", "Thermo Beam", "spell", 5, 2],
  ]);
  return {
    opponent: { battlefields: [{ id: "b", name: "Targon's Peak" }], champion: { id: "c", name: "Jinx" }, legend: { id: "l", name: "Jinx" }, name: "Goldfish", status: "locked" },
    phase: "sideboard",
    sandbox: false,
    you: { championName: "Jinx", locked: false, main, mainSize: main.length, side, sideMax: 10, sideSize: side.length },
  };
}
const rowOrder = (html: string, listId: string) => {
  const start = html.indexOf(`id="${listId}"`);
  const end = listId === "sbMainList" ? html.indexOf('id="sbSideList"') : html.length;
  return [...html.slice(start, end).matchAll(/data-sb-col="(?:main|side)" data-sb-def="([^"]+)"([^>]*)>/g)].map((m) => `${m[1]}${m[2]!.includes('data-sb-ghost="1"') ? "*" : ""}`);
};

describe("sideboard overlay model", () => {
  test("rows: one per distinct card, fixed order (type → cost → name); Main = registered main cards, Side = registered side cards; a card in both gets a row in both", () => {
    const m = SB.buildModel(frame().you, { sideboardMax: 10 }, "g1");
    expect(m.mainRows).toEqual(["u-merchant", "u-phoenix", "s-frigid", "s-gust", "g-seal"]);
    expect(m.sideRows).toEqual(["s-cleave", "s-gust", "s-beam"]);
    expect(m.mainSize).toBe(12);
    expect(m.sideSize).toBe(6);
    expect(Object.values(m.delta).every((d) => d === 0)).toBe(true);
    expect(SB.validity(m).ok).toBe(true);
    expect(SB.summary(m)).toMatchObject({ swaps: 0, text: "No swaps" });
  });

  test("steppers change quantities + summary; rows keep their index (never re-sort); incoming copies show as ghost rows appended at the bottom of the receiving column", () => {
    const f = frame();
    const m = SB.buildModel(f.you, {}, "g1");
    const mainBefore = rowOrder(SB.stepHtml(f, m), "sbMainList");
    const sideBefore = rowOrder(SB.stepHtml(f, m), "sbSideList");
    expect(mainBefore).toEqual(["u-merchant", "u-phoenix", "s-frigid", "s-gust", "g-seal"]);
    expect(sideBefore).toEqual(["s-cleave", "s-gust", "s-beam"]);

    // Main "−" ×2 on Frigid Touch (3 → 1), Side "−" ×3 on Cleave (bring 3 in) ⇒ unbalanced by +1.
    expect(SB.adjust(m, "s-frigid", -1)).toBe(true);
    expect(SB.adjust(m, "s-frigid", -1)).toBe(true);
    expect(SB.adjust(m, "s-cleave", +1)).toBe(true);
    expect(SB.adjust(m, "s-cleave", +1)).toBe(true);
    expect(SB.adjust(m, "s-cleave", +1)).toBe(true);
    expect(SB.canAdjust(m, "s-cleave", +1)).toBe(false); // All 3 side copies already coming in
    expect(SB.adjust(m, "s-cleave", +1)).toBe(false);
    expect(SB.canAdjust(m, "u-merchant", +1)).toBe(false); // Nothing of it in the sideboard to pull ("original + incoming" cap)
    expect(SB.mainCount(m, "s-frigid")).toBe(1);
    expect(SB.sideCount(m, "s-frigid")).toBe(2);
    expect(SB.mainCount(m, "s-cleave")).toBe(3);
    expect(SB.totals(m)).toEqual({ main: 13, net: 1, side: 5 });
    const v = SB.validity(m);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("13/12");
    expect(SB.summary(m)).toMatchObject({ nIn: 3, nOut: 2, text: "−2 Frigid Touch · +3 Cleave" });

    const html = SB.stepHtml(f, m);
    // Real rows unchanged in place; ghosts appended: Cleave arrives at the bottom of Main, Frigid Touch at the bottom of Side.
    expect(rowOrder(html, "sbMainList")).toEqual([...mainBefore, "s-cleave*"]);
    expect(rowOrder(html, "sbSideList")).toEqual([...sideBefore, "s-frigid*"]);
    expect(html).toContain("&times;3 &rarr; &times;1");
    expect(html).toContain("2 &rarr; side");
    expect(html).toMatch(/id="sbMainCount" class="sb-count--bad">13<\/b>\/12/);
    expect(html).toMatch(/id="sbSideCount" class="">5<\/b>\/10/);
    // Invalid sizes ⇒ Lock disabled with the reason; validity line is "bad".
    expect(html).toMatch(/id="sbLockBtn" type="button" disabled title="Main deck is 13\/12/);
    expect(html).toContain('id="sbValidity" class="sb-validity sb-validity--bad"');
    expect(html).toMatch(/id="sbSwapCount">3</);

    // Balance it: one more Frigid Touch out ⇒ 3 swaps, Lock enabled.
    expect(SB.adjust(m, "s-frigid", -1)).toBe(true);
    expect(SB.canAdjust(m, "s-frigid", -1)).toBe(false); // At 0
    expect(SB.validity(m).ok).toBe(true);
    const ok = SB.stepHtml(f, m);
    expect(ok).toMatch(/id="sbLockBtn" type="button"\s+title="Apply these swaps and lock in">Lock in \(3 swaps\)/);
    expect(rowOrder(ok, "sbMainList")).toEqual([...mainBefore, "s-cleave*"]); // Still no reordering; the ×0 row stays put
    expect(ok).toContain("sb-row--zero");

    // A card present in both columns adjusts both real rows, no ghost.
    expect(SB.adjust(m, "s-gust", +1)).toBe(true);
    const both = SB.stepHtml(f, m);
    expect(rowOrder(both, "sbMainList")).toEqual([...mainBefore, "s-cleave*"]);
    expect(rowOrder(both, "sbSideList")).toEqual([...sideBefore, "s-frigid*"]);
    expect(SB.mainCount(m, "s-gust")).toBe(3);
    expect(SB.sideCount(m, "s-gust")).toBe(0);

    // Reset ⇒ back to registered, ghosts gone, order unchanged.
    SB.reset(m);
    const reset = SB.stepHtml(f, m);
    expect(rowOrder(reset, "sbMainList")).toEqual(mainBefore);
    expect(rowOrder(reset, "sbSideList")).toEqual(sideBefore);
    expect(SB.summary(m).swaps).toBe(0);
  });

  test("lock emits ONE `sideboard_lock` frame whose swaps realise the quantity deltas 1-for-1 against the server's current lists", () => {
    const f = frame();
    const m = SB.buildModel(f.you, {}, "g1");
    SB.adjust(m, "s-frigid", -1);
    SB.adjust(m, "s-frigid", -1);
    SB.adjust(m, "g-seal", -1);
    SB.adjust(m, "s-cleave", +1);
    SB.adjust(m, "s-cleave", +1);
    SB.adjust(m, "s-beam", +1);
    expect(SB.validity(m).ok).toBe(true);
    const plan = SB.computeSwaps(m, f.you);
    expect(plan.balanced).toBe(true);
    expect(plan.swaps).toHaveLength(3);
    const byDef = (ids: string[]) => ids.map((id) => id.split("-").slice(4).join("-")).sort();
    expect(byDef(plan.outgoing)).toEqual(["g-seal", "s-frigid", "s-frigid"]);
    expect(byDef(plan.incoming)).toEqual(["s-beam", "s-cleave", "s-cleave"]);
    expect(plan.outgoing.every((id) => f.you.main.some((c) => c.id === id))).toBe(true);
    expect(plan.incoming.every((id) => f.you.side.some((c) => c.id === id))).toBe(true);
    const msgs = SB.lockMessages(m, f.you);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.type).toBe("sideboard_lock");
    expect(msgs[0]!.swaps).toEqual(plan.swaps);
    expect(new Set(msgs[0]!.swaps.map((s) => s.out)).size).toBe(3);
    expect(new Set(msgs[0]!.swaps.map((s) => s.in)).size).toBe(3);

    // Unbalanced ⇒ not ok, and computeSwaps says so (the button is disabled before this could be sent).
    SB.adjust(m, "s-beam", +1);
    expect(SB.validity(m).ok).toBe(false);
    expect(SB.computeSwaps(m, f.you).balanced).toBe(false);
  });

  test("baseline survives earlier server-side swaps (reconnect): origin tags give m0/s0, current placement gives the initial delta; undoing sends the crossed instances back", () => {
    const f = frame();
    // Server already holds one swap: main[3] (Frigid Touch #0) ↔ side[0] (Cleave #0).
    const out = f.you.main[3]!;
    const inn = f.you.side[0]!;
    f.you.main[3] = inn;
    f.you.side[0] = out;
    const m = SB.buildModel(f.you, {}, "g1");
    expect(m.mainRows).toEqual(["u-merchant", "u-phoenix", "s-frigid", "s-gust", "g-seal"]); // Same fixed order
    expect(m.delta["s-frigid"]).toBe(-1);
    expect(m.delta["s-cleave"]).toBe(1);
    expect(SB.summary(m).text).toBe("−1 Frigid Touch · +1 Cleave");
    expect(SB.computeSwaps(m, f.you).swaps).toEqual([]); // Nothing further to send
    SB.reset(m); // Back to registered ⇒ one swap that returns exactly the crossed pair
    expect(SB.computeSwaps(m, f.you).swaps).toEqual([{ in: out.id, out: inn.id }]);
  });

  test("locked / spectator frames render read-only (no steppers, no Lock button); sandbox shows the skip toggle", () => {
    const f = frame();
    const m = SB.buildModel(f.you, {}, "g1");
    const locked = SB.stepHtml({ ...f, you: { ...f.you, locked: true } }, m);
    expect(locked).not.toContain("sb-step");
    expect(locked).not.toContain('id="sbLockBtn"');
    expect(locked).toContain('id="sbWaiting"');
    expect(locked).toContain("Both locked in");
    const spec = SB.stepHtml({ ...f, you: null }, m);
    expect(spec).toContain("Spectating");
    expect(SB.stepHtml({ ...f, sandbox: true }, m)).toContain('id="sbSkipToggle"');
    expect(SB.stepHtml(f, m)).toContain('id="sbOpponent"');
  });
});
