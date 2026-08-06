/**
 * Node-hosted Playwright ("bridge" transport).
 *
 * Spawns `node pw-bridge.mjs` (Playwright + Chromium live in that process,
 * where Playwright's browser transport is dependable) and proxies the small
 * `PwPage` surface over NDJSON on stdio. Every call carries its own timeout;
 * if the child dies all pending calls reject; `shutdown()` kills the tree.
 */

import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HarnessError } from "../types";
import type { LaunchedBrowser, PwLocator, PwPage } from "./playwright-loader";
import { playwrightCandidates } from "./playwright-loader";

interface Pending {
  resolve(v: unknown): void;
  reject(e: unknown): void;
  timer: ReturnType<typeof setTimeout>;
  op: string;
}

const BRIDGE_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "pw-bridge.mjs");

class BridgeClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private exited = false;
  readonly pageErrors: string[] = [];
  readonly stderr: string[] = [];
  private readonly listeners = new Map<string, ((arg: unknown) => void)[]>();

  constructor(nodeBin: string, private readonly defaultTimeoutMs: number) {
    this.child = spawn(nodeBin, [BRIDGE_SCRIPT, JSON.stringify({ candidates: playwrightCandidates() })], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const rl = createInterface({ input: this.child.stdout });
    rl.on("line", (line) => this.onLine(line));
    this.child.stderr.on("data", (d: Buffer) => {
      this.stderr.push(d.toString());
      if (this.stderr.length > 50) {
        this.stderr.splice(0, this.stderr.length - 50);
      }
    });
    this.child.on("exit", (code, signal) => {
      this.exited = true;
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new HarnessError({ code: "TIMEOUT", detail: { code, signal, stderr: this.stderr.slice(-5) }, message: `playwright bridge exited during ${p.op}` }));
      }
      this.pending.clear();
    });
  }

  private onLine(line: string): void {
    let msg: { id?: number; ok?: boolean; result?: unknown; error?: string; name?: string; event?: string; text?: string; level?: string };
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.event) {
      const text = `${msg.event}${msg.level ? `(${msg.level})` : ""}: ${msg.text ?? ""}`;
      if (msg.event !== "console" || msg.level === "error") {
        this.pageErrors.push(text);
      }
      for (const h of this.listeners.get(msg.event) ?? []) {
        h(msg.event === "console" ? { text: () => msg.text ?? "", type: () => msg.level ?? "log" } : msg.text);
      }
      return;
    }
    if (typeof msg.id !== "number") {
      return;
    }
    const p = this.pending.get(msg.id);
    if (!p) {
      return;
    }
    this.pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.ok) {
      p.resolve(msg.result);
    } else {
      const err = new Error(msg.error ?? "bridge error");
      err.name = msg.name ?? "Error";
      p.reject(err);
    }
  }

  on(event: string, handler: (arg: unknown) => void): void {
    const list = this.listeners.get(event) ?? [];
    list.push(handler);
    this.listeners.set(event, list);
  }

  call<T>(op: string, args: Record<string, unknown> = {}, timeoutMs?: number): Promise<T> {
    if (this.exited) {
      return Promise.reject(new HarnessError({ code: "TIMEOUT", message: `playwright bridge is gone (${op})` }));
    }
    const id = this.nextId++;
    // Our own deadline sits a little past the bridge-side Playwright timeout so its (better) error wins.
    const ms = (timeoutMs ?? this.defaultTimeoutMs) + 2_000;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new HarnessError({ code: "TIMEOUT", detail: { op }, message: `${op}: no answer from the playwright bridge within ${ms}ms` }));
      }, ms);
      this.pending.set(id, { op, reject, resolve: resolve as (v: unknown) => void, timer });
      this.child.stdin.write(`${JSON.stringify({ args, id, op })}\n`);
    });
  }

  get alive(): boolean {
    return !this.exited;
  }

  async kill(): Promise<void> {
    if (this.exited) {
      return;
    }
    await this.call("close", {}, 9_000).catch(() => undefined);
    if (!this.exited) {
      this.child.kill("SIGTERM");
      await new Promise<void>((r) => {
        const t = setTimeout(() => {
          this.child.kill("SIGKILL");
          r();
        }, 3_000);
        this.child.once("exit", () => {
          clearTimeout(t);
          r();
        });
      });
    }
  }
}

