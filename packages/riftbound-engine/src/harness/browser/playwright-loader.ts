/**
 * Playwright plumbing for the BrowserBackend:
 *
 *  - the minimal structural page/locator surface we use (`PwPage`) — no
 *    Playwright types dependency;
 *  - lazy resolution of the playwright module (NOT a dependency of this
 *    package): `RB_PLAYWRIGHT_MODULE`, bare `playwright`, then the pw-repl
 *    checkout at /tmp/pwtest;
 *  - `withTimeout` / `guardPage` so calls without native timeouts are bounded;
 *  - `launchInProcess()` — chromium driven by Playwright inside this (Bun)
 *    process. See bridge.ts for the default, more robust Node-hosted transport.
 */

import { HarnessError } from "../types";

/** Subset of playwright's Locator we use. */
export interface PwLocator {
  first(): PwLocator;
  count(): Promise<number>;
  click(opts?: { timeout?: number; force?: boolean; position?: { x: number; y: number } }): Promise<void>;
  dragTo(target: PwLocator, opts?: { timeout?: number }): Promise<void>;
  getAttribute(name: string): Promise<string | null>;
  isVisible(): Promise<boolean>;
}

/** Subset of playwright's Page we use (kept structural and string-scripted so it can be proxied over RPC). */
export interface PwPage {
  goto(url: string, opts?: { waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit"; timeout?: number }): Promise<unknown>;
  evaluate<R = unknown>(script: string): Promise<R>;
  waitForFunction(script: string, arg?: unknown, opts?: { timeout?: number; polling?: number | "raf" }): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  addInitScript(script: { content: string } | string): Promise<void>;
  locator(selector: string): PwLocator;
  keyboard: { press(key: string): Promise<void> };
  mouse: { click(x: number, y: number): Promise<void> };
  screenshot(opts: { path: string; fullPage?: boolean }): Promise<unknown>;
  url(): string;
  close(): Promise<void>;
  isClosed(): boolean;
  on(event: string, handler: (arg: unknown) => void): void;
  /** Network interception (used to drop card art in headless runs). */
  route?(pattern: string | RegExp, handler: (route: { abort(): Promise<void>; continue(): Promise<void> }) => unknown): Promise<void>;
}

export interface PwBrowser {
  newPage(opts?: { viewport?: { width: number; height: number } }): Promise<PwPage>;
  close(): Promise<void>;
}

export interface PwModule {
  chromium: {
    launch(opts?: { headless?: boolean; args?: string[]; timeout?: number }): Promise<PwBrowser>;
    executablePath?(): string;
  };
}

/** A running browser with exactly one page, however it is hosted. */
export interface LaunchedBrowser {
  readonly page: PwPage;
  readonly transport: "bun" | "node";
  /** Page-side diagnostics (console errors, pageerrors, dialogs), newest last. */
  readonly pageErrors: string[];
  /** Close gracefully, then make sure everything is gone. Never throws. */
  shutdown(): Promise<void>;
}

/** Reject with HarnessError(TIMEOUT) if `p` does not settle within `ms` (Playwright calls without their own timeout can stall forever). */
export function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const bomb = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new HarnessError({ code: "TIMEOUT", detail: { ms, what }, message: `${what}: no answer from the browser within ${ms}ms` })), ms);
  });
  return Promise.race([p, bomb]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/**
 * Wrap a page so every call that has no native timeout (evaluate, keyboard,
 * mouse, screenshot, addInitScript, locator.count/getAttribute/isVisible) is
 * bounded by `ms`. Calls with native timeouts pass through.
 */
export function guardPage(page: PwPage, ms: number): PwPage {
  const wrapLocator = (loc: PwLocator, sel: string): PwLocator => ({
    click: (o) => loc.click(o),
    count: () => withTimeout(loc.count(), ms, `locator(${sel}).count`),
    dragTo: (target, o) => loc.dragTo((target as PwLocator & { __raw?: PwLocator }).__raw ?? target, o),
    first: () => wrapLocator(loc.first(), sel),
    getAttribute: (n) => withTimeout(loc.getAttribute(n), ms, `locator(${sel}).getAttribute`),
    isVisible: () => withTimeout(loc.isVisible(), ms, `locator(${sel}).isVisible`),
    ...({ __raw: loc } as object),
  });
  return {
    addInitScript: (s) => withTimeout(page.addInitScript(s), ms, "addInitScript"),
    close: () => withTimeout(page.close(), ms, "page.close"),
    evaluate: <R>(s: string) => withTimeout(page.evaluate<R>(s), ms, `evaluate(${s.slice(0, 60).replace(/\s+/g, " ")}…)`),
    goto: (u, o) => page.goto(u, o),
    isClosed: () => page.isClosed(),
    keyboard: { press: (k) => withTimeout(page.keyboard.press(k), ms, `keyboard.press(${k})`) },
    locator: (sel) => wrapLocator(page.locator(sel), sel),
    mouse: { click: (x, y) => withTimeout(page.mouse.click(x, y), ms, "mouse.click") },
    on: (e, h) => page.on(e, h),
    route: page.route ? (pat, h) => withTimeout((page.route as NonNullable<PwPage["route"]>).call(page, pat, h), ms, "route") : undefined,
    screenshot: (o) => withTimeout(page.screenshot(o), ms, "screenshot"),
    url: () => page.url(),
    waitForFunction: (s, a, o) => page.waitForFunction(s, a, o),
    waitForTimeout: (n) => page.waitForTimeout(n),
  };
}

const FALLBACK_PATHS = ["/tmp/pwtest/node_modules/playwright/index.mjs", "/tmp/pwtest/node_modules/playwright"];

/** Module specifiers/paths tried (in order) to resolve playwright, here and in the Node bridge. */
export function playwrightCandidates(): string[] {
  return [process.env.RB_PLAYWRIGHT_MODULE, "playwright", ...FALLBACK_PATHS].filter(
    (s): s is string => typeof s === "string" && s.length > 0,
  );
}

let cached: Promise<PwModule> | undefined;

async function tryImport(spec: string): Promise<PwModule | undefined> {
  try {
    const mod = (await import(spec)) as Partial<PwModule> & { default?: Partial<PwModule> };
    const chromium = mod.chromium ?? mod.default?.chromium;
    return chromium ? ({ chromium } as PwModule) : undefined;
  } catch {
    return undefined;
  }
}

/** Resolve the playwright module in THIS process or throw a HarnessError explaining how to point at one. */
export function loadPlaywright(): Promise<PwModule> {
  if (!cached) {
    cached = (async () => {
      const candidates = playwrightCandidates();
      for (const spec of candidates) {
        const mod = await tryImport(spec);
        if (mod) {
          return mod;
        }
      }
      cached = undefined;
      throw new HarnessError({
        code: "ILLEGAL_ARGS",
        detail: { tried: candidates },
        message:
          "Playwright is not resolvable. Set RB_PLAYWRIGHT_MODULE to an installed playwright entry (e.g. /path/node_modules/playwright/index.mjs) or pass an existing `page` to BrowserBackend.launch()",
      });
    })();
  }
  return cached;
}

/**
 * Chromium driven by Playwright inside this process (`chromium.launch()`,
 * stdio-pipe transport). Under Bun this transport was observed to wedge
 * sporadically (every call — even browser.close() — stops answering); prefer
 * the Node bridge (bridge.ts) when `node` is available.
 */
export async function launchInProcess(opts: { headless?: boolean; viewport?: { width: number; height: number }; timeoutMs?: number } = {}): Promise<LaunchedBrowser> {
  const pw = await loadPlaywright();
  const browser = await pw.chromium.launch({ headless: opts.headless ?? true, timeout: opts.timeoutMs ?? 30_000 });
  let page: PwPage;
  try {
    page = await browser.newPage({ viewport: opts.viewport ?? { height: 900, width: 1440 } });
  } catch (error) {
    await browser.close().catch(() => undefined);
    throw error;
  }
  const pageErrors: string[] = [];
  page.on("console", (m) => {
    const msg = m as { type(): string; text(): string };
    if (msg.type() === "error") {
      pageErrors.push(`console: ${msg.text()}`);
    }
  });
  page.on("pageerror", (e) => pageErrors.push(`pageerror: ${String(e)}`));
  return {
    page,
    pageErrors,
    shutdown: () => withTimeout(browser.close(), 10_000, "browser.close").catch(() => undefined),
    transport: "bun",
  };
}
