/**
 * Gate for the live-app BrowserBackend suite: runs only when
 * RB_BROWSER_TESTS=1 AND an app answers on RB_BROWSER_URL (default
 * http://localhost:3000) AND Playwright resolves. Otherwise every describe
 * in this directory is skipped so the default engine run stays hermetic.
 */

import { describe } from "bun:test";
import { BrowserBackend, loadPlaywright } from "../../harness/browser";

export const BASE_URL = process.env.RB_BROWSER_URL ?? "http://localhost:3000";

async function gate(): Promise<{ enabled: boolean; reason?: string }> {
  if (process.env.RB_BROWSER_TESTS !== "1") {
    return { enabled: false, reason: "RB_BROWSER_TESTS != 1" };
  }
  if (!(await BrowserBackend.probe(BASE_URL))) {
    return { enabled: false, reason: `no app on ${BASE_URL}` };
  }
  try {
    await loadPlaywright();
  } catch (error) {
    return { enabled: false, reason: `playwright: ${(error as Error).message}` };
  }
  return { enabled: true };
}

export const GATE = await gate();

if (!GATE.enabled && process.env.RB_BROWSER_TESTS === "1") {
  console.warn(`[harness-browser] skipped: ${GATE.reason}`);
}

/** `describe` when the live suite is enabled, else `describe.skip`. */
export const describeLive: typeof describe = (GATE.enabled ? describe : describe.skip) as typeof describe;

/** Per-test timeout for live tests (browser launch + several server round-trips). */
export const LIVE_TIMEOUT = 90_000;