class RemoteLocator implements PwLocator {
  constructor(
    private readonly client: BridgeClient,
    readonly selector: string,
  ) {}
  first(): PwLocator {
    return this; // bridge ops always act on the first match
  }
  count(): Promise<number> {
    return this.client.call<number>("count", { selector: this.selector });
  }
  async click(opts: { timeout?: number; force?: boolean; position?: { x: number; y: number } } = {}): Promise<void> {
    await this.client.call("click", { force: opts.force, position: opts.position, selector: this.selector, timeout: opts.timeout ?? 1500 }, (opts.timeout ?? 1500) + 500);
  }
  async dragTo(target: PwLocator, opts: { timeout?: number } = {}): Promise<void> {
    const to = (target as RemoteLocator).selector;
    await this.client.call("dragTo", { from: this.selector, timeout: opts.timeout ?? 3000, to }, (opts.timeout ?? 3000) + 500);
  }
  getAttribute(name: string): Promise<string | null> {
    return this.client.call<string | null>("getAttribute", { name, selector: this.selector });
  }
  isVisible(): Promise<boolean> {
    return this.client.call<boolean>("isVisible", { selector: this.selector });
  }
}

class RemotePage implements PwPage {
  private lastUrl = "";
  private closed = false;
  constructor(private readonly client: BridgeClient) {}
  readonly keyboard = { press: async (key: string) => void (await this.client.call("press", { key })) };
  readonly mouse = { click: async (x: number, y: number) => void (await this.client.call("mouseClick", { x, y })) };
  async goto(url: string, opts: { waitUntil?: string; timeout?: number } = {}): Promise<unknown> {
    const timeout = opts.timeout ?? 20_000;
    await this.client.call("goto", { timeout, url, waitUntil: opts.waitUntil }, timeout);
    this.lastUrl = url;
    return null;
  }
  evaluate<R = unknown>(script: string): Promise<R> {
    return this.client.call<R>("evaluate", { script });
  }
  async waitForFunction(script: string, _arg?: unknown, opts: { timeout?: number; polling?: number | "raf" } = {}): Promise<unknown> {
    const timeout = opts.timeout ?? 8000;
    return this.client.call("waitForFunction", { polling: opts.polling === "raf" ? undefined : opts.polling, script, timeout }, timeout);
  }
  waitForTimeout(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
  async addInitScript(script: { content: string } | string): Promise<void> {
    await this.client.call("addInitScript", { content: typeof script === "string" ? script : script.content });
  }
  locator(selector: string): PwLocator {
    return new RemoteLocator(this.client, selector);
  }
  screenshot(opts: { path: string; fullPage?: boolean }): Promise<unknown> {
    return this.client.call("screenshot", opts, 15_000);
  }
  url(): string {
    return this.lastUrl;
  }
  async close(): Promise<void> {
    this.closed = true;
    await this.client.kill();
  }
  isClosed(): boolean {
    return this.closed || !this.client.alive;
  }
  on(event: string, handler: (arg: unknown) => void): void {
    this.client.on(event, handler);
  }
  async route(pattern: string | RegExp, _handler: unknown): Promise<void> {
    // Only abort-routes are supported over the bridge (that is all the backend uses).
    await this.client.call("routeAbort", { pattern: typeof pattern === "string" ? pattern : pattern.source });
  }
}

/** `node` on PATH (or RB_NODE)? */
export function nodeBinary(): string | undefined {
  const explicit = process.env.RB_NODE;
  if (explicit) {
    return explicit;
  }
  const which = (globalThis as { Bun?: { which(bin: string): string | null } }).Bun?.which?.("node");
  return which ?? "node";
}

export async function launchNodeBridge(opts: { headless?: boolean; viewport?: { width: number; height: number }; timeoutMs?: number } = {}): Promise<LaunchedBrowser> {
  const node = nodeBinary();
  if (!node) {
    throw new HarnessError({ code: "ILLEGAL_ARGS", message: "node is not on PATH (set RB_NODE or use transport 'bun')" });
  }
  const client = new BridgeClient(node, opts.timeoutMs ?? 8000);
  try {
    await client.call("launch", { headless: opts.headless ?? true, timeout: 30_000, viewport: opts.viewport }, 35_000);
  } catch (error) {
    await client.kill();
    throw new HarnessError({
      code: "ILLEGAL_ARGS",
      detail: { stderr: client.stderr.slice(-5) },
      message: `playwright bridge failed to launch chromium: ${(error as Error).message}`,
    });
  }
  const page = new RemotePage(client);
  return { page, pageErrors: client.pageErrors, shutdown: () => client.kill(), transport: "node" };
}
