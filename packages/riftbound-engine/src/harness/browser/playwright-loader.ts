/**
 * Lazy Playwright resolution + the minimal structural surface the
 * BrowserBackend needs.
 *
 * Playwright is NOT a dependency of this package. It is resolved at runtime
 * from (in order): `RB_PLAYWRIGHT_MODULE` (absolute path to a playwright
 * entry file or package dir), a bare `playwright` import (if the workspace
 * happens to have it), then the pw-repl checkout at /tmp/pwtest.
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

/** Subset of playwright's Page we use (kept structural so no types dep is needed). */
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
    connectOverCDP?(endpoint: string, opts?: { timeout?: number }): Promise<PwBrowser>;
    executablePath?(): string;
  };
}

export interface LaunchedBrowser {
  readonly browser: PwBrowser;
  readonly transport: "pipe" | "cdp";
  /** Close gracefully, then make sure the process is gone. Never throws. */
  shutdown(): Promise<void>;
}

/**
 * Start Chromium.
 *
 *  - "cdp" (default): spawn the browser ourselves with --remote-debugging-port
 *    and `connectOverCDP` over a WebSocket. Under Bun, Playwright's default
 *    stdio-pipe transport was observed to wedge sporadically mid-session
 *    (every call, even browser.close(), stops answering); the WS transport
 *    avoids that code path and lets us SIGKILL the process on shutdown.
 *  - "pipe": plain `chromium.launch()`.
 */
export async function launchChromium(
  pw: PwModule,
  opts: { headless?: boolean; transport?: "pipe" | "cdp"; timeoutMs?: number } = {},
): Promise<LaunchedBrowser> {
  const transport = opts.transport ?? (process.env.RB_BROWSER_TRANSPORT as "pipe" | "cdp" | undefined) ?? "cdp";
  const timeout = opts.timeoutMs ?? 30_000;
  if (transport === "pipe" || !pw.chromium.connectOverCDP || !pw.chromium.executablePath) {
    const browser = await pw.chromium.launch({ headless: opts.headless ?? true, timeout });
    return {
      browser,
      shutdown: () => withTimeout(browser.close(), 10_000, "browser.close").catch(() => undefined),
      transport: "pipe",
    };
  }

  const { spawn } = await import("node:child_process");
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const full = pw.chromium.executablePath();
  // Prefer the lighter headless shell that ships next to the full build.
  const shell = full.replace(/chromium-(\d+)\/chrome-linux64\/chrome$/, "chromium_headless_shell-$1/chrome-headless-shell-linux64/chrome-headless-shell");
  const exe = opts.headless === false ? full : fs.existsSync(shell) ? shell : full;
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "rb-harness-chromium-"));
  const args = [
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--mute-audio",
    ...(opts.headless === false ? [] : exe === full ? ["--headless=new"] : ["--headless"]),
    "about:blank",
  ];
  const child = spawn(exe, args, { stdio: ["ignore", "ignore", "pipe"] });
  const cleanup = () => {
    try {
      fs.rmSync(userDataDir, { force: true, recursive: true });
    } catch {
      /* best effort */
    }
  };
  const endpoint = await new Promise<string>((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new HarnessError({ code: "TIMEOUT", message: `chromium did not print a DevTools endpoint within ${timeout}ms` })), timeout);
    child.stderr?.on("data", (d: Buffer) => {
      buf += d.toString();
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m?.[1]) {
        clearTimeout(timer);
        resolve(m[1]);
      }
      if (buf.length > 64_000) {
        buf = buf.slice(-8_000);
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new HarnessError({ code: "ILLEGAL_ARGS", detail: { exe, stderr: buf.slice(-2000) }, message: `chromium exited early (code ${String(code)})` }));
    });
  }).catch((error) => {
    child.kill("SIGKILL");
    cleanup();
    throw error;
  });
  let browser: PwBrowser;
  try {
    browser = await pw.chromium.connectOverCDP(endpoint, { timeout });
  } catch (error) {
    child.kill("SIGKILL");
    cleanup();
    throw error;
  }
  return {
    browser,
    shutdown: async () => {
      await withTimeout(browser.close(), 5_000, "browser.close").catch(() => undefined);
      if (child.exitCode === null) {
        child.kill("SIGTERM");
        await new Promise<void>((r) => {
          const t = setTimeout(() => {
            child.kill("SIGKILL");
            r();
          }, 3_000);
          child.once("exit", () => {
            clearTimeout(t);
            r();
          });
        });
      }
      cleanup();
    },
    transport: "cdp",
  };
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

/** Resolve the playwright module or throw a HarnessError explaining how to point at one. */
export function loadPlaywright(): Promise<PwModule> {
  if (!cached) {
    cached = (async () => {
      const candidates = [process.env.RB_PLAYWRIGHT_MODULE, "playwright", ...FALLBACK_PATHS].filter(
        (s): s is string => typeof s === "string" && s.length > 0,
      );
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
