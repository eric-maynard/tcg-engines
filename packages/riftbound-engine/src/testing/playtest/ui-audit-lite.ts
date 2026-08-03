#!/usr/bin/env bun
/**
 * UI Audit (lite) — no-browser structural check.
 *
 * Fetches the served HTML at /play and verifies the expected board-region
 * element IDs are present in the markup, then hits /api/cards to confirm
 * the card database loaded. Runs anywhere `fetch` reaches the server —
 * no Playwright / chromium needed.
 *
 *   bun packages/riftbound-engine/src/testing/playtest/ui-audit-lite.ts [http://localhost:3000]
 */

// HTMLRewriter is a Bun global (Cloudflare-compatible streaming parser).
declare const HTMLRewriter: {
  new (): {
    on(sel: string, h: { element(el: { getAttribute(n: string): string | null }): void }): unknown;
    transform(r: Response): Response;
  };
};

const BASE = process.argv[2] ?? process.env.RIFTBOUND_URL ?? "http://localhost:3000";

const REQUIRED_IDS = [
  "board",
  "startScreen",
  "sandboxOption",
  "deckSelect",
  "lobbyStartBtn",
  "phaseBar",
  "battlefieldRow",
  "opponent-hand",
  "opponent-runePool",
  "player-base",
  "resourceBar",
  "player-runePool",
  "player-hand",
  "player-decks",
  "actionBar",
  "gameLog",
  "playerInfo",
  "opponentInfo",
];

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
const rec = (name: string, ok: boolean, detail: string) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
};

console.log(`[ui-audit-lite] GET ${BASE}/play`);
let res: Response;
try {
  res = await fetch(`${BASE}/play`);
} catch (e) {
  console.error(`unreachable: ${e}`);
  process.exit(2);
}
rec("GET /play returns 200", res.status === 200, `status=${res.status}`);
const html = await res.text();
rec("response looks like HTML", /<html/i.test(html), `${html.length} bytes`);

// Parse via Bun's HTMLRewriter — streaming SAX-style, no JSDOM dep.
const foundIds = new Set<string>();
let scriptCount = 0;
const rewriter = new HTMLRewriter();
rewriter.on("[id]", {
  element(el) {
    const id = el.getAttribute("id");
    if (id) foundIds.add(id);
  },
});
rewriter.on("script[src]", {
  element() {
    scriptCount += 1;
  },
});
await rewriter.transform(new Response(html)).text();

for (const id of REQUIRED_IDS) {
  rec(`#${id} present`, foundIds.has(id), foundIds.has(id) ? "" : "missing from served HTML");
}
rec("gameplay scripts referenced", scriptCount > 5, `found ${scriptCount} <script src>`);
rec(
  "state.js referenced (exposes __rbGameState)",
  html.includes("js/gameplay/state.js"),
  "",
);

// Card DB sanity — server prints "958 cards loaded" on boot; verify via API.
try {
  const cardsRes = await fetch(`${BASE}/api/cards`);
  if (cardsRes.ok) {
    const body = (await cardsRes.json()) as unknown;
    const n = Array.isArray(body)
      ? body.length
      : Array.isArray((body as { cards?: unknown[] }).cards)
        ? (body as { cards: unknown[] }).cards.length
        : -1;
    rec("card database reachable", n > 0, `count=${n}`);
  } else {
    rec("card database reachable", false, `status=${cardsRes.status}`);
  }
} catch (e) {
  rec("card database reachable", false, String(e));
}

const fails = checks.filter((c) => !c.ok);
console.log(`\n[ui-audit-lite] ${checks.length - fails.length}/${checks.length} passed`);
process.exit(fails.length ? 1 : 0);
