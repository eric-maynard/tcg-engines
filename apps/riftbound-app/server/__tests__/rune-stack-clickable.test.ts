/**
 * [rule:ui-rune-ready-stays-clickable] / rule 133.5.a.1 — "every rune must be
 * individually clickable to exhaust".
 *
 * The rune fan gave every card `z-index = 10 + i`, so a tapped (exhausted) rune —
 * whose rotated footprint is 110px tall over a 26px fan step — painted over the
 * CENTRE of the ready rune above it in the pool. A centre-targeting click (any
 * human aiming at the card, and Playwright's click) then landed on the exhausted
 * rune instead, and the only ready Chaos Rune could not be exhausted at all.
 *
 * Ready runes now stack in a band above every exhausted one (exhausted 10+i, ready
 * 100+i — the split the stylesheet's `.rune-stack { isolation: isolate }` comment
 * already documents).
 *
 * Same sandbox-eval pattern as cost-payment-power.test.ts: the browser script is
 * evaluated with stub globals, no DOM library.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

interface RuneCard {
  id: string;
  domain: string;
  meta?: { exhausted?: boolean };
}
interface Api {
  renderRuneStacks(runes: RuneCard[], opts?: Record<string, unknown>): string;
}

function loadRunes(): Api {
  const src = readFileSync(
    path.resolve(import.meta.dir, "../../public/js/gameplay/render/runes.js"),
    "utf8",
  );
  const mod: { exports?: Api } = { exports: {} as Api };
  const doc = {
    readyState: "complete",
    addEventListener() {},
    getElementById: () => null,
    querySelectorAll: () => [] as unknown[],
  };
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = { setSandboxMode: null };
  g.esc = (s: unknown) => String(s ?? "");
  g.DOMAIN_COLORS = { chaos: "#a04070", fury: "#c04030" };
  g.selectedCard = null;
  g.interaction = { mode: "idle", sourceCardId: null };
  g._cardImgLoadAttrs = () => ({ img: "", fallbackStyle: "" });
  const fn = new Function("module", "document", `${src}\nreturn module.exports;`);
  return fn(mod, doc) as Api;
}

const API = loadRunes();

/** z-index of each rendered card, in DOM order. */
function zIndexes(html: string): number[] {
  return [...html.matchAll(/z-index:(\d+)/g)].map(m => Number(m[1]));
}

/** The monkey's pool at trace steps 7/8: one ready Chaos rune under an exhausted one. */
const chaosStack: RuneCard[] = [
  { id: "player-1-rune-8-ogn-166-298", domain: "chaos" },
  { id: "player-1-rune-10-ogn-166-298", domain: "chaos", meta: { exhausted: true } },
];

describe("rune fan stacking", () => {
  test("BUG repro: an exhausted rune never paints over a ready one", () => {
    const [ready, exhausted] = zIndexes(API.renderRuneStacks(chaosStack));
    expect(ready).toBeGreaterThan(exhausted);
  });

  test("within a readiness band, later in the fan still stacks on top", () => {
    const twoReady: RuneCard[] = [
      { id: "r1", domain: "chaos" },
      { id: "r2", domain: "chaos" },
    ];
    const [first, second] = zIndexes(API.renderRuneStacks(twoReady));
    expect(second).toBeGreaterThan(first);

    const twoExhausted = twoReady.map(r => ({ ...r, meta: { exhausted: true } }));
    const [a, b] = zIndexes(API.renderRuneStacks(twoExhausted));
    expect(b).toBeGreaterThan(a);
  });

  test("[rule:ui-rune-row-stable] tapping a rune moves no other rune", () => {
    const before = API.renderRuneStacks(chaosStack);
    const after = API.renderRuneStacks([
      { ...chaosStack[0], meta: { exhausted: true } },
      chaosStack[1],
    ]);
    const tops = (html: string) => [...html.matchAll(/top:(-?\d+)px/g)].map(m => Number(m[1]));
    expect(tops(after)).toEqual(tops(before));
  });
});
