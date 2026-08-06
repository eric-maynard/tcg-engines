#!/usr/bin/env node
/**
 * Playwright bridge: a tiny NDJSON RPC server so the harness (running under
 * Bun) can drive Chromium through Playwright running under Node, where its
 * browser transport is reliable. One browser + one page per process.
 *
 *   argv[2] = JSON { candidates: [module specifiers/paths to try for playwright] }
 *   stdin   ← {"id":n,"op":"evaluate","args":{...}}\n
 *   stdout  → {"id":n,"ok":true,"result":...}\n | {"id":n,"ok":false,"error":"...","name":"..."}\n
 *             {"event":"console"|"pageerror"|"dialog","text":"..."}\n   (unsolicited)
 *
 * Plain .mjs (no TS) so `node` runs it directly from the source tree.
 */

import { createInterface } from "node:readline";

const cfg = JSON.parse(process.argv[2] || "{}");
const out = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);

async function loadPw() {
  const tried = [];
  for (const spec of cfg.candidates || ["playwright"]) {
    if (!spec) continue;
    tried.push(spec);
    try {
      const mod = await import(spec);
      const chromium = mod.chromium || (mod.default && mod.default.chromium);
      if (chromium) return { chromium };
    } catch {
      /* next */
    }
  }
  throw new Error(`playwright not resolvable from node; tried ${tried.join(", ")}`);
}

let browser = null;
let page = null;

const first = (sel) => page.locator(sel).first();

const ops = {
  async launch(a) {
    const pw = await loadPw();
    browser = await pw.chromium.launch({ headless: a.headless !== false, timeout: a.timeout || 30000 });
    page = await browser.newPage({ viewport: a.viewport || { width: 1440, height: 900 } });
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") out({ event: "console", level: m.type(), text: m.text() });
    });
    page.on("pageerror", (e) => out({ event: "pageerror", text: String(e) }));
    page.on("dialog", (d) => {
      out({ event: "dialog", text: d.message() });
      d.dismiss().catch(() => {});
    });
    page.on("crash", () => out({ event: "crash", text: "page crashed" }));
    return true;
  },
  async goto(a) {
    await page.goto(a.url, { waitUntil: a.waitUntil || "load", timeout: a.timeout || 20000 });
    return true;
  },
  async evaluate(a) {
    return (await page.evaluate(a.script)) ?? null;
  },
  async waitForFunction(a) {
    await page.waitForFunction(a.script, undefined, { timeout: a.timeout || 8000, polling: a.polling || 30 });
    return true;
  },
  async addInitScript(a) {
    await page.addInitScript({ content: a.content });
    return true;
  },
  async click(a) {
    await first(a.selector).click({ timeout: a.timeout || 1500, position: a.position, force: a.force });
    return true;
  },
  async count(a) {
    return page.locator(a.selector).count();
  },
  async isVisible(a) {
    return first(a.selector).isVisible();
  },
  async getAttribute(a) {
    return first(a.selector).getAttribute(a.name);
  },
  async dragTo(a) {
    await first(a.from).dragTo(first(a.to), { timeout: a.timeout || 3000 });
    return true;
  },
  async press(a) {
    await page.keyboard.press(a.key);
    return true;
  },
  async mouseClick(a) {
    await page.mouse.click(a.x, a.y);
    return true;
  },
  async screenshot(a) {
    await page.screenshot({ path: a.path, fullPage: !!a.fullPage });
    return a.path;
  },
  async url() {
    return page ? page.url() : "";
  },
  async routeAbort(a) {
    await page.route(a.pattern, (r) => r.abort());
    return true;
  },
  async close() {
    const b = browser;
    browser = null;
    page = null;
    if (b) await Promise.race([b.close(), new Promise((r) => setTimeout(r, 8000))]);
    setTimeout(() => process.exit(0), 20);
    return true;
  },
};

const rl = createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const { id, op, args } = msg;
  const fn = ops[op];
  if (!fn) {
    out({ id, ok: false, error: `unknown op ${op}`, name: "BadOp" });
    return;
  }
  try {
    if (op !== "launch" && op !== "close" && !page) throw new Error("no page (launch first)");
    const result = await fn(args || {});
    out({ id, ok: true, result: result === undefined ? null : result });
  } catch (e) {
    out({ id, ok: false, error: String((e && e.message) || e), name: (e && e.name) || "Error" });
  }
});
rl.on("close", async () => {
  try {
    if (browser) await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 5000))]);
  } finally {
    process.exit(0);
  }
});
process.on("SIGTERM", () => process.exit(0));
