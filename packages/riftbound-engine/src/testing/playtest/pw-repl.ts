#!/usr/bin/env bun
/**
 * Playwright REPL server. Holds one browser page open and accepts commands
 * over a unix socket so an agent can drive the UI interactively across
 * multiple Bash calls without relaunching chromium each time.
 *
 * Start:   bun pw-repl.ts start &   (writes /tmp/pw-repl.sock)
 * Client:  bun pw-repl.ts <cmd> [args...]
 *
 * Commands:
 *   goto <url>
 *   click <sel>
 *   fill <sel> <text>
 *   drag <selA> <selB>
 *   key <key>
 *   wait <ms>
 *   shot <path>
 *   state            -- dumps __rbGameState summary as JSON
 *   moves            -- __rbAvailableMoves
 *   dom <sel>        -- textContent of first match
 *   eval <expr>      -- page.evaluate(expr), returns JSON
 *   reset            -- newPage
 *   quit
 */
import { chromium, type Page } from "playwright";
import * as net from "node:net";
import { unlinkSync, existsSync } from "node:fs";

const sockIdx = process.argv.indexOf("--sock");
const SOCK = sockIdx >= 0 ? `/tmp/pw-repl-${process.argv[sockIdx + 1]}.sock` : "/tmp/pw-repl.sock";
const cmdArgv = process.argv.filter((_, i) => i !== sockIdx && i !== sockIdx + 1);

if (cmdArgv[2] === "start") {
  if (existsSync(SOCK)) unlinkSync(SOCK);
  const b = await chromium.launch();
  let p: Page = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs: string[] = [];
  const wire = (pg: Page) => {
    pg.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
    pg.on("pageerror", e => errs.push(String(e)));
  };
  wire(p);

  const handle = async (line: string): Promise<string> => {
    const [cmd, ...rest] = line.trim().split(/\s+/);
    const arg = rest.join(" ");
    try {
      switch (cmd) {
        case "goto": await p.goto(arg, { waitUntil: "networkidle", timeout: 15000 }); return "ok";
        case "click": await p.locator(arg).first().click({ timeout: 5000 }); return "ok";
        case "fill": { const i = arg.indexOf(" "); await p.fill(arg.slice(0, i), arg.slice(i + 1)); return "ok"; }
        case "drag": { const i = arg.indexOf(" "); await p.locator(arg.slice(0, i)).first().dragTo(p.locator(arg.slice(i + 1)).first(), { timeout: 5000 }); return "ok"; }
        case "key": await p.keyboard.press(arg); return "ok";
        case "wait": await p.waitForTimeout(parseInt(arg, 10)); return "ok";
        case "shot": await p.screenshot({ path: arg }); return arg;
        case "dom": return (await p.locator(arg).first().textContent({ timeout: 2000 }).catch(() => "")) || "";
        case "eval": return JSON.stringify(await p.evaluate(arg));
        case "errs": { const e = errs.splice(0); return JSON.stringify(e); }
        case "state": return JSON.stringify(await p.evaluate(() => {
          const gs = (window as any).__rbGameState;
          if (!gs) return null;
          const zone = (z: string) => (gs.zones?.[z] || []).map((c: any) => ({ id: c.id, name: c.name, type: c.cardType, cost: c.energyCost, might: c.might, exhausted: c.meta?.exhausted, rulesText: c.rulesText }));
          return {
            turn: gs.turn, status: gs.status, energy: gs.runePools?.["player-1"]?.energy, power: gs.runePools?.["player-1"]?.power,
            hand: zone("hand").filter((c: any) => c.id.startsWith("player-1")), base: zone("base"), runePool: zone("runePool"),
            trash: zone("trash").length, pendingChoice: gs.pendingChoice, chain: gs.interaction?.chain?.items,
            bfZones: Object.fromEntries(Object.keys(gs.zones || {}).filter(k => k.startsWith("battlefield-")).map(k => [k, zone(k)])),
          };
        }));
        case "moves": return JSON.stringify(await p.evaluate(() => ((window as any).__rbAvailableMoves || []).map((m: any) => ({ moveId: m.moveId, params: m.params }))));
        case "reset": await p.close(); p = await b.newPage({ viewport: { width: 1440, height: 900 } }); wire(p); return "ok";
        case "quit": setTimeout(() => process.exit(0), 100); return "bye";
        default: return `err: unknown cmd ${cmd}`;
      }
    } catch (e) { return `err: ${String(e).slice(0, 300)}`; }
  };

  const srv = net.createServer(sock => {
    let buf = "";
    sock.on("data", async d => {
      buf += d.toString();
      const nl = buf.indexOf("\n");
      if (nl < 0) return;
      const line = buf.slice(0, nl); buf = "";
      const out = await handle(line);
      sock.write(out + "\n");
      sock.end();
    });
  });
  srv.listen(SOCK, () => console.log(`pw-repl listening on ${SOCK}`));
} else {
  // Client mode
  const line = cmdArgv.slice(2).join(" ") + "\n";
  const sock = net.createConnection(SOCK);
  sock.on("connect", () => sock.write(line));
  let out = "";
  sock.on("data", d => { out += d.toString(); });
  sock.on("end", () => { process.stdout.write(out); });
  sock.on("error", e => { console.error(String(e)); process.exit(1); });
}
